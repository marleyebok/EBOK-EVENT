/**
 * Liens courts des événements : ebok.fr/<lien>.
 *
 * Tiré du titre : minuscules, sans accents, mots collés (« La Ligue C
 * Courtcuts » → « liguecourtcuts » : court à taper et à dicter), petits mots
 * retirés, coupé proprement s'il est long, unique. Il ne change plus ensuite,
 * même si le titre change : un lien partagé doit rester valable.
 * L'organisateur et l'admin peuvent le modifier.
 */
import { sql } from "../api/_lib.js";

/* Adresses du site : jamais utilisables comme lien d'événement. */
export const RESERVES = new Set([
  "api", "js", "css", "assets", "compte", "evenement", "evenements", "cgu", "confidentialite", "404",
  "recherche", "publier", "mes-evenements", "profil", "admin", "alertes", "favoris", "inscriptions",
  "organise", "merci", "sitemap", "sitemapxml", "robots", "robotstxt", "favicon", "index", "accueil",
  "connexion", "inscription", "contact", "aide", "ebok", "www", "app", "carte", "agenda",
]);

/* Mots vides retirés des liens générés (gardés s'ils sont saisis à la main). */
const VIDES = new Set(["le", "la", "les", "l", "de", "du", "des", "d", "et", "en", "au", "aux", "a", "un", "une", "the", "of", "edition", "e", "session", "vs"]);
const MAX = 24;

const sansAccents = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Lien saisi à la main : lettres, chiffres et tirets, 3 à 40 caractères. */
export function lienPropre(v) {
  const s = sansAccents(v).toLowerCase().replace(/[^a-z0-9-]+/g, "").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  return s.length >= 3 && s.length <= 40 && !RESERVES.has(s) ? s : "";
}

/** Lien proposé à partir d'un titre : « Camp de basket FFBC – Bugeat 2027 » → « campbasketffbcbugeat2027 ». */
export function lienDepuisTitre(titre) {
  // Tous les mots comptent : la ville ou la session (« – Bugeat », « (U15) »)
  // distinguent souvent deux événements du même organisateur.
  const mots = sansAccents(titre).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const utiles = mots.filter((m) => !VIDES.has(m));
  let out = "";
  for (const m of (utiles.length ? utiles : mots)) {
    if (out && (out + m).length > MAX) break;
    out += m;
  }
  out = out.slice(0, MAX);
  return out.length >= 3 && !RESERVES.has(out) ? out : (out ? out + "-evt" : "evenement");
}

/** Premier lien libre à partir d'une base (base, base2, base3…). */
export async function lienLibre(base, sauf) {
  const pris = new Set((await sql()`
    SELECT data->>'slug' AS s FROM event.events
    WHERE data->>'slug' LIKE ${base + "%"} AND id <> ${sauf || ""}`).map((r) => r.s));
  if (!pris.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!pris.has(base + i)) return base + i;
  return base + Date.now().toString(36);
}

/** Le lien est-il déjà pris par un autre événement ? */
export async function lienPris(lien, sauf) {
  const r = await sql()`SELECT 1 FROM event.events WHERE data->>'slug' = ${lien} AND id <> ${sauf || ""} LIMIT 1`;
  return r.length > 0;
}
