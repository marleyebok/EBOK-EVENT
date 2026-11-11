/**
 * Événements EBOK.
 *
 *   GET    /api/events            → événements publics (status = approved)
 *   GET    /api/events?id=X       → un événement (public s'il est approuvé,
 *                                    sinon réservé à son diffuseur ou l'admin)
 *   GET    /api/events?mine=1     → mes événements (tous statuts) — auth
 *   GET    /api/events?all=1      → tous les événements (tous statuts) — admin
 *   POST   /api/events {...}      → créer (statut "pending") — auth
 *   PATCH  /api/events?id=X {...} → modifier (diffuseur ou admin ; les champs
 *                                    status / featured ne bougent qu'en admin)
 *   DELETE /api/events?id=X       → supprimer (diffuseur ou admin)
 *
 * Modèle (voir api/_lib.js) : colonnes indexables (id, status, user_id,
 * featured, created_at) + JSONB `data` = tout le reste de la fiche (title,
 * type, city, region, dates, poster, org, infos, gallery, x/y…). On reconstitue
 * l'objet EXACTEMENT comme avant pour ne rien changer côté app.js.
 */
import { ensureSchema, hasDb, sql, json, readBody, newId, ms, sessionUid, isAdminUid, clerkUser } from "./_lib.js";
import { correspond, message, envoyer } from "../lib/alertes.js";

/* Champs promus en colonnes : ils ne sont pas dupliqués dans `data`. */
const COLUMN_FIELDS = ["id", "status", "user_id", "userId", "featured", "createdAt", "created_at"];

/** Reconstitue la fiche attendue par le front (mêmes champs qu'avant). */
function toEvent(row) {
  return {
    ...row.data,
    id: row.id,
    status: row.status,
    userId: row.user_id,
    featured: row.featured,
    createdAt: ms(row.created_at),
    // Nombre de membres ayant mis l'événement en favori. Public : c'est
    // l'indicateur de popularité affiché sur la fiche et les cartes.
    favCount: Number(row.fav_count || 0),
  };
}


/** Extrait le blob `data` (tout sauf les champs promus en colonnes). */
function dataBlob(obj) {
  const data = { ...obj };
  for (const k of COLUMN_FIELDS) delete data[k];
  return data;
}

/**
 * Prévient les membres dont une alerte correspond à cet événement.
 *
 * Chaque correspondance laisse une ligne dans event.alert_sends : c'est la
 * notification affichée sur le site, et la trace qui évite d'écrire deux fois
 * à la même personne. L'e-mail vient en plus ; s'il ne part pas (clé Resend
 * absente, panne), la notification reste et `mailed` reste faux, si bien
 * qu'une revalidation retentera l'envoi.
 *
 * Les e-mails ne sont pas lus en base : « zéro miroir », l'adresse vient de
 * Clerk à la volée.
 */
async function notifierAlertes(ev, req) {
  const alertes = await sql()`SELECT * FROM event.alerts WHERE actif = true`;
  if (!alertes.length) return;

  const hote = req.headers["x-forwarded-host"] || req.headers.host || "ebok.fr";
  const site = `https://${hote}`;

  for (const a of alertes) {
    if (!correspond(ev, a.criteres)) continue;

    // `ON CONFLICT DO NOTHING` rend la vérification atomique : deux
    // validations simultanées n'enverront pas deux e-mails.
    const pris = await sql()`
      INSERT INTO event.alert_sends (alert_id, event_id, mailed)
      VALUES (${a.id}, ${ev.id}, false)
      ON CONFLICT DO NOTHING RETURNING alert_id`;
    if (!pris.length) {
      const deja = await sql()`
        SELECT mailed FROM event.alert_sends
        WHERE alert_id = ${a.id} AND event_id = ${ev.id}`;
      if (!deja.length || deja[0].mailed) continue;
    }

    const { email } = await clerkUser(a.user_id);
    if (!email) continue;

    const { sujet, texte, html } = message(ev, a, site);
    const ok = await envoyer({ destinataire: email, sujet, texte, html });
    if (ok) {
      await sql()`
        UPDATE event.alert_sends SET mailed = true
        WHERE alert_id = ${a.id} AND event_id = ${ev.id}`;
    }
  }
}

export default async function handler(req, res) {
  if (!hasDb()) return json(res, 503, { error: "db_unavailable" });
  try {
    await ensureSchema();
  } catch (e) {
    console.error("events schema:", e);
    return json(res, 500, { error: "schema" });
  }

  const uid = await sessionUid(req);
  const { id, mine, all } = req.query || {};

  try {
    if (req.method === "GET") {
      if (mine) {
        if (!uid) return json(res, 401, { error: "auth" });
        const rows = await sql()`SELECT * FROM event.events_lecture WHERE user_id = ${uid} ORDER BY created_at DESC`;
        return json(res, 200, { events: rows.map(toEvent) });
      }
      if (all) {
        if (!(await isAdminUid(uid))) return json(res, 403, { error: "admin" });
        const rows = await sql()`SELECT * FROM event.events_lecture ORDER BY created_at DESC`;
        return json(res, 200, { events: rows.map(toEvent) });
      }
      if (id) {
        const rows = await sql()`SELECT * FROM event.events_lecture WHERE id = ${id}`;
        const row = rows[0];
        if (!row) return json(res, 404, { error: "introuvable" });
        if (row.status !== "approved" && row.user_id !== uid && !(await isAdminUid(uid))) {
          return json(res, 403, { error: "prive" });
        }
        return json(res, 200, { event: toEvent(row) });
      }
      // Liste publique : uniquement les événements validés.
      const rows = await sql()`SELECT * FROM event.events_lecture WHERE status = 'approved' ORDER BY created_at DESC LIMIT 1000`;
      return json(res, 200, { events: rows.map(toEvent) });
    }

    if (req.method === "POST") {
      if (!uid) return json(res, 401, { error: "auth" });
      const body = await readBody(req);
      const admin = await isAdminUid(uid);
      // Un nouveau compte crée toujours en "pending", sauf l'admin qui peut
      // publier directement (status:"approved").
      const status = admin && body.status === "approved" ? "approved" : "pending";
      const featured = admin ? Boolean(body.featured) : false;
      const eid = newId();
      const data = dataBlob(body);
      await sql()`
        INSERT INTO event.events (id, status, user_id, featured, data)
        VALUES (${eid}, ${status}, ${uid}, ${featured}, ${JSON.stringify(data)}::jsonb)`;
      const rows = await sql()`SELECT * FROM event.events_lecture WHERE id = ${eid}`;
      const creee = toEvent(rows[0]);
      // Publié directement par l'admin : l'événement est visible tout de suite,
      // les alertes partent donc ici (il ne passera jamais par la validation).
      if (status === "approved") {
        notifierAlertes(creee, req).catch((e) => console.error("alertes:", e));
      }
      return json(res, 200, { id: eid, event: creee });
    }

    if (req.method === "PATCH" || req.method === "PUT") {
      if (!uid) return json(res, 401, { error: "auth" });
      if (!id) return json(res, 400, { error: "id" });
      const rows = await sql()`SELECT * FROM event.events_lecture WHERE id = ${id}`;
      const row = rows[0];
      if (!row) return json(res, 404, { error: "introuvable" });
      const admin = await isAdminUid(uid);
      if (!admin && row.user_id !== uid) return json(res, 403, { error: "prive" });

      const patch = await readBody(req);
      // status et featured sont des actions d'admin (validation / mise en avant).
      const hasStatus = admin && Object.prototype.hasOwnProperty.call(patch, "status");
      const hasFeatured = admin && Object.prototype.hasOwnProperty.call(patch, "featured");
      const nextStatus = hasStatus ? String(patch.status) : null;
      const nextFeatured = hasFeatured ? Boolean(patch.featured) : null;
      const rest = dataBlob(patch);

      await sql()`
        UPDATE event.events SET
          status   = COALESCE(${nextStatus}, status),
          featured = COALESCE(${nextFeatured}, featured),
          data     = data || ${JSON.stringify(rest)}::jsonb
        WHERE id = ${id}`;
      const out = await sql()`SELECT * FROM event.events_lecture WHERE id = ${id}`;
      const fiche = toEvent(out[0]);

      // Un événement qui vient d'être validé déclenche les alertes. On le fait
      // APRÈS l'écriture et sans l'attendre : un service d'e-mail lent ou en
      // panne ne doit pas faire échouer une validation déjà enregistrée.
      if (nextStatus === "approved" && row.status !== "approved") {
        notifierAlertes(fiche, req).catch((e) => console.error("alertes:", e));
      }

      return json(res, 200, { event: fiche });
    }

    if (req.method === "DELETE") {
      if (!uid) return json(res, 401, { error: "auth" });
      if (!id) return json(res, 400, { error: "id" });
      const rows = await sql()`SELECT user_id FROM event.events WHERE id = ${id}`;
      const row = rows[0];
      if (!row) return json(res, 200, { ok: true });
      const admin = await isAdminUid(uid);
      if (!admin && row.user_id !== uid) return json(res, 403, { error: "prive" });
      await sql()`DELETE FROM event.events WHERE id = ${id}`;
      await sql()`DELETE FROM event.views WHERE event_id = ${id}`;
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: "method" });
  } catch (e) {
    console.error("events:", e);
    return json(res, 500, { error: "server" });
  }
}
