/* =========================================================
   EBOK — ASSISTANT IA D'IMPORT (fonction serverless Vercel)
   ---------------------------------------------------------
   Reçoit un lien (site, billetterie…) OU une image (affiche, capture),
   récupère le contenu, puis demande à un modèle IA de structurer les
   infos de l'événement. Le formulaire de publication est pré-rempli.

   Ouvert à tout membre connecté. L'appel au modèle pouvant être payant, un
   organisateur dispose d'un quota quotidien (AI_IMPORTS_PAR_JOUR, 5 par
   défaut) ; l'administrateur n'en a pas. Un import qui échoue ne consomme
   pas le quota.

   Auth : jeton de session CLERK (envoyé par le front dans le corps `idToken`
   ou l'en-tête Authorization). L'e-mail est lu en direct depuis Clerk et
   comparé à l'allowlist admin (voir api/_lib.js).

   Fournisseur IA (voir lib/services/AIService.js) :
   - AI_PROVIDER      (optionnel)    "openrouter" (défaut) ou "gemini"

   Variables d'environnement (Vercel > Settings > Environment Variables) :
   - OPENROUTER_API_KEY (obligatoire si AI_PROVIDER=openrouter) clé gratuite openrouter.ai
   - OPENROUTER_MODEL   (optionnel)  modèle(s) à essayer, séparés par des virgules.
     Si tous échouent, le catalogue OpenRouter est interrogé pour prendre le
     relais avec d'autres modèles gratuits (voir OpenRouterProvider.js).
   - GEMINI_API_KEY     (obligatoire si AI_PROVIDER=gemini)     clé Google AI Studio
     ⚠️ l'offre gratuite Gemini est bloquée pour les comptes UE / UK / Suisse.
   - CLERK_SECRET_KEY (obligatoire)  pour valider le jeton de session Clerk
   - ADMIN_EMAILS     (optionnel)    emails admin additionnels, séparés par des virgules
   - AI_IMPORTS_PAR_JOUR (optionnel) quota quotidien d'un organisateur (défaut 5)
   ========================================================= */
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { verifyToken } from "@clerk/backend";
import { clerkUser, isAdminEmail, hasDb, sql, ensureSchema } from "./_lib.js";
import { AIService } from "../lib/services/AIService.js";

const TYPES = [
  "Tournoi", "Camp", "Voyage", "All-Star Game", "Show", "Détections",
  "Clinic Coachs", "Circuit 3x3", "Handibasket", "Matchs de Gala", "Divers"
];
const FIELDS = ["title", "type", "city", "region", "pays", "address", "dateStart", "dateEnd",
  "sexe", "niveau", "description", "orgName", "insta", "site", "tarif"];

// Un événement peut viser plusieurs catégories : `age` est une liste.
const AGE_OPTIONS = ["Tout public", "U7", "U9", "U11", "U13", "U15", "U17",
  "U18", "U21", "Adulte", "Non renseigné"];

// Détails propres aux séjours (type « Voyage »).
const VOYAGE_FIELDS = ["dateDepart", "dateRetour", "lieuxDepart", "lieuRetour",
  "destination", "logement"];

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

/* Identifie l'appelant : membre connecté (jeton de session Clerk valide), et
   admin ou non. Renvoie null sans session valide. */
async function identifier(token) {
  if (!token) return null;
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    if (!payload || typeof payload.sub !== "string") return null;
    const { email } = await clerkUser(payload.sub);
    return { uid: payload.sub, admin: isAdminEmail(email) };
  } catch (e) { return null; }
}

/* Quota quotidien d'un organisateur. */
function quotaJour() {
  const n = parseInt(process.env.AI_IMPORTS_PAR_JOUR || "", 10);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/* Réserve un import dans le quota du jour. Renvoie false si le quota est
   atteint. La réservation est atomique : deux imports lancés en même temps
   ne peuvent pas dépasser la limite. Sans base, pas de quota possible : on
   laisse passer plutôt que de bloquer tout le monde. */
async function reserverImport(uid) {
  if (!hasDb()) return true;
  await ensureSchema();
  const rows = await sql()`
    INSERT INTO event.ai_imports (user_id, day, count)
    VALUES (${uid}, CURRENT_DATE, 1)
    ON CONFLICT (user_id, day) DO UPDATE
      SET count = event.ai_imports.count + 1
      WHERE event.ai_imports.count < ${quotaJour()}
    RETURNING count`;
  return rows.length > 0;
}

/* Rend l'import réservé quand il a échoué : on ne fait pas payer un essai
   raté (page illisible, modèle saturé…). */
async function rendreImport(uid) {
  if (!hasDb()) return;
  try {
    await sql()`
      UPDATE event.ai_imports SET count = GREATEST(count - 1, 0)
      WHERE user_id = ${uid} AND day = CURRENT_DATE`;
  } catch (e) { /* sans gravité : au pire un import compté en trop */ }
}

/* Adresses que le serveur ne doit jamais aller lire pour le compte d'un
   membre : boucle locale, réseaux privés, lien local, plages réservées. */
const RESEAUX_INTERDITS = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
]) RESEAUX_INTERDITS.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [["::", 127], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]]) {
  RESEAUX_INTERDITS.addSubnet(net, bits, "ipv6");
}

function adresseInterdite(ip) {
  // « ::ffff:127.0.0.1 » est du 127.0.0.1 écrit en IPv6.
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (v4) ip = v4[1];
  const famille = isIP(ip);
  if (!famille) return true;
  if (famille === 6 && /^::ffff:/i.test(ip)) return true;
  return RESEAUX_INTERDITS.check(ip, famille === 4 ? "ipv4" : "ipv6");
}

/* Le nom d'hôte est-il lisible ? La liste de noms (isBlockedHost) ne suffit
   pas : un nom public peut pointer vers une adresse interne, et une adresse
   peut s'écrire de dix façons. On juge donc sur les adresses RÉSOLUES. */
async function hoteAutorise(hostname) {
  const h = String(hostname || "").replace(/^\[|\]$/g, "");
  if (isBlockedHost(h)) return false;
  if (isIP(h)) return !adresseInterdite(h);
  try {
    const adresses = await lookup(h, { all: true });
    return adresses.length > 0 && adresses.every((a) => !adresseInterdite(a.address));
  } catch (e) { return false; }
}

const MAX_REDIRECTIONS = 5;
const MAX_OCTETS = 5 * 1024 * 1024;

/* Lit le corps sans dépasser MAX_OCTETS : une page géante ne doit pas
   remplir la mémoire de la fonction. */
async function lireCorps(res) {
  const annonce = Number(res.headers.get("content-length") || 0);
  if (annonce > MAX_OCTETS) return null;
  if (!res.body) return Buffer.alloc(0);
  const morceaux = [];
  let total = 0;
  for await (const m of res.body) {
    total += m.length;
    if (total > MAX_OCTETS) return null;
    morceaux.push(m);
  }
  return Buffer.concat(morceaux);
}

/* Récupère le contenu d'une URL avec un délai maximal. Les redirections sont
   suivies à la main : chaque étape est revérifiée, sinon une page publique
   pourrait renvoyer le serveur vers une adresse interne. */
async function fetchUrl(url, ms, asBuffer) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    let courante = String(url);
    for (let saut = 0; saut <= MAX_REDIRECTIONS; saut++) {
      const u = new URL(courante);
      if (!/^https?:$/.test(u.protocol) || !(await hoteAutorise(u.hostname))) return null;
      const res = await fetch(u, {
        signal: ctrl.signal,
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EBOK/1.0; +https://ebok.fr)" }
      });
      if (res.status >= 300 && res.status < 400) {
        const suite = res.headers.get("location");
        if (!suite) return null;
        courante = new URL(suite, u).href;
        continue;
      }
      if (!res.ok) return null;
      const buf = await lireCorps(res);
      if (!buf) return null;
      if (asBuffer) return { buf, type: res.headers.get("content-type") || "" };
      return buf.toString("utf8");
    }
    return null;
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
/* Pays en français, tel que le formulaire le propose. Les formes courantes
   (anglais, province, abréviation) sont ramenées au nom du pays. */
const PAYS_ALIAS = {
  "france": "France", "belgique": "Belgique", "belgium": "Belgique", "belgie": "Belgique",
  "suisse": "Suisse", "switzerland": "Suisse", "schweiz": "Suisse",
  "canada": "Canada", "quebec": "Canada", "québec": "Canada",
  "luxembourg": "Luxembourg",
};
function normaliserPays(p) {
  const brut = String(p || "").trim();
  if (!brut) return "France";
  const cle = brut.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return PAYS_ALIAS[cle] || PAYS_ALIAS[brut.toLowerCase()] || brut;
}

function normalizeEvent(e) {
  e = e || {};
  const out = {};
  for (const k of FIELDS) out[k] = (e[k] == null) ? "" : String(e[k]).trim();
  if (out.type && !TYPES.includes(out.type)) out.type = "Divers";
  if (!["Masculin", "Féminin", "Mixte"].includes(out.sexe)) out.sexe = "";
  out.insta = out.insta.replace(/^@/, "");
  out.pays = normaliserPays(out.pays);

  // `age` : liste, en ne gardant que les catégories connues. Le modèle renvoie
  // parfois une chaîne unique ou "U13, U15" — les deux sont acceptés.
  const rawAges = Array.isArray(e.age) ? e.age : String(e.age == null ? "" : e.age).split(",");
  out.age = rawAges
    .map(a => String(a).trim())
    .filter(a => AGE_OPTIONS.includes(a));

  // `voyage` : conservé uniquement pour un séjour effectivement renseigné.
  const v = e.voyage || {};
  const voyage = {};
  let hasVoyage = false;
  for (const k of VOYAGE_FIELDS) {
    const value = (v[k] == null) ? "" : String(v[k]).trim();
    voyage[k] = value;
    if (value) hasVoyage = true;
  }
  out.voyage = (out.type === "Voyage" && hasVoyage) ? voyage : null;

  return out;
}

const RULES =
`Réponds avec un OBJET JSON aux clés EXACTES : title, type, city, region, pays, address, dateStart, dateEnd, sexe, age, niveau, description, orgName, insta, site, tarif, voyage.
Règles :
- "type" : une seule valeur parmi [${TYPES.join(", ")}] (par défaut "Divers").
- "dateStart" / "dateEnd" : format AAAA-MM-JJ. S'il n'y a qu'une date, mets-la dans les deux. Si une date manque, mets "". N'INVENTE JAMAIS de date.
- "sexe" : "Masculin", "Féminin", "Mixte" ou "".
- "age" : TABLEAU de catégories parmi [${AGE_OPTIONS.join(", ")}]. Les mentions "U13", "moins de 13 ans", "benjamins" donnent "U13", etc. Si l'événement est ouvert à tous, mets ["Tout public"]. Si rien n'est indiqué, mets [].
- "pays" : le pays de l'événement, en français ("France", "Belgique", "Suisse", "Canada"…). Le Québec est au Canada. Par défaut "France".
- "region" : la région déduite de la ville si possible, sinon "" — France : région administrative (ex. "Occitanie") ; Belgique : province (ex. "Liège") ; Suisse : canton (ex. "Vaud") ; Canada : province (ex. "Québec").
- "description" : 2 à 4 phrases synthétiques en français.
- "insta" : identifiant Instagram sans le @, sinon "".
- "tarif" : le ou les prix indiqués, tels quels (ex. "15 € par joueur, gratuit -12 ans"), sinon "".
- "voyage" : UNIQUEMENT si "type" vaut "Voyage", un objet aux clés dateDepart, dateRetour (AAAA-MM-JJ), lieuxDepart (villes de départ possibles), lieuRetour, destination, logement. Sinon mets null.
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

/* L'IA est appelée via le service fournisseur-agnostique. */
async function runAI(parts, prompt) {
  const ai = new AIService();
  const event = await ai.extractEvent({ parts, prompt });
  const fiche = normalizeEvent(event);
  // Le modèle retenu remonte jusqu'à l'interface : quand l'extraction se
  // trompe, savoir qui a répondu est la première information utile.
  fiche.modele = event.__modele || "";
  return fiche;
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "Méthode non autorisée." }); return; }

  const useGemini = process.env.AI_PROVIDER === "gemini";
  const configured = useGemini ? process.env.GEMINI_API_KEY : process.env.OPENROUTER_API_KEY;
  if (!configured) {
    const missing = useGemini ? "GEMINI_API_KEY" : "OPENROUTER_API_KEY";
    res.status(500).json({ ok: false, error: `Assistant IA non configuré : ajoute la clé ${missing} dans Vercel.` });
    return;
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const url = (body && body.url || "").trim();
  const image = body && body.image;
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  const token = (body && body.idToken) || (authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "");

  const appelant = await identifier(token);
  if (!appelant) {
    res.status(401).json({ ok: false, error: "Connecte-toi pour utiliser l'assistant IA." });
    return;
  }
  // Le quota ne concerne que les organisateurs ; il est réservé avant l'appel
  // au modèle et rendu si l'import échoue (voir plus bas).
  const avecQuota = !appelant.admin;
  if (avecQuota) {
    let ok = false;
    try { ok = await reserverImport(appelant.uid); } catch (e) { ok = true; /* base en panne : on ne bloque pas */ }
    if (!ok) {
      res.status(429).json({ ok: false, error: `Tu as utilisé tes ${quotaJour()} imports IA du jour. Tu peux remplir le formulaire à la main, ou réessayer demain.` });
      return;
    }
  }
  // Toute réponse autre qu'un succès rend l'import au quota.
  const echec = async () => { if (avecQuota) await rendreImport(appelant.uid); };
  let reussi = false;

  const today = new Date().toISOString().slice(0, 10);

  try {
    // ---- Cas 1 : import depuis une image / affiche / capture d'écran ----
    if (image) {
      const img = parseDataUrl(image);
      if (!img) { res.status(400).json({ ok: false, error: "Image invalide (formats acceptés : JPG, PNG, GIF, WEBP)." }); return; }
      // Vercel refuse un corps de requête au-delà de ~4,5 Mo : au-dessus de
      // cette taille la plateforme répond avant nous (le front recompresse
      // l'affiche en amont, cette garde couvre les appels directs).
      if (img.data.length > 4 * 1024 * 1024) { res.status(413).json({ ok: false, error: "Image trop lourde (max ~3 Mo)." }); return; }
      const parts = [
        { inline_data: { mime_type: img.mime, data: img.data } }
      ];
      const event = await runAI(parts, imagePrompt(today));
      if (!event.site) event.site = "";
      reussi = true;
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
    const event = await runAI([], urlPrompt(today, url, page));
    if (!event.site) event.site = url;
    const poster = await fetchPoster(page.image);
    reussi = true;
    res.status(200).json({ ok: true, event, poster, sourceUrl: url });
  } catch (err) {
    const responses = {
      GEMINI_CONFIGURATION: [500, "La configuration Gemini est invalide."],
      GEMINI_QUOTA: [429, "La limite Gemini est atteinte. Réessaie dans quelques instants."],
      GEMINI_REFUSAL: [422, "Le modèle a refusé le contenu. Essaie une autre source."],
      GEMINI_EMPTY_RESPONSE: [422, "Le modèle n'a renvoyé aucune donnée exploitable."],
      GEMINI_INCOMPLETE_RESPONSE: [422, "La réponse du modèle a été tronquée. Réessaie avec une source plus courte."],
      GEMINI_INVALID_JSON: [422, "Le modèle a renvoyé des données dans un format invalide."],
      GEMINI_INVALID_RESPONSE: [502, "Gemini a renvoyé une réponse illisible."],
      GEMINI_UNAVAILABLE: [502, "Le service Gemini est temporairement indisponible."],
      OPENROUTER_CONFIGURATION: [500, "La configuration OpenRouter est invalide (clé ou modèle)."],
      OPENROUTER_MODEL_REJECTED: [500, "Le modèle OpenRouter configuré a été refusé. Vérifie OPENROUTER_MODEL."],
      OPENROUTER_QUOTA: [429, "La limite OpenRouter est atteinte. Réessaie dans quelques instants."],
      OPENROUTER_REFUSAL: [422, "Le modèle a refusé le contenu. Essaie une autre source."],
      OPENROUTER_EMPTY_RESPONSE: [422, "Le modèle n'a renvoyé aucune donnée exploitable."],
      OPENROUTER_INCOMPLETE_RESPONSE: [422, "La réponse du modèle a été tronquée. Réessaie avec une source plus courte."],
      OPENROUTER_INVALID_JSON: [422, "Le modèle a renvoyé des données dans un format invalide."],
      OPENROUTER_INVALID_RESPONSE: [502, "OpenRouter a renvoyé une réponse illisible."],
      OPENROUTER_UNAVAILABLE: [502, "Le service OpenRouter est temporairement indisponible."]
    };
    const [status, fallback] = responses[err?.code] || [500, "L'analyse IA a échoué. Réessaie."];
    // Les erreurs OpenRouter portent le motif exact renvoyé par la plateforme
    // (modèle saturé en amont, quota du compte épuisé, modèle retiré du
    // catalogue). Le remplacer par un message générique rend la panne
    // indiagnosticable — c'est le message brut qui sert au dépannage.
    const detailed = typeof err?.code === "string" && err.code.startsWith("OPENROUTER_") && err.message
      ? err.message
      : fallback;
    res.status(status).json({ ok: false, code: err?.code || "IMPORT_ANALYSIS_FAILED", error: detailed });
  } finally {
    if (!reussi) await echec();
  }
}

// Exposé pour les tests unitaires (non utilisé par Vercel).
export { extractPage, isBlockedHost, hoteAutorise, parseDataUrl, normalizeEvent, fetchUrl, TYPES, AGE_OPTIONS, normaliserPays };
