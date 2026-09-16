/**
 * Alertes e-mail des membres.
 *
 *   GET    /api/alerts                    → mes alertes — auth
 *   POST   /api/alerts {nom, criteres}    → en créer une — auth
 *   PATCH  /api/alerts?id=X {…}           → modifier / (dés)activer — auth
 *   DELETE /api/alerts?id=X               → supprimer — auth
 *   GET    /api/alerts?desinscrire=JETON  → désinscription SANS compte
 *
 * La désinscription par jeton est volontairement ouverte : un e-mail légitime
 * doit pouvoir se désabonner en un clic, sans reconnexion. Le jeton est tiré au
 * hasard, propre à l'alerte, et ne permet rien d'autre que de la désactiver.
 */
import { ensureSchema, hasDb, sql, json, readBody, newId, sessionUid } from "./_lib.js";
import { resume } from "../lib/alertes.js";

/* Au-delà, ce n'est plus une alerte mais un filtre déguisé en abonnement. */
const MAX_PAR_MEMBRE = 10;

/** Nettoie les critères venus du navigateur : on ne stocke que ce qu'on attend. */
function critresPropres(brut) {
  const c = brut || {};
  const liste = (v) =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 30) : [];
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
  return { regions: liste(c.regions), types: liste(c.types), du: date(c.du), au: date(c.au) };
}

function versAlerte(row) {
  return {
    id: row.id,
    nom: row.nom || resume(row.criteres),
    criteres: row.criteres || {},
    actif: row.actif,
    createdAt: row.created_at,
  };
}

export default async function handler(req, res) {
  if (!hasDb()) return json(res, 503, { error: "db_unavailable" });
  try {
    await ensureSchema();
  } catch (e) {
    console.error("alerts schema:", e);
    return json(res, 500, { error: "schema" });
  }

  const q = req.query || {};

  /* Désinscription par jeton — pas d'authentification, par conception. */
  if (req.method === "GET" && q.desinscrire) {
    const jeton = String(q.desinscrire);
    const rows = await sql()`
      UPDATE event.alerts SET actif = false WHERE jeton = ${jeton} RETURNING id`;
    const page = rows.length
      ? "Tu ne recevras plus cette alerte."
      : "Cette alerte n'existe plus — tu ne recevras rien d'elle.";
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Désinscription — EBOK Event</title></head>
      <body style="margin:0;background:#f4f0e7;color:#211f1b;font-family:system-ui,sans-serif;
                   display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px">
        <div style="text-align:center;max-width:380px">
          <h1 style="font-size:22px;margin:0 0 10px">C'est fait</h1>
          <p style="color:#6e675b;line-height:1.5;margin:0 0 22px">${page}</p>
          <a href="/" style="display:inline-block;background:#ff5722;color:#191008;text-decoration:none;
             font-weight:700;padding:12px 22px;border-radius:10px">Retour à EBOK Event</a>
        </div></body></html>`);
  }

  const uid = await sessionUid(req);
  if (!uid) return json(res, 401, { error: "auth" });

  try {
    if (req.method === "GET") {
      const rows = await sql()`
        SELECT * FROM event.alerts WHERE user_id = ${uid} ORDER BY created_at DESC`;
      return json(res, 200, { alerts: rows.map(versAlerte) });
    }

    if (req.method === "POST") {
      const [{ n }] = await sql()`
        SELECT COUNT(*)::int AS n FROM event.alerts WHERE user_id = ${uid}`;
      if (n >= MAX_PAR_MEMBRE) return json(res, 400, { error: "trop_d_alertes" });

      const body = await readBody(req);
      const criteres = critresPropres(body.criteres);
      const id = newId();
      // Jeton de désinscription : imprévisible, propre à l'alerte.
      const jeton = `${newId()}${newId()}`.replace(/-/g, "").slice(0, 40);
      await sql()`
        INSERT INTO event.alerts (id, user_id, nom, criteres, jeton)
        VALUES (${id}, ${uid}, ${String(body.nom || "").trim().slice(0, 80)},
                ${JSON.stringify(criteres)}::jsonb, ${jeton})`;
      const rows = await sql()`SELECT * FROM event.alerts WHERE id = ${id}`;
      return json(res, 200, { alert: versAlerte(rows[0]) });
    }

    const id = String(q.id || "");
    if (!id) return json(res, 400, { error: "id" });
    // Chaque écriture porte user_id : un membre ne touche que ses alertes.
    const rows = await sql()`
      SELECT * FROM event.alerts WHERE id = ${id} AND user_id = ${uid}`;
    if (!rows.length) return json(res, 404, { error: "introuvable" });

    if (req.method === "PATCH" || req.method === "PUT") {
      const patch = await readBody(req);
      const nom = Object.prototype.hasOwnProperty.call(patch, "nom")
        ? String(patch.nom || "").trim().slice(0, 80)
        : null;
      const criteres = patch.criteres ? JSON.stringify(critresPropres(patch.criteres)) : null;
      const actif = Object.prototype.hasOwnProperty.call(patch, "actif")
        ? Boolean(patch.actif)
        : null;
      await sql()`
        UPDATE event.alerts SET
          nom      = COALESCE(${nom}, nom),
          criteres = COALESCE(${criteres}::jsonb, criteres),
          actif    = COALESCE(${actif}, actif)
        WHERE id = ${id} AND user_id = ${uid}`;
      const out = await sql()`SELECT * FROM event.alerts WHERE id = ${id}`;
      return json(res, 200, { alert: versAlerte(out[0]) });
    }

    if (req.method === "DELETE") {
      await sql()`DELETE FROM event.alerts WHERE id = ${id} AND user_id = ${uid}`;
      await sql()`DELETE FROM event.alert_sends WHERE alert_id = ${id}`;
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: "method" });
  } catch (e) {
    console.error("alerts:", e);
    return json(res, 500, { error: "server" });
  }
}
