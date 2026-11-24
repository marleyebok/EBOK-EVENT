/**
 * Route des inscriptions — servie par api/events.js (`?module=inscriptions`).
 *
 * Pourquoi pas un fichier api/inscriptions.js ? Le projet a déjà 12 fonctions
 * serverless, la limite du plan gratuit de Vercel : une de plus et le
 * déploiement échoue. La route vit donc ici et api/events.js la délègue.
 *
 * Participant (compte EBOK requis) :
 *   GET    ?module=inscriptions&event=X          → état public + mon inscription
 *   POST   ?module=inscriptions&event=X {reponses} → m'inscrire
 *   DELETE ?module=inscriptions&event=X          → annuler mon inscription
 *   GET    ?module=inscriptions&mine=1           → mes inscriptions
 * Organisateur de l'événement (ou admin) :
 *   GET    ?module=inscriptions&event=X&gestion=1           → liste nominative
 *   GET    ?module=inscriptions&event=X&gestion=1&format=csv → export CSV
 *   DELETE ?module=inscriptions&event=X&inscrit=ID          → retirer un inscrit
 *   POST   ?module=inscriptions&event=X&envoi=1 {segment, sujet, corps} → e-mail groupé
 *
 * Places : la capacité est `placesTotal` (vide = illimité). Chaque écriture qui
 * peut changer le remplissage passe par un verrou Postgres propre à
 * l'événement (pg_advisory_xact_lock) : deux inscriptions simultanées sur la
 * dernière place ne peuvent pas toutes les deux être confirmées.
 */
import { sql, json, readBody, newId, sessionUid, isAdminUid, clerk, clerkUser } from "../api/_lib.js";
import { envoyer, envoyerLot } from "./alertes.js";
import {
  validerReponses, etatOuverture, capacite, dispoAuto, versCsv,
  messageParticipant, messageOrganisateur, SEGMENTS, ENVOIS_PAR_JOUR,
} from "./inscriptions.js";

const ILLIMITE = 1000000;

function aujourdhui() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }); // AAAA-MM-JJ
}
function site(req) {
  return `https://${req.headers["x-forwarded-host"] || req.headers.host || "ebok.fr"}`;
}

async function lireEvenement(id) {
  const rows = await sql()`SELECT * FROM event.events WHERE id = ${id}`;
  const r = rows[0];
  return r ? { ...r.data, id: r.id, status: r.status, userId: r.user_id } : null;
}

async function compter(eventId) {
  const rows = await sql()`
    SELECT statut, COUNT(*)::int AS n FROM event.inscriptions
    WHERE event_id = ${eventId} GROUP BY statut`;
  const c = { confirmes: 0, attente: 0 };
  for (const r of rows) {
    if (r.statut === "confirme") c.confirmes = r.n;
    else if (r.statut === "attente") c.attente = r.n;
  }
  return c;
}

/** Noms et e-mails lus dans Clerk, par paquets de 100 (zéro miroir). */
async function identites(uids) {
  const out = new Map();
  const uniques = [...new Set(uids)];
  for (let i = 0; i < uniques.length; i += 100) {
    try {
      const page = await clerk().users.getUserList({ userId: uniques.slice(i, i + 100), limit: 100 });
      for (const u of page.data || []) {
        const emails = u.emailAddresses || [];
        const p = emails.find((e) => e.id === u.primaryEmailAddressId) || emails[0];
        out.set(u.id, {
          email: p?.emailAddress || "",
          nom: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "",
        });
      }
    } catch (e) {
      console.error("inscriptions: lecture Clerk", e.message);
    }
  }
  return out;
}

/**
 * Donne les places libres aux premiers de la liste d'attente, puis aligne le
 * badge de disponibilité de la fiche sur le remplissage réel. À appeler après
 * toute écriture qui libère des places (annulation, retrait, places en plus).
 * Les promus sont prévenus par e-mail.
 */
export async function promouvoirEtSynchroniser(eventId, req) {
  const ev = await lireEvenement(eventId);
  if (!ev || !ev.inscriptions || !ev.inscriptions.actif) return;
  const places = capacite(ev) || ILLIMITE;
  const q = sql();
  const [, promus] = await q.transaction([
    q`SELECT pg_advisory_xact_lock(hashtext(${"ins:" + eventId}))`,
    q`
      UPDATE event.inscriptions SET statut = 'confirme', updated_at = now()
      WHERE id IN (
        SELECT id FROM event.inscriptions
        WHERE event_id = ${eventId} AND statut = 'attente'
        ORDER BY created_at
        LIMIT GREATEST(${places}::int - (
          SELECT COUNT(*) FROM event.inscriptions WHERE event_id = ${eventId} AND statut = 'confirme'
        ), 0)
      )
      RETURNING user_id`,
  ]);
  await synchroniserDispo(ev);
  for (const p of promus) {
    const { email } = await clerkUser(p.user_id);
    if (email) await envoyer({ destinataire: email, ...messageParticipant("promu", ev, site(req)) });
  }
}

async function synchroniserDispo(ev) {
  const places = capacite(ev);
  if (!places) return;
  const { confirmes } = await compter(ev.id);
  const dispo = dispoAuto(places, confirmes);
  if (dispo && dispo !== ev.dispo) {
    await sql()`UPDATE event.events SET data = data || ${JSON.stringify({ dispo })}::jsonb WHERE id = ${ev.id}`;
  }
}

/** Rang dans la liste d'attente (1 = le prochain servi). */
async function rang(eventId, createdAt) {
  const r = await sql()`
    SELECT COUNT(*)::int AS n FROM event.inscriptions
    WHERE event_id = ${eventId} AND statut = 'attente' AND created_at < ${createdAt}`;
  return (r[0]?.n || 0) + 1;
}

/** Les inscriptions d'un événement terminé depuis plus d'un an sont
 *  effacées (durée annoncée dans la politique de confidentialité). */
async function purger() {
  await sql()`
    DELETE FROM event.inscriptions i
    USING event.events e
    WHERE e.id = i.event_id
      AND COALESCE(NULLIF(e.data->>'dateEnd', ''), e.data->>'dateStart') < to_char(now() - interval '12 months', 'YYYY-MM-DD')`;
}

export default async function inscriptionsRoute(req, res) {
  const uid = await sessionUid(req);
  const { event: eventId, mine, gestion, format, inscrit, envoi } = req.query || {};

  /* ---------- Mes inscriptions ---------- */
  if (req.method === "GET" && mine) {
    if (!uid) return json(res, 401, { error: "auth" });
    const rows = await sql()`
      SELECT i.event_id, i.statut, i.created_at, e.data, e.status
      FROM event.inscriptions i JOIN event.events e ON e.id = i.event_id
      WHERE i.user_id = ${uid} ORDER BY e.data->>'dateStart'`;
    const liste = [];
    for (const r of rows) {
      liste.push({
        eventId: r.event_id,
        statut: r.statut,
        rang: r.statut === "attente" ? await rang(r.event_id, r.created_at) : null,
        inscritLe: new Date(r.created_at).getTime(),
        event: { ...r.data, id: r.event_id, status: r.status },
      });
    }
    return json(res, 200, { inscriptions: liste });
  }

  if (!eventId) return json(res, 400, { error: "event" });
  const ev = await lireEvenement(String(eventId));
  if (!ev) return json(res, 404, { error: "introuvable" });
  const estOrga = Boolean(uid) && (ev.userId === uid || (await isAdminUid(uid)));
  const cfg = ev.inscriptions || { actif: false, questions: [] };
  const places = capacite(ev);

  /* ---------- Gestion (organisateur) ---------- */
  if (req.method === "GET" && gestion) {
    if (!uid) return json(res, 401, { error: "auth" });
    if (!estOrga) return json(res, 403, { error: "prive" });
    const rows = await sql()`
      SELECT id, user_id, statut, reponses, created_at FROM event.inscriptions
      WHERE event_id = ${ev.id}
      ORDER BY CASE statut WHEN 'confirme' THEN 0 ELSE 1 END, created_at`;
    const ids = await identites(rows.map((r) => r.user_id));
    let n = 0;
    const inscrits = rows.map((r) => {
      const who = ids.get(r.user_id) || { nom: "", email: "" };
      return {
        id: r.id,
        statut: r.statut,
        rang: r.statut === "attente" ? ++n : null,
        nom: who.nom,
        email: who.email,
        reponses: r.reponses || {},
        inscritLe: new Date(r.created_at).getTime(),
      };
    });
    if (format === "csv") {
      const nom = String(ev.title || "inscrits").normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "inscrits";
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="inscrits-${nom}.csv"`);
      res.setHeader("Cache-Control", "no-store");
      return res.end(versCsv(inscrits, cfg.questions));
    }
    const envois = await sql()`
      SELECT segment, sujet, nb, created_at FROM event.inscription_envois
      WHERE event_id = ${ev.id} ORDER BY created_at DESC LIMIT 20`;
    const aujourdhuiEnvois = await sql()`
      SELECT COUNT(*)::int AS n FROM event.inscription_envois
      WHERE event_id = ${ev.id} AND created_at > now() - interval '24 hours'`;
    const admin = await isAdminUid(uid);
    return json(res, 200, {
      config: cfg,
      places,
      inscrits,
      envois: envois.map((e) => ({ ...e, created_at: new Date(e.created_at).getTime() })),
      envoisRestants: admin ? null : Math.max(0, ENVOIS_PAR_JOUR - (aujourdhuiEnvois[0]?.n || 0)),
      ouverture: etatOuverture(ev, aujourdhui()),
    });
  }

  /* ---------- État public + ma situation ---------- */
  if (req.method === "GET") {
    if (ev.status !== "approved" && !estOrga) return json(res, 403, { error: "prive" });
    const c = await compter(ev.id);
    let moi = null;
    if (uid) {
      const r = await sql()`
        SELECT statut, reponses, created_at FROM event.inscriptions
        WHERE event_id = ${ev.id} AND user_id = ${uid}`;
      if (r[0]) {
        moi = {
          statut: r[0].statut,
          reponses: r[0].reponses || {},
          rang: r[0].statut === "attente" ? await rang(ev.id, r[0].created_at) : null,
        };
      }
    }
    return json(res, 200, {
      actif: Boolean(cfg.actif),
      ...etatOuverture(ev, aujourdhui()),
      dateLimite: cfg.dateLimite || "",
      questions: cfg.questions || [],
      places,
      confirmes: c.confirmes,
      attente: c.attente,
      complet: Boolean(places) && c.confirmes >= places,
      moi,
      organisateur: estOrga,
    });
  }

  /* ---------- E-mail groupé (organisateur) ---------- */
  if (req.method === "POST" && envoi) {
    if (!uid) return json(res, 401, { error: "auth" });
    if (!estOrga) return json(res, 403, { error: "prive" });
    const body = await readBody(req);
    const segment = SEGMENTS.includes(body.segment) ? body.segment : "tous";
    const sujet = String(body.sujet || "").replace(/\s+/g, " ").trim().slice(0, 150);
    const corps = String(body.corps || "").trim().slice(0, 5000);
    if (!sujet || !corps) return json(res, 400, { error: "message_vide" });

    const admin = await isAdminUid(uid);
    if (!admin) {
      const r = await sql()`
        SELECT COUNT(*)::int AS n FROM event.inscription_envois
        WHERE event_id = ${ev.id} AND created_at > now() - interval '24 hours'`;
      if ((r[0]?.n || 0) >= ENVOIS_PAR_JOUR) return json(res, 429, { error: "quota" });
    }
    if (!process.env.RESEND_API_KEY) return json(res, 503, { error: "email_indisponible" });

    const statuts = segment === "confirmes" ? ["confirme"] : segment === "attente" ? ["attente"] : ["confirme", "attente"];
    const rows = await sql()`
      SELECT user_id FROM event.inscriptions
      WHERE event_id = ${ev.id} AND statut = ANY(${statuts})`;
    if (!rows.length) return json(res, 400, { error: "aucun_destinataire" });

    const ids = await identites(rows.map((r) => r.user_id));
    const destinataires = [...ids.values()].map((i) => i.email).filter(Boolean);
    const moi = await clerkUser(uid);
    const msg = messageOrganisateur(ev, site(req), {
      sujet, corps, nomOrganisateur: (ev.org && ev.org.name) || moi.name,
    });
    const nb = await envoyerLot({ destinataires, ...msg, repondreA: moi.email || undefined });
    await sql()`
      INSERT INTO event.inscription_envois (id, event_id, user_id, segment, sujet, nb)
      VALUES (${newId()}, ${ev.id}, ${uid}, ${segment}, ${sujet}, ${nb})`;
    if (!nb) return json(res, 502, { error: "envoi_echoue" });
    return json(res, 200, { ok: true, envoyes: nb, prevus: destinataires.length });
  }

  /* ---------- M'inscrire ---------- */
  if (req.method === "POST") {
    if (!uid) return json(res, 401, { error: "auth" });
    const ouverture = etatOuverture(ev, aujourdhui());
    if (!ouverture.ouvert) return json(res, 409, { error: "ferme", raison: ouverture.raison });
    const body = await readBody(req);
    const v = validerReponses(cfg.questions, body.reponses);
    if (!v.ok) return json(res, 400, { error: v.erreur, question: v.question });

    const q = sql();
    const [, ajout] = await q.transaction([
      q`SELECT pg_advisory_xact_lock(hashtext(${"ins:" + ev.id}))`,
      q`
        INSERT INTO event.inscriptions (id, event_id, user_id, statut, reponses)
        SELECT ${newId()}, ${ev.id}, ${uid},
          CASE WHEN (SELECT COUNT(*) FROM event.inscriptions WHERE event_id = ${ev.id} AND statut = 'confirme')
                    < ${places || ILLIMITE}::int THEN 'confirme' ELSE 'attente' END,
          ${JSON.stringify(v.reponses)}::jsonb
        ON CONFLICT (event_id, user_id) DO NOTHING
        RETURNING statut, created_at`,
    ]);
    if (!ajout.length) return json(res, 409, { error: "deja_inscrit" });

    const statut = ajout[0].statut;
    const monRang = statut === "attente" ? await rang(ev.id, ajout[0].created_at) : null;
    await synchroniserDispo(ev);
    const { email } = await clerkUser(uid);
    if (email) {
      envoyer({ destinataire: email, ...messageParticipant(statut === "attente" ? "attente" : "confirme", ev, site(req), monRang) })
        .catch((e) => console.error("inscriptions: confirmation", e));
    }
    purger().catch((e) => console.error("inscriptions: purge", e));
    return json(res, 200, { statut, rang: monRang });
  }

  /* ---------- Annuler / retirer ---------- */
  if (req.method === "DELETE") {
    if (!uid) return json(res, 401, { error: "auth" });
    let retire = null;
    if (inscrit) {
      if (!estOrga) return json(res, 403, { error: "prive" });
      const r = await sql()`
        DELETE FROM event.inscriptions WHERE id = ${String(inscrit)} AND event_id = ${ev.id}
        RETURNING user_id`;
      retire = r[0]?.user_id || null;
      if (!retire) return json(res, 404, { error: "introuvable" });
    } else {
      await sql()`DELETE FROM event.inscriptions WHERE event_id = ${ev.id} AND user_id = ${uid}`;
    }
    await promouvoirEtSynchroniser(ev.id, req);
    if (retire && retire !== uid) {
      const { email } = await clerkUser(retire);
      if (email) await envoyer({ destinataire: email, ...messageParticipant("retire", ev, site(req)) });
    }
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "method" });
}
