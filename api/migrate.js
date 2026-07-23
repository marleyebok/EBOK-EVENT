/**
 * Migration ponctuelle Firestore → Neon (réservée à l'admin).
 *
 *   POST /api/migrate                → importe events + views depuis Firestore
 *   POST /api/migrate {overwrite:true}→ écrase aussi les fiches déjà présentes
 *
 * Lit l'API REST publique de Firestore (les collections `events` et `views`
 * sont en lecture publique — voir firestore.rules) puis insère dans le schéma
 * `event` de Neon. Idempotent : par défaut on n'écrase PAS ce qui existe déjà,
 * on peut donc relancer la route sans risque.
 *
 * Les profils / favoris (collection `users`) ne sont PAS migrés : ils étaient
 * indexés par UID Firebase, qui ne correspond pas aux IDs Clerk. Les comptes se
 * recréent via Clerk. Les fiches gardent leur `userId` Firebase d'origine
 * (l'admin peut tout éditer ; le diffuseur d'origine devra se re-signaler).
 *
 * Env (avec valeurs par défaut = projet ebok-event-61657, clé Web publique) :
 *   FIREBASE_PROJECT_ID   (défaut "ebok-event-61657")
 *   FIREBASE_API_KEY      (défaut clé Web publique du projet)
 */
import { ensureSchema, hasDb, sql, json, readBody, sessionUid, isAdminUid } from "./_lib.js";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "ebok-event-61657";
const API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyAeOxodAkp4TFU1V5PiOqV2qUh9WVQEKhA";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/* Convertit une valeur typée Firestore REST en valeur JS simple. */
function parseValue(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return parseInt(v.integerValue, 10);
  if ("doubleValue" in v) return v.doubleValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return parseFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(parseValue);
  if ("referenceValue" in v) return v.referenceValue;
  if ("geoPointValue" in v) return v.geoPointValue;
  return null;
}
function parseFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = parseValue(v);
  return out;
}

/* Récupère tous les documents d'une collection (avec pagination). */
async function fetchCollection(name) {
  const docs = [];
  let pageToken = "";
  do {
    const url = `${BASE}/${name}?key=${API_KEY}&pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`firestore_${name}_${res.status}`);
    const data = await res.json();
    for (const d of data.documents || []) {
      const id = d.name.split("/").pop();
      docs.push({ id, fields: parseFields(d.fields || {}), createTime: d.createTime });
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return docs;
}

export default async function handler(req, res) {
  if (!hasDb()) return json(res, 503, { error: "db_unavailable" });
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  try {
    await ensureSchema();
  } catch (e) {
    console.error("migrate schema:", e);
    return json(res, 500, { error: "schema" });
  }

  const uid = await sessionUid(req);
  if (!(await isAdminUid(uid))) return json(res, 403, { error: "admin" });

  const body = await readBody(req);
  const overwrite = Boolean(body.overwrite);

  try {
    // ---- Événements ----
    const events = await fetchCollection("events");
    let evInserted = 0;
    for (const d of events) {
      const f = d.fields;
      const status = typeof f.status === "string" ? f.status : "approved";
      const userId = typeof f.userId === "string" ? f.userId : null;
      const featured = Boolean(f.featured);
      const data = { ...f };
      delete data.status;
      delete data.userId;
      delete data.featured;
      delete data.id;
      delete data.createdAt;
      const createdAt = d.createTime || new Date().toISOString();
      if (overwrite) {
        await sql()`
          INSERT INTO event.events (id, status, user_id, featured, data, created_at)
          VALUES (${d.id}, ${status}, ${userId}, ${featured}, ${JSON.stringify(data)}::jsonb, ${createdAt})
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status, user_id = EXCLUDED.user_id,
            featured = EXCLUDED.featured, data = EXCLUDED.data`;
        evInserted++;
      } else {
        const r = await sql()`
          INSERT INTO event.events (id, status, user_id, featured, data, created_at)
          VALUES (${d.id}, ${status}, ${userId}, ${featured}, ${JSON.stringify(data)}::jsonb, ${createdAt})
          ON CONFLICT (id) DO NOTHING
          RETURNING id`;
        if (r.length) evInserted++;
      }
    }

    // ---- Compteurs de vues ----
    let viewsInserted = 0;
    try {
      const views = await fetchCollection("views");
      for (const d of views) {
        const count = Number.isFinite(d.fields.count) ? d.fields.count : 0;
        const r = overwrite
          ? await sql()`
              INSERT INTO event.views (event_id, count)
              VALUES (${d.id}, ${count})
              ON CONFLICT (event_id) DO UPDATE SET count = ${count}
              RETURNING event_id`
          : await sql()`
              INSERT INTO event.views (event_id, count)
              VALUES (${d.id}, ${count})
              ON CONFLICT (event_id) DO NOTHING
              RETURNING event_id`;
        if (r.length) viewsInserted++;
      }
    } catch (e) {
      console.warn("migrate views:", e.message);
    }

    return json(res, 200, {
      ok: true,
      events: { found: events.length, imported: evInserted },
      views: { imported: viewsInserted },
      overwrite,
    });
  } catch (e) {
    console.error("migrate:", e);
    return json(res, 500, { error: "server", detail: String(e.message || e) });
  }
}
