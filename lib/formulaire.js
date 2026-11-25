/**
 * Formulaire d'inscription sur mesure (outils d'organisateur).
 *
 * Les questions types reprennent celles qui reviennent dans les formulaires
 * d'inscription des camps, stages, tournois, voyages et détections
 * (analyse de 23 formulaires, novembre 2026) ; les modèles par type
 * d'événement sont côté navigateur (public/js/formulaire.js).
 *
 * L'organisateur coche des QUESTIONS TYPES (date de naissance, poste, taille de
 * maillot…) et ajoute des QUESTIONS LIBRES (texte, choix unique, choix
 * multiples, oui / non), comme un formulaire Google. Il règle aussi l'inscription
 * d'équipe, les tarifs et options (informatif : EBOK n'encaisse rien), la
 * logistique des camps (repas, hébergement, chambres, groupes) et le pointage.
 *
 * Ce module nettoie la configuration envoyée par l'organisateur et les réponses
 * envoyées par le participant : le navigateur n'est jamais cru sur parole.
 *
 * Données sensibles (RGPD, art. 9) : les allergies relèvent de la santé et un
 * régime alimentaire peut révéler une conviction religieuse. Ces deux questions
 * sont marquées `sensible` : le participant doit donner son accord explicite
 * avant l'envoi, et cet accord est enregistré avec la demande.
 */
import { newId } from "../api/_lib.js";

const txt = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);

export const CATEGORIES_AGE = ["U7", "U9", "U11", "U13", "U15", "U17", "U18", "U20", "U21", "Senior", "Vétéran"];
export const QUESTIONS_TYPES = {
  // Le joueur
  naissance:   { label: "Date de naissance", type: "date" },
  sexe:        { label: "Sexe", type: "choix", options: ["Fille", "Garçon"] },
  categorie:   { label: "Catégorie", type: "choix", options: CATEGORIES_AGE },
  taille:      { label: "Taille (cm)", type: "nombre" },
  poste:       { label: "Poste", type: "choix", options: ["Meneur", "Arrière", "Ailier", "Ailier fort", "Pivot"] },
  niveau:      { label: "Niveau", type: "choix", options: ["Loisir", "Départemental", "Régional", "National", "Pro"] },
  annees:      { label: "Années de pratique du basket", type: "nombre" },
  club:        { label: "Club actuel", type: "texte" },
  licencie:    { label: "Licencié(e) en club ?", type: "choix", options: ["Oui, au club organisateur", "Oui, dans un autre club", "Non licencié(e)"] },
  licence:     { label: "Numéro de licence", type: "texte" },
  maillot:     { label: "Taille de tenue (t-shirt, maillot)", type: "choix", options: ["8 ans", "10 ans", "12 ans", "14 ans", "XS", "S", "M", "L", "XL", "XXL", "XXXL"] },
  // Détection
  clubPrecedent: { label: "Club(s) des saisons précédentes", type: "texte" },
  selections:  { label: "Déjà retenu(e) en sélection départementale ou régionale ?", type: "ouinon" },
  coach:       { label: "Coach actuel", type: "contact" },
  motivation:  { label: "Ton projet basket, tes motivations", type: "texte" },
  video:       { label: "Lien vers une vidéo (highlights ou match)", type: "texte" },
  // Santé (données sensibles)
  allergies:   { label: "Allergies ou intolérances", type: "texte", sensible: true },
  regime:      { label: "Régime alimentaire", type: "multi", options: ["Aucun", "Végétarien", "Sans porc", "Halal", "Casher", "Sans gluten", "Autre"], sensible: true },
  traitement:  { label: "Traitement médical en cours", type: "texte", sensible: true },
  blessures:   { label: "Blessures récentes ou antécédents", type: "texte", sensible: true },
  // Parents et autorisations
  responsable: { label: "Responsable légal (pour un mineur)", type: "contact" },
  urgence:     { label: "Contact en cas d'urgence", type: "contact" },
  autorisation:{ label: "J'autorise mon enfant à participer (responsable légal)", type: "accord" },
  sortieSeul:  { label: "Autorisé(e) à repartir seul(e) en fin de journée ?", type: "ouinon" },
  image:       { label: "Photos et vidéos autorisées (droit à l'image) ?", type: "ouinon" },
  reglement:   { label: "J'ai lu et j'accepte le règlement et les conditions d'annulation", type: "accord" },
  // Voyage et infos pratiques
  adresse:     { label: "Adresse postale", type: "texte" },
  passeport:   { label: "Passeport", type: "choix", options: ["Passeport valide", "Demande en cours", "Pas de passeport"] },
  nbPersonnes: { label: "Nombre de personnes (toi compris)", type: "nombre" },
  voyageurs:   { label: "Noms et prénoms des autres participants", type: "texte" },
  nbEquipes:   { label: "Nombre d'équipes engagées", type: "nombre" },
  connu:       { label: "Comment as-tu connu l'événement ?", type: "choix", options: ["Réseaux sociaux", "Mon club", "Bouche-à-oreille", "EBOK", "Autre"] },
};
const TYPES_LIBRES = ["texte", "choix", "multi", "ouinon"];
const FORMULES_REPAS = ["Pension complète", "Demi-pension", "Externe"];

const liste = (v, max, n) => Array.isArray(v) ? [...new Set(v.map((x) => txt(x, max)).filter(Boolean))].slice(0, n) : [];
const montant = (v) => Math.max(0, Math.min(100000, Math.round((parseFloat(String(v).replace(",", ".")) || 0) * 100) / 100));

/** Configuration du formulaire et des options d'inscription, nettoyée. */
export function configPropre(r) {
  const questions = (Array.isArray(r.questions) ? r.questions : []).map((q) => {
    if (!q || typeof q !== "object") return null;
    const id = txt(q.id, 40) || "q" + newId().slice(0, 8);
    if (q.preset && QUESTIONS_TYPES[q.preset]) {
      const p = QUESTIONS_TYPES[q.preset];
      // Une case d'accord (autorisation, règlement) n'a de sens qu'obligatoire ;
      // une question de santé ne l'est jamais (RGPD, art. 9 : accord libre).
      return { id: q.preset, preset: q.preset, label: p.label, type: p.type, options: p.options || [], obligatoire: p.type === "accord" || (!p.sensible && !!q.obligatoire), sensible: !!p.sensible };
    }
    const type = TYPES_LIBRES.includes(q.type) ? q.type : "texte";
    const label = txt(q.label, 140);
    if (!label) return null;
    const options = type === "choix" || type === "multi" ? liste(q.options, 80, 20) : [];
    if ((type === "choix" || type === "multi") && options.length < 2) return null;
    return { id: id.startsWith("q") ? id : "q" + id, label, type, options, obligatoire: !!q.obligatoire, sensible: false };
  }).filter(Boolean);
  // Une même question type n'apparaît qu'une fois.
  const vus = new Set();
  const questionsUniques = questions.filter((q) => !vus.has(q.id) && vus.add(q.id)).slice(0, 40);

  const e = r.equipes && typeof r.equipes === "object" ? r.equipes : {};
  const min = Math.max(1, Math.min(30, parseInt(e.min, 10) || 1));
  const max = Math.max(min, Math.min(30, parseInt(e.max, 10) || Math.max(min, 5)));
  const tarif = (t) => ({ id: txt(t && t.id, 20) || newId().slice(0, 8), nom: txt(t && t.nom, 80), prix: montant(t && t.prix) });
  const lg = r.logistique && typeof r.logistique === "object" ? r.logistique : {};
  const pt = r.pointage && typeof r.pointage === "object" ? r.pointage : {};
  return {
    questions: questionsUniques,
    // Modèle de départ choisi (camp, stage…) : évite de le réappliquer.
    modele: ["camp", "stage", "tournoi", "voyage", "detection", "vide"].includes(r.modele) ? r.modele : "",
    equipes: { active: !!e.active, min, max },
    tarifs: (Array.isArray(r.tarifs) ? r.tarifs : []).map(tarif).filter((t) => t.nom).slice(0, 10),
    options: (Array.isArray(r.options) ? r.options : []).map(tarif).filter((t) => t.nom).slice(0, 15),
    logistique: {
      repas: !!lg.repas,
      formules: liste(lg.formules, 60, 8).length ? liste(lg.formules, 60, 8) : FORMULES_REPAS,
      hebergement: !!lg.hebergement,
      chambres: liste(lg.chambres, 60, 100),
      groupes: liste(lg.groupes, 60, 50),
    },
    pointage: { active: !!pt.active, qr: !!pt.qr },
    rappelVeille: r.rappelVeille !== false,
  };
}

function reponseValide(q, v) {
  if (v == null || v === "") return null;
  switch (q.type) {
    case "date": return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null;
    case "nombre": { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 && n <= 300 ? n : null; }
    case "choix": return q.options.includes(String(v)) ? String(v) : null;
    case "multi": { const a = (Array.isArray(v) ? v : [v]).map(String).filter((x) => q.options.includes(x)); return a.length ? [...new Set(a)] : null; }
    case "ouinon": return v === "oui" || v === "non" ? v : null;
    case "accord": return v === true || v === "oui" ? "oui" : null;
    case "contact": {
      if (typeof v !== "object") return null;
      const c = { nom: txt(v.nom, 120), tel: txt(v.tel, 30), email: txt(v.email, 160) };
      return c.nom || c.tel || c.email ? c : null;
    }
    default: return txt(v, 500) || null;
  }
}

/**
 * Nettoie la partie « sur mesure » d'une demande d'inscription.
 * Renvoie { erreur } si une réponse obligatoire manque ou si l'accord pour les
 * données sensibles n'est pas donné, sinon { demande } à fusionner.
 */
export function demandePropre(config, body) {
  const reponses = {};
  const brutes = body.reponses && typeof body.reponses === "object" ? body.reponses : {};
  for (const q of config.questions) {
    const v = reponseValide(q, brutes[q.id]);
    if (v == null) {
      if (q.obligatoire) return { erreur: "reponse_manquante", question: q.label };
      continue;
    }
    reponses[q.id] = v;
  }
  const sensibles = config.questions.filter((q) => q.sensible && reponses[q.id] != null);
  let consentement = null;
  if (sensibles.length) {
    if (body.consentement !== true) return { erreur: "consentement" };
    consentement = { donnees: sensibles.map((q) => q.id), le: new Date().toISOString() };
  }
  const out = { reponses };
  if (consentement) out.consentement = consentement;

  if (config.equipes.active) {
    const membres = (Array.isArray(body.membres) ? body.membres : [])
      .map((m) => ({ nom: txt(m && m.nom, 120) })).filter((m) => m.nom).slice(0, config.equipes.max);
    if (membres.length < config.equipes.min) return { erreur: "equipe_incomplete", min: config.equipes.min };
    if (!txt(body.equipe, 120)) return { erreur: "nom_equipe" };
    out.membres = membres;
  }
  if (config.tarifs.length) {
    const t = config.tarifs.find((x) => x.id === body.tarif);
    if (!t) return { erreur: "tarif" };
    out.tarif = t.id;
  }
  if (config.options.length && Array.isArray(body.options)) {
    out.options = config.options.filter((o) => body.options.includes(o.id)).map((o) => o.id);
  }
  if (config.logistique.repas && config.logistique.formules.includes(body.repas)) out.repas = body.repas;
  if (config.logistique.hebergement && ["pensionnaire", "externe"].includes(body.hebergement)) out.hebergement = body.hebergement;
  return { demande: out };
}

/** Montant dû d'une inscription (informatif). */
export function montantDu(config, demande) {
  const t = config.tarifs.find((x) => x.id === demande.tarif);
  const opts = config.options.filter((o) => (demande.options || []).includes(o.id));
  return Math.round(((t ? t.prix : 0) + opts.reduce((s, o) => s + o.prix, 0)) * 100) / 100;
}

/** Champs de gestion qu'un organisateur peut poser sur une inscription. */
export function gestionPropre(avant, patch, uid) {
  const g = { ...(avant || {}) };
  if (!patch || typeof patch !== "object") return g;
  if (patch.paiement && typeof patch.paiement === "object") {
    const statut = ["a_payer", "partiel", "paye", "offert"].includes(patch.paiement.statut) ? patch.paiement.statut : (g.paiement && g.paiement.statut) || "a_payer";
    g.paiement = { statut, recu: montant(patch.paiement.recu != null ? patch.paiement.recu : g.paiement && g.paiement.recu) };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "groupe")) g.groupe = txt(patch.groupe, 60);
  if (Object.prototype.hasOwnProperty.call(patch, "chambre")) g.chambre = txt(patch.chambre, 60);
  if (Object.prototype.hasOwnProperty.call(patch, "present")) g.present = patch.present ? { le: new Date().toISOString(), par: uid } : null;
  return g;
}
