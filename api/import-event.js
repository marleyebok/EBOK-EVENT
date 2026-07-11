/* =========================================================
   EBOK Event — ASSISTANT IA D'IMPORT (fonction serverless Vercel)
   ---------------------------------------------------------
   Reçoit un lien (site, billetterie…) OU une image (affiche, capture),
   récupère le contenu, puis demande à Google Gemini de structurer les
   infos de l'événement. Le formulaire de publication est pré-rempli.

   Variables d'environnement (Vercel > Settings > Environment Variables) :
   - GEMINI_API_KEY   (obligatoire)  clé Google AI Studio (gratuite)
   - ADMIN_EMAILS     (optionnel)    emails admin, séparés par des virgules
   - FIREBASE_API_KEY (optionnel)    clé Web Firebase (pour valider le compte)
   ========================================================= */
const GEMINI_MODEL = "gemini-2.0-flash";

const TYPES = [
  "Tournoi", "Camp", "Voyage", "All-Star Game", "Show", "Détections",
  "Clinic Coachs", "Circuit 3x3", "Handibasket", "Matchs de Gala", "Divers"
];
const FIELDS = ["title", "type", "city", "region", "address", "dateStart", "dateEnd",
  "sexe", "age", "niveau", "description", "orgName", "insta", "site"];

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "marley.ebok@gmail.com")
  .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyAeOxodAkp4TFU1V5PiOqV2qUh9WVQEKhA";

/* Refuse les adresses internes / locales (protection SSRF de base). */
function isBlockedHost(host) {
  const h = (host || "").toLowerCase();
  return !h
    || h === "localhost" || h.endsWith(".local")
    || h === "127.0.0.1" || h.startsWith("127.")
    || h === "0.0.0.0" || h === "::1"
    || h.startsWith("10.") || h.startsWith("192.168.")
    || h.startsWith("169.254.")
    || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h);
}

/* Vérifie que l'appelant est un administrateur connecté (jeton Firebase). */
async function verifyAdmin(idToken) {
  if (!idToken) return false;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return false;
    const data = await res.json();
    const email = data.users && data.users[0] && data.users[0].email;
    return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
  } catch (e) { return false; }
}

/* Récupère le contenu d'une URL avec un délai maximal. */
async function fetchUrl(url, ms, asBuffer) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EBOK-Event/1.0; +https://ebok-event.vercel.app)" }
    });
    if (!res.ok) return null;
    if (asBuffer) return { buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") || "" };
    return await res.text();
  } catch (e) { return null; }
  finally { clearTimeout(t); }
}

function metaContent(html, patterns) {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return "";
}

/* Extrait titre, description, image (og:) et texte lisible de la page. */
function extractPage(html, baseUrl) {
  const title = metaContent(html, [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<title[^>]*>([^<]+)<\/title>/i
  ]);
  const description = metaContent(html, [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
  ]);
  let image = metaContent(html, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
  ]);
  if (image && baseUrl) { try { image = new URL(image, baseUrl).href; } catch (e) { /* garde tel quel */ } }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 9000);

  return { title, description, image, text };
}

/* Télécharge l'affiche et la convertit en dataURL (limite ~3 Mo). */
async function fetchPoster(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (isBlockedHost(u.hostname)) return null;
    const r = await fetchUrl(url, 9000, true);
    if (!r || !r.buf) return null;
    if (!/^image\//i.test(r.type)) return null;
    if (r.buf.length > 3 * 1024 * 1024) return null;
    return `data:${r.type.split(";")[0]};base64,${r.buf.toString("base64")}`;
  } catch (e) { return null; }
}

/* Découpe une dataURL image en { mime, data base64 }. */
function parseDataUrl(s) {
  const m = /^data:(image\/(?:png|jpe?g|gif|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(s || "");
  if (!m) return null;
  let mime = m[1].toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  return { mime, data: m[2] };
}

/* Complète et nettoie l'objet renvoyé par l'IA. */
function normalizeEvent(e) {
  e = e || {};
  const out = {};
  for (const k of FIELDS) out[k] = (e[k] == null) ? "" : String(e[k]).trim();
  if (out.type && !TYPES.includes(out.type)) out.type = "Divers";
  if (!["Masculin", "Féminin", "Mixte"].includes(out.sexe)) out.sexe = "";
  out.insta = out.insta.replace(/^@/, "");
  return out;
}

const RULES =
`Réponds avec un OBJET JSON aux clés EXACTES : title, type, city, region, address, dateStart, dateEnd, sexe, age, niveau, description, orgName, insta, site.
Règles :
- "type" : une seule valeur parmi [${TYPES.join(", ")}] (par défaut "Divers").
- "dateStart" / "dateEnd" : format AAAA-MM-JJ. S'il n'y a qu'une date, mets-la dans les deux. Si une date manque, mets "". N'INVENTE JAMAIS de date.
- "sexe" : "Masculin", "Féminin", "Mixte" ou "".
- "region" : la région administrative française (ex. "Île-de-France", "Occitanie") déduite de la ville si possible, sinon "".
- "description" : 2 à 4 phrases synthétiques en français.
- "insta" : identifiant Instagram sans le @, sinon "".
- Laisse "" tout champ introuvable.`;

function urlPrompt(today, url, page) {
  return `Tu extrais les informations d'un événement de basketball à partir du contenu d'une page web (site, réseau social, billetterie).
${RULES}
- "site" : l'URL officielle si présente, sinon l'URL source.

Date du jour : ${today}
URL source : ${url}
Titre : ${page.title}
Description : ${page.description}

Contenu de la page :
${page.text}`;
}

function imagePrompt(today) {
  return `Tu extrais les informations d'un événement de basketball à partir de cette affiche ou capture d'écran. Lis attentivement TOUT le texte visible (titre, dates, lieu, ville, organisateur, contacts, Instagram).
${RULES}

Date du jour : ${today}`;
}

/* Appelle Google Gemini et renvoie l'événement structuré. */
async function runGemini(apiKey, parts) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 2048 }
      })
    }
  );
  if (res.status === 400 || res.status === 403) { const e = new Error("key"); e.code = "KEY"; throw e; }
  if (res.status === 429) { const e = new Error("rate"); e.code = "RATE"; throw e; }
  if (!res.ok) throw new Error("gemini_" + res.status);
  const data = await res.json();
  if (data.promptFeedback && data.promptFeedback.blockReason) throw new Error("blocked");
  const cand = data.candidates && data.candidates[0];
  let text = cand && cand.content && cand.content.parts
    && cand.content.parts.map(p => p.text || "").join("");
  if (!text) throw new Error("empty");
  text = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return normalizeEvent(JSON.parse(text));
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "Méthode non autorisée." }); return; }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ ok: false, error: "Assistant IA non configuré : ajoute la clé GEMINI_API_KEY dans Vercel." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const url = (body && body.url || "").trim();
  const image = body && body.image;
  const idToken = body && body.idToken;

  if (!(await verifyAdmin(idToken))) {
    res.status(403).json({ ok: false, error: "Réservé aux administrateurs connectés." });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    // ---- Cas 1 : import depuis une image / affiche / capture d'écran ----
    if (image) {
      const img = parseDataUrl(image);
      if (!img) { res.status(400).json({ ok: false, error: "Image invalide (formats acceptés : JPG, PNG, GIF, WEBP)." }); return; }
      if (img.data.length > 7 * 1024 * 1024) { res.status(413).json({ ok: false, error: "Image trop lourde (max ~5 Mo)." }); return; }
      const parts = [
        { inline_data: { mime_type: img.mime, data: img.data } },
        { text: imagePrompt(today) }
      ];
      const event = await runGemini(apiKey, parts);
      if (!event.site) event.site = "";
      res.status(200).json({ ok: true, event, poster: image });
      return;
    }

    // ---- Cas 2 : import depuis un lien ----
    let parsed;
    try { parsed = new URL(url); } catch (e) { res.status(400).json({ ok: false, error: "Lien invalide." }); return; }
    if (!/^https?:$/.test(parsed.protocol) || isBlockedHost(parsed.hostname)) {
      res.status(400).json({ ok: false, error: "Lien non autorisé." }); return;
    }
    const html = await fetchUrl(url, 12000, false);
    if (!html) {
      res.status(422).json({ ok: false, error: "Impossible de lire cette page (protégée ou indisponible). Les pages Facebook/Instagram sont souvent inaccessibles — utilise plutôt une capture d'écran." });
      return;
    }
    const page = extractPage(html, url);
    if (page.text.length < 60 && !page.title) {
      res.status(422).json({ ok: false, error: "Pas assez de contenu exploitable sur cette page." });
      return;
    }
    const event = await runGemini(apiKey, [{ text: urlPrompt(today, url, page) }]);
    if (!event.site) event.site = url;
    const poster = await fetchPoster(page.image);
    res.status(200).json({ ok: true, event, poster, sourceUrl: url });
  } catch (err) {
    if (err && err.code === "KEY") { res.status(500).json({ ok: false, error: "Clé GEMINI_API_KEY invalide." }); return; }
    if (err && err.code === "RATE") { res.status(503).json({ ok: false, error: "Limite gratuite atteinte, réessaie dans une minute." }); return; }
    if (err && err.message === "blocked") { res.status(422).json({ ok: false, error: "Contenu refusé par l'IA. Essaie une autre source." }); return; }
    res.status(500).json({ ok: false, error: "L'analyse IA a échoué. Réessaie." });
  }
};

// Exposé pour les tests unitaires (non utilisé par Vercel).
module.exports.extractPage = extractPage;
module.exports.isBlockedHost = isBlockedHost;
module.exports.parseDataUrl = parseDataUrl;
module.exports.normalizeEvent = normalizeEvent;
