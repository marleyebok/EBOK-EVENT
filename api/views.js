/**
 * Compteurs de « curieux » (vues) — remplace la collection Firestore `views`.
 *
 *   GET  /api/views?id=X            → lit le compteur (0 si absent)
 *   POST /api/views?id=X&seed=N     → incrémente et renvoie la nouvelle valeur.
 *                                     `seed` = valeur de départ au tout premier vu.
 *
 * Écriture ouverte (comme avant) : l'app incrémente à chaque visite d'une fiche.
 */
import { ensureSchema, hasDb, sql, json } from "./_lib.js";

export default async function handler(req, res) {
  if (!hasDb()) return json(res, 503, { error: "db_unavailable" });
  try {
    await ensureSchema();
  } catch (e) {
    console.error("views schema:", e);
    return json(res, 500, { error: "schema" });
  }

  const q = req.query || {};
  const id = String(q.id || "");
  if (!id) return json(res, 400, { error: "id" });

  try {
    if (req.method === "GET") {
      const rows = await sql()`SELECT count FROM event.views WHERE event_id = ${id}`;
      return json(res, 200, { count: rows[0] ? rows[0].count : 0 });
    }

    if (req.method === "POST") {
      const seed = Math.max(0, parseInt(q.seed, 10) || 0);
      // Premier vu : on démarre à seed + 1. Ensuite : +1 atomique.
      const rows = await sql()`
        INSERT INTO event.views (event_id, count)
        VALUES (${id}, ${seed + 1})
        ON CONFLICT (event_id) DO UPDATE SET count = event.views.count + 1
        RETURNING count`;
      return json(res, 200, { count: rows[0].count });
    }

    return json(res, 405, { error: "method" });
  } catch (e) {
    console.error("views:", e);
    return json(res, 500, { error: "server" });
  }
}
