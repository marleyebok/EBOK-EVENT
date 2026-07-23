/**
 * Événements EBOK Event (remplace la collection Firestore `events`).
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
import { ensureSchema, hasDb, sql, json, readBody, newId, ms, sessionUid, isAdminUid } from "./_lib.js";

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
  };
}

/** Extrait le blob `data` (tout sauf les champs promus en colonnes). */
function dataBlob(obj) {
  const data = { ...obj };
  for (const k of COLUMN_FIELDS) delete data[k];
  return data;
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
        const rows = await sql()`SELECT * FROM event.events WHERE user_id = ${uid} ORDER BY created_at DESC`;
        return json(res, 200, { events: rows.map(toEvent) });
      }
      if (all) {
        if (!(await isAdminUid(uid))) return json(res, 403, { error: "admin" });
        const rows = await sql()`SELECT * FROM event.events ORDER BY created_at DESC`;
        return json(res, 200, { events: rows.map(toEvent) });
      }
      if (id) {
        const rows = await sql()`SELECT * FROM event.events WHERE id = ${id}`;
        const row = rows[0];
        if (!row) return json(res, 404, { error: "introuvable" });
        if (row.status !== "approved" && row.user_id !== uid && !(await isAdminUid(uid))) {
          return json(res, 403, { error: "prive" });
        }
        return json(res, 200, { event: toEvent(row) });
      }
      // Liste publique : uniquement les événements validés.
      const rows = await sql()`SELECT * FROM event.events WHERE status = 'approved' ORDER BY created_at DESC LIMIT 1000`;
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
      const rows = await sql()`SELECT * FROM event.events WHERE id = ${eid}`;
      return json(res, 200, { id: eid, event: toEvent(rows[0]) });
    }

    if (req.method === "PATCH" || req.method === "PUT") {
      if (!uid) return json(res, 401, { error: "auth" });
      if (!id) return json(res, 400, { error: "id" });
      const rows = await sql()`SELECT * FROM event.events WHERE id = ${id}`;
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
      const out = await sql()`SELECT * FROM event.events WHERE id = ${id}`;
      return json(res, 200, { event: toEvent(out[0]) });
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
