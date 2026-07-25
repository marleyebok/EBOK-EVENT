/**
 * Profil « galaxie » du compte unique EBOK.
 *   GET  /api/profile  → { profile }
 *   POST /api/profile  → { ok: true }
 *
 * Stocké dans `shared.profiles` (schéma `shared`, hors schéma `event`) : c'est
 * la MÊME table que Playbook, Video, Mercato et le site mère. Ce sont des
 * préférences applicatives (rôle, niveau, club, outils visés…), pas l'identité
 * Clerk — le nom et l'e-mail restent lus à la volée depuis Clerk.
 */
import { hasDb, sql, json, sessionUid, readBody } from "./_lib.js";

/* Listes fermées, identiques dans toutes les apps de la galaxie. */
const TOOLS = [
  "Basketball",
  "Event",
  "Mercato",
  "Playbook",
  "Workout",
  "Vidéo",
  "Stats",
  "Notebook",
  "Académie",
  "Scouting",
  "Blog",
  "Forum",
  "Médias",
];

let ready = false;
async function ensureSharedSchema() {
  if (ready) return;
  const q = sql();
  await q`CREATE SCHEMA IF NOT EXISTS shared`;
  await q`
    CREATE TABLE IF NOT EXISTS shared.profiles (
      user_id TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  ready = true;
}

export default async function handler(req, res) {
  if (!hasDb()) return json(res, 503, { error: "db_unavailable" });

  const uid = await sessionUid(req);
  if (!uid) return json(res, 401, { error: "auth" });

  await ensureSharedSchema();

  if (req.method === "GET") {
    const rows = await sql()`SELECT data FROM shared.profiles WHERE user_id = ${uid}`;
    return json(res, 200, { profile: rows[0]?.data || {} });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const s = (key, max = 120) => {
      const v = String(body[key] ?? "").trim().slice(0, max);
      return v || undefined;
    };
    const tools = Array.isArray(body.tools)
      ? body.tools.filter((t) => typeof t === "string" && TOOLS.includes(t))
      : [];

    const data = {
      role: s("role"),
      roleOther: s("roleOther", 60),
      level: s("level"),
      club: s("club", 80),
      gender: s("gender"),
      age: s("age", 3),
      location: s("location", 80),
      tools,
    };

    const payload = JSON.stringify(data);
    await sql()`
      INSERT INTO shared.profiles (user_id, data, updated_at)
      VALUES (${uid}, ${payload}::jsonb, now())
      ON CONFLICT (user_id) DO UPDATE SET data = ${payload}::jsonb, updated_at = now()`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "method" });
}
