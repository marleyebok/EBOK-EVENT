/**
 * Plan du site pour les moteurs de recherche : /sitemap.xml (réécrit ici par
 * vercel.json).
 *
 * Généré à chaque demande depuis la base, pour qu'un événement validé soit
 * proposé à Google sans intervention : un fichier statique serait périmé dès
 * la publication suivante. Seuls les événements « approved » y figurent — une
 * fiche en attente de validation n'a rien à faire dans un moteur.
 *
 * Les adresses pointent toujours vers le domaine officiel, jamais vers une
 * adresse de test en …vercel.app.
 */
import { hasDb, sql } from "./_lib.js";

const ORIGINE = "https://event.ebok.fr";

/** Pages fixes du site, hors espace compte (réservé aux membres connectés). */
const PAGES_FIXES = [
  { loc: "/", priority: "1.0", changefreq: "daily" },
  { loc: "/cgu", priority: "0.2", changefreq: "yearly" },
  { loc: "/confidentialite", priority: "0.2", changefreq: "yearly" },
];

/** Échappe pour un contenu XML. */
function xml(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Date au format AAAA-MM-JJ, ou null si illisible. */
function jour(d) {
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
}

function url({ loc, lastmod, changefreq, priority }) {
  return [
    "  <url>",
    `    <loc>${xml(ORIGINE + loc)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    priority ? `    <priority>${priority}</priority>` : null,
    "  </url>",
  ].filter(Boolean).join("\n");
}

export default async function handler(req, res) {
  const entrees = PAGES_FIXES.map(url);

  if (hasDb()) {
    try {
      const rows = await sql()`
        SELECT id, created_at, data->>'dateEnd' AS date_end
        FROM event.events
        WHERE status = 'approved'
        ORDER BY created_at DESC
        LIMIT 5000`;
      const aujourdhui = new Date().toISOString().slice(0, 10);
      for (const r of rows) {
        // Un événement passé reste consultable (archives) mais intéresse moins.
        const aVenir = !r.date_end || r.date_end >= aujourdhui;
        entrees.push(url({
          loc: `/evenement/${encodeURIComponent(r.id)}`,
          lastmod: jour(r.created_at),
          changefreq: aVenir ? "weekly" : "yearly",
          priority: aVenir ? "0.8" : "0.3",
        }));
      }
    } catch {
      /* base indisponible : on sert au moins les pages fixes */
    }
  }

  const corps = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entrees,
    "</urlset>",
    "",
  ].join("\n");

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  return res.end(corps);
}
