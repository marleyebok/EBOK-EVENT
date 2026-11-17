/**
 * Publication Instagram depuis le site (admin).
 *
 *   GET  /api/instagram                 état : compte connecté ?, clé valable
 *                                       jusqu'à quand, publications du jour,
 *                                       et (avec ?event=<id>) les publications
 *                                       déjà faites pour cet événement.
 *   POST /api/instagram                 { eventId, imageUrl, caption, tag }
 *                                       publie la carte (déjà hébergée sur
 *                                       Vercel Blob) sur le compte EBOK.
 *   GET  /api/instagram?tache=refresh   tâche planifiée : renouvelle la clé.
 *
 * API utilisée : « Instagram API with Instagram Login » (graph.instagram.com),
 * autorisations instagram_business_basic + instagram_business_content_publish.
 * Publication en deux temps : conteneur (POST /<IG_ID>/media), puis mise en
 * ligne (POST /<IG_ID>/media_publish) une fois le conteneur « FINISHED ».
 *
 * La clé (IG_ACCESS_TOKEN, générée dans l'app Meta) est posée une fois dans
 * Vercel. Elle expire au bout de 60 jours : la tâche hebdomadaire la renouvelle
 * et range la nouvelle dans event.instagram_auth. Si l'admin remplace la clé
 * dans Vercel, la nouvelle reprend la main (empreinte comparée).
 *
 * Droits : tout passe par isAdminUid, côté serveur. La clé ne quitte jamais le
 * serveur et n'est jamais renvoyée au navigateur.
 */
import { createHash } from "node:crypto";
import { hasDb, sql, ensureSchema, json, readBody, sessionUid, isAdminUid } from "./_lib.js";

const API = "https://graph.instagram.com";
const VERSION = (process.env.IG_API_VERSION || "v24.0").trim();
const LEGENDE_MAX = 2200;
// Seules les images hébergées par notre Blob store sont publiables.
const HOTE_IMAGES = /\.public\.blob\.vercel-storage\.com$/i;

/* ---------- Tables ---------- */
let tablesPretes = false;
async function tables() {
  if (tablesPretes) return;
  await ensureSchema();
  const q = sql();
  // Une seule ligne (id = 1) : la clé en cours et le compte associé.
  await q`
    CREATE TABLE IF NOT EXISTS event.instagram_auth (
      id           INTEGER PRIMARY KEY,
      token        TEXT NOT NULL,
      seed_hash    TEXT NOT NULL,
      ig_user_id   TEXT,
      username     TEXT,
      expires_at   TIMESTAMPTZ,
      refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  // Trace des publications : évite les doublons et garde le lien du post.
  await q`
    CREATE TABLE IF NOT EXISTS event.instagram_posts (
      media_id     TEXT PRIMARY KEY,
      event_id     TEXT,
      permalink    TEXT,
      image_url    TEXT,
      published_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  await q`CREATE INDEX IF NOT EXISTS instagram_posts_event_idx ON event.instagram_posts (event_id)`;
  tablesPretes = true;
}

/* ---------- Appels Instagram ---------- */
class ErreurIG extends Error {
  constructor(message, code, detail) { super(message); this.code = code; this.detail = detail; }
}
async function ig(chemin, { method = "GET", params = {}, token }) {
  const url = new URL(`${API}/${VERSION}/${chemin.replace(/^\//, "")}`);
  const corps = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    (method === "GET" ? url.searchParams : corps).set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  // Paramètre access_token documenté par Meta. Pour une écriture il part dans
  // le corps ; pour une lecture dans l'URL : ne jamais journaliser `url`.
  (method === "GET" ? url.searchParams : corps).set("access_token", token);
  const r = await fetch(url, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "GET" ? undefined : corps,
  });
  let data = {};
  try { data = await r.json(); } catch { /* réponse non JSON */ }
  if (!r.ok || data.error) {
    const e = data.error || {};
    throw new ErreurIG(e.message || `instagram_${r.status}`, e.code || r.status, e.error_user_msg || e.error_subcode || "");
  }
  return data;
}

function empreinte(s) { return createHash("sha256").update(String(s)).digest("hex"); }

/* Clé en cours : celle de la base si elle descend de la clé posée dans Vercel,
   sinon celle de Vercel (posée ou remplacée par l'admin). */
async function cle() {
  const seed = String(process.env.IG_ACCESS_TOKEN || "").trim();
  const rows = await sql()`SELECT * FROM event.instagram_auth WHERE id = 1`;
  const ligne = rows[0];
  if (ligne && (!seed || ligne.seed_hash === empreinte(seed))) return ligne;
  if (!seed) return null;
  // Nouvelle clé : on identifie le compte pour connaître l'IG_ID de publication.
  const moi = await ig("me", { params: { fields: "user_id,username" }, token: seed });
  const igId = String(moi.user_id || moi.id || "");
  const res = await sql()`
    INSERT INTO event.instagram_auth (id, token, seed_hash, ig_user_id, username, expires_at, refreshed_at)
    VALUES (1, ${seed}, ${empreinte(seed)}, ${igId}, ${moi.username || ""}, NULL, now())
    ON CONFLICT (id) DO UPDATE SET token = EXCLUDED.token, seed_hash = EXCLUDED.seed_hash,
      ig_user_id = EXCLUDED.ig_user_id, username = EXCLUDED.username,
      expires_at = NULL, refreshed_at = now()
    RETURNING *`;
  return res[0];
}

/* Renouvelle la clé (60 jours de plus). Meta exige qu'elle ait au moins 24 h. */
async function renouveler(ligne) {
  const url = new URL(`${API}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", ligne.token);
  const r = await fetch(url);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) {
    throw new ErreurIG((data.error && data.error.message) || "refresh", (data.error && data.error.code) || r.status);
  }
  const expire = data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : null;
  await sql()`
    UPDATE event.instagram_auth
    SET token = ${data.access_token}, expires_at = ${expire}, refreshed_at = now()
    WHERE id = 1`;
  return { expire };
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/* Crée le conteneur puis attend qu'Instagram ait fini de récupérer l'image. */
async function conteneur(ligne, { imageUrl, caption, tag }) {
  const params = { image_url: imageUrl, caption };
  // Identification de l'organisateur au milieu de l'affiche.
  if (tag) params.user_tags = [{ username: tag, x: 0.5, y: 0.4 }];
  let c;
  let tagIgnore = false;
  try {
    c = await ig(`${ligne.ig_user_id}/media`, { method: "POST", params, token: ligne.token });
  } catch (e) {
    // Compte à identifier introuvable ou privé : on publie sans l'identifier.
    if (!tag) throw e;
    delete params.user_tags;
    tagIgnore = true;
    c = await ig(`${ligne.ig_user_id}/media`, { method: "POST", params, token: ligne.token });
  }
  for (let i = 0; i < 20; i++) {
    const s = await ig(c.id, { params: { fields: "status_code" }, token: ligne.token });
    if (s.status_code === "FINISHED") return { id: c.id, tagIgnore };
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
      throw new ErreurIG("conteneur_" + s.status_code.toLowerCase(), "conteneur");
    }
    await attendre(1500);
  }
  throw new ErreurIG("conteneur_lent", "conteneur");
}

/* Traduit une erreur en message utile pour l'admin. */
function messageErreur(e) {
  const code = Number(e && e.code);
  if (code === 190) return "La clé Instagram n'est plus valable : génère-en une nouvelle dans l'app Meta et remplace IG_ACCESS_TOKEN dans Vercel.";
  if (code === 10 || code === 200) return "L'app Meta n'a pas l'autorisation de publier (instagram_business_content_publish).";
  if (code === 9 || code === 4 || code === 32) return "Limite de publications Instagram atteinte : réessaie plus tard.";
  if (e && e.message === "conteneur_lent") return "Instagram met du temps à traiter l'image : vérifie le compte dans quelques minutes avant de réessayer.";
  if (e && String(e.message).startsWith("conteneur_")) return "Instagram a refusé l'image (format ou taille).";
  return "Instagram a refusé la publication : " + String((e && e.message) || "erreur inconnue").slice(0, 200);
}

/* ------------------------------------------------------------------ */
export default async function handler(req, res) {
  if (!hasDb()) return json(res, 503, { error: "db_unavailable" });
  try { await tables(); }
  catch (e) { console.error("instagram schema:", e); return json(res, 500, { error: "schema" }); }

  const q = req.query || {};

  try {
    // --- Tâche planifiée : renouvellement de la clé -------------------------
    if (req.method === "GET" && q.tache === "refresh") {
      const secret = process.env.CRON_SECRET;
      if (secret && (req.headers.authorization || "") !== `Bearer ${secret}`) {
        return json(res, 401, { error: "cron" });
      }
      const ligne = await cle();
      if (!ligne) return json(res, 200, { ok: true, renouvele: false, raison: "non_configure" });
      if (Date.now() - new Date(ligne.refreshed_at).getTime() < 24 * 3600 * 1000) {
        return json(res, 200, { ok: true, renouvele: false, raison: "trop_recente" });
      }
      const { expire } = await renouveler(ligne);
      return json(res, 200, { ok: true, renouvele: true, expire });
    }

    // --- Administration -----------------------------------------------------
    const uid = await sessionUid(req);
    if (!(await isAdminUid(uid))) return json(res, 403, { error: "admin" });

    if (req.method === "GET") {
      const eventId = String(q.event || "").slice(0, 100);
      const posts = eventId
        ? await sql()`SELECT permalink, published_at FROM event.instagram_posts WHERE event_id = ${eventId} ORDER BY published_at DESC`
        : [];
      if (!process.env.IG_ACCESS_TOKEN) return json(res, 200, { configure: false, posts });
      let ligne;
      try { ligne = await cle(); }
      catch (e) { return json(res, 200, { configure: true, valide: false, message: messageErreur(e), posts }); }
      let quota = null;
      try {
        const l = await ig(`${ligne.ig_user_id}/content_publishing_limit`, { params: { fields: "quota_usage,config" }, token: ligne.token });
        const d = (l.data && l.data[0]) || {};
        quota = { utilise: d.quota_usage ?? null, max: (d.config && d.config.quota_total) ?? null };
      } catch (e) {
        return json(res, 200, { configure: true, valide: false, compte: ligne.username, message: messageErreur(e), posts });
      }
      // Le @ peut changer sans que la clé change : on le relit à chaque fois.
      let compte = ligne.username;
      try {
        const moi = await ig("me", { params: { fields: "username" }, token: ligne.token });
        if (moi.username && moi.username !== compte) {
          compte = moi.username;
          await sql()`UPDATE event.instagram_auth SET username = ${compte} WHERE id = 1`;
        }
      } catch { /* l'ancien @ reste affiché */ }
      return json(res, 200, {
        configure: true, valide: true, compte,
        expire: ligne.expires_at, quota, posts,
      });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const eventId = String(body.eventId || "").slice(0, 100);
      const imageUrl = String(body.imageUrl || "");
      const caption = String(body.caption || "").slice(0, LEGENDE_MAX);
      const tag = /^[A-Za-z0-9._]{1,30}$/.test(String(body.tag || "")) ? String(body.tag) : "";

      let hote = "";
      try { const u = new URL(imageUrl); hote = u.protocol === "https:" ? u.hostname : ""; } catch { /* invalide */ }
      if (!HOTE_IMAGES.test(hote)) return json(res, 400, { error: "image", message: "Image non hébergée par EBOK." });
      if (!process.env.IG_ACCESS_TOKEN) return json(res, 503, { error: "non_configure", message: "Instagram n'est pas encore connecté (IG_ACCESS_TOKEN absent dans Vercel)." });

      const ligne = await cle();
      try {
        const { id, tagIgnore } = await conteneur(ligne, { imageUrl, caption, tag });
        const pub = await ig(`${ligne.ig_user_id}/media_publish`, { method: "POST", params: { creation_id: id }, token: ligne.token });
        let permalink = "";
        try { permalink = (await ig(pub.id, { params: { fields: "permalink" }, token: ligne.token })).permalink || ""; }
        catch { /* le lien est un plus */ }
        await sql()`
          INSERT INTO event.instagram_posts (media_id, event_id, permalink, image_url)
          VALUES (${pub.id}, ${eventId || null}, ${permalink}, ${imageUrl})
          ON CONFLICT (media_id) DO NOTHING`;
        return json(res, 200, { ok: true, permalink, tagIgnore });
      } catch (e) {
        console.error("instagram publish:", e && e.message, e && e.code, e && e.detail);
        return json(res, 502, { error: "instagram", message: messageErreur(e) });
      }
    }

    return json(res, 405, { error: "method" });
  } catch (e) {
    console.error("instagram:", e);
    return json(res, 500, { error: "server", message: messageErreur(e) });
  }
}
