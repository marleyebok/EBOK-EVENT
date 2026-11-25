/**
 * Région d'une ville française, d'après la Base Adresse Nationale (gratuite,
 * sans clé). Sert de filet de sécurité côté serveur : quel que soit le chemin
 * de création (publication, import en lot, détection Instagram, modification),
 * une fiche en France dont la ville est connue repart avec sa région.
 */
export const REGIONS_FR = [
  "Île-de-France", "Centre-Val de Loire", "Bourgogne-Franche-Comté", "Normandie", "Hauts-de-France",
  "Grand Est", "Pays de la Loire", "Bretagne", "Nouvelle-Aquitaine", "Occitanie", "Auvergne-Rhône-Alpes",
  "Provence-Alpes-Côte d'Azur", "Corse", "Guadeloupe", "Martinique", "Guyane", "La Réunion", "Mayotte",
];

/** Minuscules, sans accents ni tirets : « Saint-Étienne » = « saint etienne ». */
export const normaliser = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[-'’]/g, " ").replace(/\s+/g, " ").trim();

/** La région n'a de sens qu'en France (ou pays non précisé). */
export const enFrance = (pays) => !pays || normaliser(pays) === "france";

/**
 * { region, lat, lng } pour une commune française, ou null. La commune
 * trouvée doit porter le nom demandé : « Anderlecht » ne doit pas devenir
 * une rue homonyme à La Réunion.
 */
export async function regionDeVille(ville, { timeout = 3000 } = {}) {
  const v = normaliser(ville);
  if (!v) return null;
  try {
    const r = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(ville)}&type=municipality&limit=5`, { signal: AbortSignal.timeout(timeout) });
    if (!r.ok) return null;
    const d = await r.json();
    const f = (d.features || []).find((x) => {
      const p = x.properties || {};
      return normaliser(p.city || p.name) === v || normaliser(p.name) === v;
    });
    if (!f) return null;
    const ctx = String((f.properties && f.properties.context) || "").split(",").map((s) => s.trim());
    const region = ctx[ctx.length - 1];
    if (!REGIONS_FR.includes(region)) return null;
    const [lng, lat] = (f.geometry && f.geometry.coordinates) || [];
    return { region, lat, lng };
  } catch { return null; }
}
