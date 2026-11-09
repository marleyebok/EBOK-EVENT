/**
 * Détection automatique d'événements — route d'administration et tâche
 * quotidienne. Le moteur est dans lib/detection.js.
 *
 *   GET  /api/detection                    (admin) → sources + derniers détectés
 *   GET  /api/detection?tache=cron         (tâche planifiée Vercel) → analyse
 *        la source la plus anciennement visitée, si elle ne l'a pas été depuis
 *        20 h. Sans effet sinon : un appel répété ne coûte rien.
 *   POST /api/detection  {action:"ajouter", url, nom}      (admin)
 *   POST /api/detection  {action:"retirer", id}            (admin)
 *   POST /api/detection  {action:"activer", id, actif}     (admin)
 *   POST /api/detection  {action:"analyser", id}           (admin) → tout de suite
 *
 * Sécurité de la tâche : si la variable CRON_SECRET est définie sur Vercel,
 * Vercel l'envoie dans l'en-tête Authorization et elle est exigée. Sans elle,
 * la tâche reste sans danger : une seule source par 20 h, et rien n'est jamais
 * publié — tout arrive « en attente ».
 */
import { ensureSchema, hasDb, sql, json, readBody, newId, sessionUid, isAdminUid } from "./_lib.js";
import { isBlockedHost, fetchUrl } from "./import-event.js";
import { AIService } from "../lib/services/AIService.js";
import { analyserSource, resumeBilan, simplifier } from "../lib/detection.js";

const INTERVALLE_HEURES = 20;

/* ------------------------------------------------------------------ */
/* Dépendances réelles du moteur                                       */
/* ------------------------------------------------------------------ */

/* Coordonnées de la ville (Base Adresse Nationale, gratuite et sans clé) :
   sans elles, l'événement tomberait au centre de la carte. */
async function geocoder(ev) {
  const q = [ev.address, ev.city].filter(Boolean).join(", ");
  try {
    const r = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1`);
    if (!r.ok) return null;
    const d = await r.json();
    const f = d.features && d.features[0];
    if (!f || !f.geometry) return null;
    const [lng, lat] = f.geometry.coordinates;
    // « 34, Hérault, Occitanie » → la région est le dernier élément.
    const ctx = String((f.properties && f.properties.context) || "").split(",").map(s => s.trim());
    return { lat, lng, region: ctx.length >= 3 ? ctx[ctx.length - 1] : "" };
  } catch { return null; }
}

function dependances(today) {
  const ai = new AIService();
  return {
    today,
    maintenant: new Date().toISOString(),
    lirePage: (url) => fetchUrl(url, 15000, false),
    extraire: (prompt) => ai.extractEvent({ parts: [], prompt }),
    geocoder,
    async dejaVu(empreintes) {
      if (!empreintes.length) return new Set();
      const rows = await sql()`SELECT empreinte FROM event.detections WHERE empreinte = ANY(${empreintes})`;
      return new Set(rows.map(r => r.empreinte));
    },
    // Un événement saisi à la main (ou par un organisateur) avec le même
    // titre, la même date et la même ville compte comme doublon.
    async doublonSaisi(ev) {
      const rows = await sql()`
        SELECT data->>'title' AS t, data->>'city' AS c FROM event.events
        WHERE data->>'dateStart' = ${ev.dateStart}`;
      return rows.some(r => simplifier(r.t) === simplifier(ev.title) && simplifier(r.c) === simplifier(ev.city));
    },
    async creer(fiche, empreinte) {
      const id = newId();
      await sql()`
        INSERT INTO event.events (id, status, user_id, featured, data)
        VALUES (${id}, 'pending', NULL, false, ${JSON.stringify(fiche)}::jsonb)`;
      await sql()`
        INSERT INTO event.detections (empreinte, event_id, source_id)
        VALUES (${empreinte}, ${id}, ${fiche.detection.sourceId})
        ON CONFLICT (empreinte) DO NOTHING`;
    },
  };
}

async function analyser(source) {
  const today = new Date().toISOString().slice(0, 10);
  let bilan;
  try {
    bilan = await analyserSource(source, dependances(today));
  } catch (e) {
    console.error("detection:", e);
    bilan = { trouves: 0, crees: 0, doublons: 0, rejetes: 0, raisons: {}, erreur: "Erreur interne pendant l'analyse." };
  }
  const resume = resumeBilan(bilan);
  await sql()`
    UPDATE event.detection_sources
    SET last_run = now(), last_status = ${resume}, total_crees = total_crees + ${bilan.crees}
    WHERE id = ${source.id}`;
  return { bilan, resume };
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */
export default async function handler(req, res) {
  if (!hasDb()) return json(res, 503, { error: "db_unavailable" });
  try { await ensureSchema(); }
  catch (e) { console.error("detection schema:", e); return json(res, 500, { error: "schema" }); }

  const tache = String((req.query || {}).tache || "");

  try {
    // --- Tâche planifiée --------------------------------------------------
    if (req.method === "GET" && tache === "cron") {
      const secret = process.env.CRON_SECRET;
      if (secret && (req.headers.authorization || "") !== `Bearer ${secret}`) {
        return json(res, 401, { error: "cron" });
      }
      const rows = await sql()`
        SELECT * FROM event.detection_sources
        WHERE actif = true
          AND (last_run IS NULL OR last_run < now() - make_interval(hours => ${INTERVALLE_HEURES}))
        ORDER BY last_run ASC NULLS FIRST
        LIMIT 1`;
      if (!rows.length) return json(res, 200, { ok: true, analyse: null });
      const { resume } = await analyser(rows[0]);
      return json(res, 200, { ok: true, analyse: rows[0].url, resume });
    }

    // --- Administration ----------------------------------------------------
    const uid = await sessionUid(req);
    if (!(await isAdminUid(uid))) return json(res, 403, { error: "admin" });

    if (req.method === "GET") {
      const sources = await sql()`SELECT * FROM event.detection_sources ORDER BY created_at ASC`;
      const enAttente = await sql()`
        SELECT COUNT(*)::int AS n FROM event.events
        WHERE status = 'pending' AND data->'detection'->>'auto' = 'true'`;
      return json(res, 200, {
        sources: sources.map(s => ({
          id: s.id, url: s.url, nom: s.nom, actif: s.actif,
          lastRun: s.last_run, lastStatus: s.last_status, totalCrees: s.total_crees,
        })),
        enAttente: enAttente[0].n,
        cronProtege: Boolean(process.env.CRON_SECRET),
      });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const action = String(body.action || "");

      if (action === "ajouter") {
        let u;
        try { u = new URL(String(body.url || "").trim()); } catch { return json(res, 400, { error: "Adresse invalide." }); }
        if (!/^https?:$/.test(u.protocol) || isBlockedHost(u.hostname)) return json(res, 400, { error: "Adresse non autorisée." });
        const nom = String(body.nom || "").trim().slice(0, 120) || u.hostname;
        const rows = await sql()`
          INSERT INTO event.detection_sources (id, url, nom) VALUES (${newId()}, ${u.href}, ${nom})
          ON CONFLICT (url) DO NOTHING RETURNING id`;
        if (!rows.length) return json(res, 409, { error: "Cette page est déjà surveillée." });
        return json(res, 200, { ok: true, id: rows[0].id });
      }

      const id = String(body.id || "");
      if (!id) return json(res, 400, { error: "id" });

      if (action === "retirer") {
        await sql()`DELETE FROM event.detection_sources WHERE id = ${id}`;
        return json(res, 200, { ok: true });
      }
      if (action === "activer") {
        await sql()`UPDATE event.detection_sources SET actif = ${Boolean(body.actif)} WHERE id = ${id}`;
        return json(res, 200, { ok: true });
      }
      if (action === "analyser") {
        const rows = await sql()`SELECT * FROM event.detection_sources WHERE id = ${id}`;
        if (!rows.length) return json(res, 404, { error: "Source introuvable." });
        const { bilan, resume } = await analyser(rows[0]);
        return json(res, 200, { ok: !bilan.erreur, resume, crees: bilan.crees });
      }
      return json(res, 400, { error: "action" });
    }

    return json(res, 405, { error: "method" });
  } catch (e) {
    console.error("detection:", e);
    return json(res, 500, { error: "server" });
  }
}
