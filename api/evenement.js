/**
 * Page d'un événement : /evenement/<id> (réécrit ici par vercel.json).
 *
 * Sert index.html en y injectant les métadonnées DE CET ÉVÉNEMENT — titre,
 * description, Open Graph et données structurées schema.org/Event. C'est ce qui
 * donne un aperçu correct quand on colle le lien dans WhatsApp ou sur les
 * réseaux, et ce qui permet à Google d'indexer chaque événement.
 *
 * L'app côté navigateur prend ensuite le relais normalement : elle lit l'URL au
 * démarrage et ouvre la bonne fiche (voir js/app.js). Aucune duplication de
 * l'affichage ici — uniquement le <head>.
 *
 * Repli volontairement discret : si l'événement est introuvable, privé, ou si la
 * base ne répond pas, on renvoie la page inchangée. Un visiteur ne voit jamais
 * d'erreur ; il perd seulement l'aperçu enrichi.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasDb, sql } from "./_lib.js";

const OG_START = "<!-- og:start";
const OG_END = "<!-- og:end -->";
const SITE = "EBOK Event";

/** Échappe pour une valeur d'attribut HTML. */
function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Coupe proprement (sur un mot) pour une description de partage. */
function clamp(text, max) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}

function origin(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "event.ebok.fr";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

/** « 13 → 17 juillet 2026 » (mois commun factorisé), « 30 juin → 2 juillet 2026 »
 *  quand il change, ou une seule date si l'événement dure un jour. */
function frDates(start, end) {
  const d = (v) => {
    const t = new Date(v);
    return Number.isNaN(t.getTime()) ? null : t;
  };
  const a = d(start);
  const b = end && end !== start ? d(end) : null;
  const full = (t) => t.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  if (!a) return b ? full(b) : "";
  if (!b) return full(a);
  // Même mois et même année : on n'écrit le mois qu'une fois.
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} → ${full(b)}`;
  }
  const noYear = (t) => t.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  return a.getFullYear() === b.getFullYear()
    ? `${noYear(a)} → ${full(b)}`
    : `${full(a)} → ${full(b)}`;
}

/* --- Récupération de la coquille HTML ------------------------------------- */
let cachedShell = null;

async function shell(req) {
  if (cachedShell) return cachedShell;

  // 1) Fichier embarqué dans la fonction (voir `includeFiles` dans vercel.json).
  try {
    cachedShell = readFileSync(join(process.cwd(), "public", "index.html"), "utf8");
    return cachedShell;
  } catch {
    /* on tente le repli ci-dessous */
  }

  // 2) Repli : la page servie par le CDN du même déploiement. Pas de récursion,
  //    la réécriture ne concerne que /evenement/*.
  const res = await fetch(`${origin(req)}/`, { headers: { "user-agent": "ebok-og" } });
  if (!res.ok) throw new Error(`coquille indisponible (${res.status})`);
  cachedShell = await res.text();
  return cachedShell;
}

/* --- Injection des métadonnées -------------------------------------------- */
function metaBlock(ev, id, req) {
  const base = origin(req);
  const url = `${base}/evenement/${encodeURIComponent(id)}`;
  const dates = frDates(ev.dateStart, ev.dateEnd);
  const place = ev.lieu || [ev.city, ev.region].filter(Boolean).join(", ");

  const title = [ev.title, dates && `${dates}`, ev.city].filter(Boolean).join(" — ");
  const description = clamp(
    ev.description ||
      [ev.type, ev.niveau, ev.age, ev.sexe].filter(Boolean).join(" · ") ||
      `Événement basket à ${ev.city || "découvrir"}.`,
    200
  );

  // Les affiches sont stockées en data-URI dans la base : inutilisables comme
  // image d'aperçu. On ne prend le poster que s'il est déjà une vraie URL
  // (le jour où les affiches seront hébergées comme fichiers).
  const poster = typeof ev.poster === "string" && /^https?:\/\//i.test(ev.poster) ? ev.poster : null;
  const image = poster || `${base}/assets/favicon-192.png`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: ev.title || "Événement",
    description,
    url,
    ...(ev.dateStart ? { startDate: ev.dateStart } : {}),
    ...(ev.dateEnd ? { endDate: ev.dateEnd } : {}),
    ...(place
      ? {
          location: {
            "@type": "Place",
            name: place,
            ...(ev.infos && ev.infos.adresse
              ? { address: { "@type": "PostalAddress", streetAddress: ev.infos.adresse } }
              : {}),
          },
        }
      : {}),
    ...(ev.org && ev.org.name
      ? { organizer: { "@type": "Organization", name: ev.org.name } }
      : {}),
    ...(poster ? { image: poster } : {}),
  };

  return `${OG_START} — injecté pour « ${esc(ev.title || id)} » -->
<meta property="og:type" content="article">
<meta property="og:site_name" content="${SITE}">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="${poster ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
${OG_END}`;
}

/** Remplace le bloc entre marqueurs, ainsi que <title> et la description.
 *  Exporté pour être testable hors Vercel (seul `default` sert de handler). */
export function inject(html, ev, id, req) {
  const start = html.indexOf(OG_START);
  const end = html.indexOf(OG_END);
  if (start === -1 || end === -1) return html; // marqueurs retirés : on ne touche à rien

  const dates = frDates(ev.dateStart, ev.dateEnd);
  const pageTitle = [ev.title, dates, ev.city].filter(Boolean).join(" — ") + ` | ${SITE}`;
  const description = clamp(ev.description || "", 200);

  let out =
    html.slice(0, start) + metaBlock(ev, id, req) + html.slice(end + OG_END.length);

  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(pageTitle)}</title>`);
  if (description) {
    out = out.replace(
      /<meta name="description" content="[^"]*">/i,
      `<meta name="description" content="${esc(description)}">`
    );
  }
  return out;
}

/* --- Handler --------------------------------------------------------------- */
export default async function handler(req, res) {
  const id = String((req.query || {}).id || "").trim();

  let html;
  try {
    html = await shell(req);
  } catch {
    // Coquille introuvable : mieux vaut la carte qu'une page d'erreur.
    res.statusCode = 302;
    res.setHeader("Location", "/");
    return res.end();
  }

  let ev = null;
  if (id && hasDb()) {
    try {
      // Uniquement les événements publiés : on n'expose pas au partage ni aux
      // moteurs une fiche en attente de validation.
      const rows = await sql()`
        SELECT data FROM event.events WHERE id = ${id} AND status = 'approved'`;
      ev = (rows[0] && rows[0].data) || null;
    } catch {
      /* base indisponible : page inchangée */
    }
  }

  if (ev) html = inject(html, ev, id, req);

  // 200 même sans métadonnées : certains événements ne vivent pas en base
  // (données locales de data.js) et la page reste parfaitement fonctionnelle.
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=300, stale-while-revalidate=86400"
  );
  return res.end(html);
}
