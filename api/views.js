/**
 * Compteurs de « curieux » (vues) par événement.
 *
 *   GET  /api/views?id=X   → lit le compteur (0 si absent)
 *   POST /api/views?id=X   → compte la visite et renvoie la valeur à jour
 *
 * Le compteur est public : il doit fonctionner sans compte, puisque la plupart
 * des visiteurs n'en ont pas. Il est donc protégé autrement.
 *
 * ── Ce qui a changé et pourquoi ──────────────────────────────────────────────
 * La route acceptait autrefois un paramètre `seed` fourni par le navigateur,
 * utilisé comme valeur de départ. Autrement dit, n'importe qui pouvait fixer le
 * compteur d'un événement jamais vu à la valeur de son choix. Le paramètre est
 * désormais ignoré : un compteur démarre toujours à 1.
 *
 * Elle incrémentait aussi à chaque requête, sans mémoire : une boucle suffisait
 * à gonfler un événement. On enregistre maintenant une empreinte du visiteur, et
 * une même personne n'est comptée qu'une fois par jour et par événement. Le
 * chiffre affiché correspond donc à des curieux distincts, pas à des requêtes —
 * ce qui le rend à la fois plus honnête et défendable face à un annonceur.
 *
 * ── Vie privée ───────────────────────────────────────────────────────────────
 * Aucune adresse IP n'est stockée. On conserve une empreinte SHA-256 de
 * (jour + secret serveur + IP + navigateur), tronquée, donc non réversible et
 * renouvelée chaque jour. Les lignes sont purgées au bout de 7 jours. Elle ne
 * sert qu'à éviter les doublons et les abus, jamais à suivre quelqu'un — à
 * mentionner dans la politique de confidentialité.
 */
import { createHash } from "node:crypto";
import { ensureSchema, hasDb, sql, json } from "./_lib.js";

/* Au-delà, on cesse de compter pour ce visiteur : un humain ne consulte pas
   150 fiches dans la journée, un script oui. Les visites continuent d'être
   servies normalement, elles ne sont simplement plus comptabilisées. */
const MAX_EVENEMENTS_PAR_JOUR = 150;

/* Durée de conservation des empreintes. Assez pour la déduplication
   quotidienne, assez court pour ne rien garder d'inutile. */
const RETENTION_JOURS = 7;

/** Jour courant en UTC, au format AAAA-MM-JJ. */
function jourCourant() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Empreinte non réversible du visiteur pour la journée.
 * Le sel change chaque jour : une empreinte d'hier ne peut pas être rapprochée
 * d'une empreinte d'aujourd'hui, même pour le même visiteur.
 */
function empreinteVisiteur(req, jour) {
  const transmise = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = transmise || req.socket?.remoteAddress || "inconnue";
  const ua = String(req.headers["user-agent"] || "");
  // Secret côté serveur : sans lui, l'empreinte serait devinable à partir d'une
  // IP. CLERK_SECRET_KEY n'est jamais exposée au navigateur.
  const secret = process.env.CLERK_SECRET_KEY || process.env.DATABASE_URL || "ebok-event";
  return createHash("sha256").update(`${jour}|${secret}|${ip}|${ua}`).digest("hex").slice(0, 32);
}

/** Lit le compteur d'un événement (0 s'il n'a jamais été vu). */
async function lireCompteur(id) {
  const rows = await sql()`SELECT count FROM event.views WHERE event_id = ${id}`;
  return rows[0] ? rows[0].count : 0;
}

export default async function handler(req, res) {
  if (!hasDb()) return json(res, 503, { error: "db_unavailable" });
  try {
    await ensureSchema();
  } catch (e) {
    console.error("views schema:", e);
    return json(res, 500, { error: "schema" });
  }

  const id = String((req.query || {}).id || "");
  if (!id) return json(res, 400, { error: "id" });

  try {
    if (req.method === "GET") {
      return json(res, 200, { count: await lireCompteur(id) });
    }

    if (req.method === "POST") {
      const jour = jourCourant();
      const visiteur = empreinteVisiteur(req, jour);

      // Purge opportuniste des vieilles empreintes : pas de tâche planifiée à
      // maintenir, et le coût reste négligeable réparti sur les requêtes.
      if (Math.random() < 0.02) {
        try {
          await sql()`DELETE FROM event.view_hits WHERE day < CURRENT_DATE - ${RETENTION_JOURS}::int`;
        } catch (e) {
          console.warn("views purge:", e);
        }
      }

      // Première visite de ce visiteur sur cet événement aujourd'hui ?
      // `ON CONFLICT DO NOTHING` rend l'opération atomique : deux requêtes
      // simultanées ne peuvent pas compter deux fois.
      const nouvelle = await sql()`
        INSERT INTO event.view_hits (event_id, visitor, day)
        VALUES (${id}, ${visiteur}, ${jour})
        ON CONFLICT DO NOTHING
        RETURNING event_id`;

      if (!nouvelle.length) {
        // Déjà compté aujourd'hui : on renvoie la valeur sans y toucher.
        return json(res, 200, { count: await lireCompteur(id), compte: false });
      }

      // Garde-fou contre un script qui ferait défiler les événements.
      const [{ n }] = await sql()`
        SELECT COUNT(*)::int AS n FROM event.view_hits
        WHERE visitor = ${visiteur} AND day = ${jour}`;
      if (n > MAX_EVENEMENTS_PAR_JOUR) {
        return json(res, 200, { count: await lireCompteur(id), compte: false });
      }

      // `seed` est volontairement ignoré : un compteur démarre à 1.
      const rows = await sql()`
        INSERT INTO event.views (event_id, count)
        VALUES (${id}, 1)
        ON CONFLICT (event_id) DO UPDATE SET count = event.views.count + 1
        RETURNING count`;
      return json(res, 200, { count: rows[0].count, compte: true });
    }

    return json(res, 405, { error: "method" });
  } catch (e) {
    console.error("views:", e);
    return json(res, 500, { error: "server" });
  }
}
