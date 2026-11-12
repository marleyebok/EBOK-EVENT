/**
 * Signalements d'événements — internes, sans e-mail.
 *
 *   POST   /api/signalement  {eventId, motif, message}        → public (compte facultatif)
 *   GET    /api/signalement                                    (admin) → la liste
 *   GET    /api/signalement?ouverts=1                          (admin) → {ouverts: n}, pour la pastille
 *   PATCH  /api/signalement?id=X  {statut: "traite"|"ouvert"}  (admin)
 *   DELETE /api/signalement?id=X                               (admin)
 *
 * Un visiteur qui voit une erreur sur une fiche (date fausse, événement annulé,
 * doublon…) la signale depuis la fiche, sans compte : la plupart des visiteurs
 * n'en ont pas. L'admin retrouve les signalements dans son espace, sous les
 * événements en attente.
 *
 * ── Protection contre les abus ───────────────────────────────────────────────
 * La route est publique, donc elle se défend seule :
 *   - le motif doit être l'un de ceux de la liste, le message est borné à 500
 *     caractères et nettoyé ;
 *   - on ne signale que les événements publiés ;
 *   - 10 signalements par visiteur et par jour au plus ;
 *   - le même visiteur ne peut pas signaler deux fois le même événement pour
 *     le même motif (la deuxième demande répond « ok » sans rien écrire).
 *
 * ── Vie privée ───────────────────────────────────────────────────────────────
 * Aucune adresse IP n'est stockée. Même principe que api/views.js : une
 * empreinte SHA-256 de (jour + secret serveur + IP + navigateur), tronquée, qui
 * ne sert qu'à limiter les abus. Elle est effacée au bout de 7 jours. Le
 * signalement reste jusqu'à son traitement, puis 90 jours (ou jusqu'à ce que
 * l'admin le supprime). Pour un membre
 * connecté, on garde son identifiant Clerk (jamais son e-mail ni son nom :
 * « zéro miroir »).
 *
 * La table est créée ici, au premier appel, et non dans ensureSchema() : une
 * erreur dans ce fichier ne doit pas pouvoir mettre hors service le reste de
 * l'API.
 */
import { createHash } from "node:crypto";
import { ensureSchema, hasDb, sql, json, readBody, newId, sessionUid, isAdminUid } from "./_lib.js";

/** Motifs acceptés. Les libellés affichés vivent dans public/js/app.js. */
const MOTIFS = ["infos", "annule", "doublon", "abus", "autre"];
const MAX_PAR_JOUR = 10;
const MAX_MESSAGE = 500;
const RETENTION_JOURS = 7;           // empreintes du visiteur
const RETENTION_TRAITES_JOURS = 90;  // signalements traités

let tableCreee = false;
async function ensureTable() {
  if (tableCreee) return;
  const q = sql();
  await q`
    CREATE TABLE IF NOT EXISTS event.signalements (
      id         TEXT PRIMARY KEY,
      event_id   TEXT NOT NULL,
      motif      TEXT NOT NULL,
      message    TEXT NOT NULL DEFAULT '',
      user_id    TEXT,
      visiteur   TEXT NOT NULL DEFAULT '',
      statut     TEXT NOT NULL DEFAULT 'ouvert',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      traite_at  TIMESTAMPTZ
    )`;
  await q`CREATE INDEX IF NOT EXISTS signalements_statut_idx ON event.signalements (statut, created_at DESC)`;
  tableCreee = true;
}

/** Empreinte non réversible du visiteur pour la journée (cf. api/views.js). */
function empreinteVisiteur(req) {
  const jour = new Date().toISOString().slice(0, 10);
  const transmise = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = transmise || req.socket?.remoteAddress || "inconnue";
  const ua = String(req.headers["user-agent"] || "");
  const secret = process.env.CLERK_SECRET_KEY || process.env.DATABASE_URL || "ebok-event";
  return createHash("sha256").update(`${jour}|${secret}|${ip}|${ua}`).digest("hex").slice(0, 32);
}

/** Texte libre : sans caractères de contrôle, espaces de bord retirés, borné. */
function nettoyer(texte) {
  return String(texte == null ? "" : texte)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, MAX_MESSAGE);
}

async function creer(req, res) {
  const body = await readBody(req);
  const eventId = String(body.eventId || "").slice(0, 200);
  const motif = String(body.motif || "");
  const message = nettoyer(body.message);
  if (!eventId) return json(res, 400, { error: "id" });
  if (!MOTIFS.includes(motif)) return json(res, 400, { error: "motif" });
  if (motif === "autre" && message.length < 5) return json(res, 400, { error: "precisez" });

  const publie = await sql()`SELECT id FROM event.events WHERE id = ${eventId} AND status = 'approved'`;
  if (!publie[0]) return json(res, 404, { error: "introuvable" });

  const visiteur = empreinteVisiteur(req);
  const deja = await sql()`
    SELECT 1 FROM event.signalements
    WHERE visiteur = ${visiteur} AND event_id = ${eventId} AND motif = ${motif} LIMIT 1`;
  if (deja[0]) return json(res, 200, { ok: true });

  const [{ n }] = await sql()`SELECT count(*)::int AS n FROM event.signalements WHERE visiteur = ${visiteur}`;
  if (n >= MAX_PAR_JOUR) return json(res, 429, { error: "trop" });

  const uid = await sessionUid(req);
  await sql()`
    INSERT INTO event.signalements (id, event_id, motif, message, user_id, visiteur)
    VALUES (${newId()}, ${eventId}, ${motif}, ${message}, ${uid}, ${visiteur})`;

  // Purge opportuniste : pas de tâche planifiée à maintenir.
  if (Math.random() < 0.05) {
    await sql()`
      UPDATE event.signalements SET visiteur = ''
      WHERE visiteur <> '' AND created_at < now() - ${RETENTION_JOURS + " days"}::interval`;
    await sql()`
      DELETE FROM event.signalements
      WHERE statut = 'traite' AND traite_at < now() - ${RETENTION_TRAITES_JOURS + " days"}::interval`;
  }
  return json(res, 200, { ok: true });
}

export default async function handler(req, res) {
  if (!hasDb()) return json(res, 503, { error: "db_unavailable" });
  try {
    await ensureSchema();
    await ensureTable();
  } catch (e) {
    console.error("signalement schema:", e);
    return json(res, 500, { error: "schema" });
  }

  try {
    if (req.method === "POST") return await creer(req, res);

    // Tout le reste est réservé à l'admin, vérifié ici côté serveur.
    const uid = await sessionUid(req);
    if (!(await isAdminUid(uid))) return json(res, 403, { error: "admin" });
    const { id, ouverts } = req.query || {};

    if (req.method === "GET") {
      if (ouverts) {
        const [{ n }] = await sql()`SELECT count(*)::int AS n FROM event.signalements WHERE statut = 'ouvert'`;
        return json(res, 200, { ouverts: n });
      }
      const rows = await sql()`
        SELECT s.id, s.event_id, s.motif, s.message, (s.user_id IS NOT NULL) AS membre,
               s.statut, s.created_at, s.traite_at, e.data->>'title' AS titre
        FROM event.signalements s
        LEFT JOIN event.events e ON e.id = s.event_id
        ORDER BY (s.statut = 'ouvert') DESC, s.created_at DESC
        LIMIT 300`;
      const signalements = rows.map((r) => ({
        id: r.id,
        eventId: r.event_id,
        titre: r.titre || "",
        motif: r.motif,
        message: r.message,
        membre: Boolean(r.membre),
        statut: r.statut,
        createdAt: r.created_at,
        traiteAt: r.traite_at,
      }));
      return json(res, 200, { signalements, ouverts: signalements.filter((s) => s.statut === "ouvert").length });
    }

    if (!id) return json(res, 400, { error: "id" });

    if (req.method === "PATCH") {
      const { statut } = await readBody(req);
      if (statut !== "traite" && statut !== "ouvert") return json(res, 400, { error: "statut" });
      const maj = await sql()`
        UPDATE event.signalements
        SET statut = ${statut}::text,
            traite_at = CASE WHEN ${statut}::text = 'traite' THEN now() ELSE NULL END
        WHERE id = ${String(id)}
        RETURNING id`;
      if (!maj[0]) return json(res, 404, { error: "introuvable" });
      return json(res, 200, { ok: true });
    }

    if (req.method === "DELETE") {
      await sql()`DELETE FROM event.signalements WHERE id = ${String(id)}`;
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: "methode" });
  } catch (e) {
    console.error("signalement:", e);
    return json(res, 500, { error: "serveur" });
  }
}
