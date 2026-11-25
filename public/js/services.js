/* =========================================================
   EBOK — COUCHE API (Neon via /api + Clerk)
   ---------------------------------------------------------
   Les données passent par les fonctions serverless /api/* (base Neon,
   schéma « event ») ; l'identité passe par Clerk (voir clerk.js).

   « Zéro miroir » : e-mail et nom réel sont lus en direct depuis Clerk, jamais
   copiés en base.
   ========================================================= */
import { loadClerk, authHeader, clerkAppearance, redirectionOptions } from "./clerk.js";

/* Petit client HTTP : chaque appel porte le token de session Clerk. */
async function api(path, { method = "GET", body } = {}) {
  const opts = { method, headers: { ...(await authHeader()) } };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch { /* réponse non JSON */ }
  if (!res.ok) {
    const err = new Error(data.error || "http_" + res.status);
    err.code = data.error || "";
    // Détails utiles au message d'erreur (question manquante, minimum d'équipe…).
    if (data.question) err.question = data.question;
    if (data.min) err.min = data.min;
    throw err;
  }
  return data;
}

/* ---------- Images (Vercel Blob) ---------- */
/**
 * Héberge une image (affiche d'événement) et renvoie son URL publique.
 * On envoie les octets bruts : /api/upload lit le corps sans bodyParser.
 * @param {string} dataUrl image en data-URI (sortie de compressImage)
 * @param {string} name nom de fichier indicatif
 * @returns {Promise<string>} URL publique du fichier
 */
export async function uploadImage(dataUrl, name = "affiche.jpg") {
  const blob = await (await fetch(dataUrl)).blob();
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      ...(await authHeader()),
      "Content-Type": blob.type || "image/jpeg",
      "x-filename": encodeURIComponent(name),
      "x-folder": "affiches",
    },
    body: blob,
  });
  let data = {};
  try { data = await res.json(); } catch { /* réponse non JSON */ }
  if (!res.ok || !data.url) throw new Error(data.error || "upload_" + res.status);
  return data.url;
}

/* ---------- Instagram (admin) ---------- */

/** Héberge la carte Instagram (JPEG) et renvoie son URL publique. */
export async function uploadCarteInsta(blob, name = "carte.jpg") {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      ...(await authHeader()),
      "Content-Type": "image/jpeg",
      "x-filename": encodeURIComponent(name),
      "x-folder": "instagram",
    },
    body: blob,
  });
  let data = {};
  try { data = await res.json(); } catch { /* réponse non JSON */ }
  if (!res.ok || !data.url) throw new Error(data.error || "upload_" + res.status);
  return data.url;
}

/** État de la connexion Instagram (+ publications déjà faites pour un événement). */
export async function getInstagram(eventId) {
  return api("/api/instagram" + (eventId ? "?event=" + encodeURIComponent(eventId) : ""));
}

/** Publie une carte déjà hébergée sur le compte Instagram EBOK. */
export async function publierInstagram({ eventId, imageUrl, caption, tag }) {
  const opts = { method: "POST", headers: { ...(await authHeader()), "Content-Type": "application/json" },
    body: JSON.stringify({ eventId, imageUrl, caption, tag }) };
  const res = await fetch("/api/instagram", opts);
  let data = {};
  try { data = await res.json(); } catch { /* réponse non JSON */ }
  if (!res.ok) {
    const err = new Error(data.message || data.error || "http_" + res.status);
    err.code = data.error || "";
    throw err;
  }
  return data;
}

/* ---------- Événements ---------- */

/** Événements publics : uniquement ceux qui sont validés (approved). */
export async function getAllEvents() {
  return (await api("/api/events")).events || [];
}

/** Tous les événements, quel que soit le statut (réservé à l'admin). */
export async function getAllEventsForAdmin() {
  return (await api("/api/events?all=1")).events || [];
}

/** Récupère un événement par son id (null si introuvable / privé). */
export async function getEvent(id) {
  try {
    return (await api("/api/events?id=" + encodeURIComponent(id))).event || null;
  } catch {
    return null;
  }
}

/** Récupère les événements du diffuseur connecté (tous statuts).
 *  `userId` est ignoré côté serveur : on renvoie toujours ceux de la session. */
export async function getEventsByUser(userId) {
  return (await api("/api/events?mine=1")).events || [];
}

/** Crée un événement (statut "pending"). Renvoie son nouvel id. */
export async function createEvent(eventData) {
  return (await api("/api/events", { method: "POST", body: eventData })).id;
}

/** Met à jour un événement existant. */
export async function updateEvent(id, patch) {
  await api("/api/events?id=" + encodeURIComponent(id), { method: "PATCH", body: patch });
}

/** Valide (publie) un événement en attente. */
export async function approveEvent(id) {
  await api("/api/events?id=" + encodeURIComponent(id), { method: "PATCH", body: { status: "approved" } });
}

/** Supprime un événement. */
export async function deleteEvent(id) {
  await api("/api/events?id=" + encodeURIComponent(id), { method: "DELETE" });
}

/** Compte une visite sur une fiche et renvoie la valeur à jour.
 *  Le serveur ne compte qu'une fois par visiteur, par événement et par jour ;
 *  il ignore toute valeur de départ envoyée depuis le navigateur. */
export async function incrementViews(eventId) {
  const d = await api("/api/views?id=" + encodeURIComponent(eventId), { method: "POST" });
  return d.count;
}

/* ---------- Authentification (widget Clerk) ---------- */

/** Ouvre le widget Clerk (connexion ou inscription). */
export async function openSignIn(mode) {
  const clerk = await loadClerk();
  // L'habillage est recalculé ici pour suivre la bascule clair / sombre faite
  // après le chargement de Clerk.
  const opts = { appearance: clerkAppearance(), ...redirectionOptions() };
  if (mode === "signup") clerk.openSignUp(opts);
  else clerk.openSignIn(opts);
}

/** Déconnexion. */
export async function signOutUser() {
  const clerk = await loadClerk();
  await clerk.signOut();
}

/* ---------- Session / profil / favoris ---------- */

/** Session courante : { user:{uid,email,displayName,isAdmin}|null, profile, favorites }. */
export async function getSession() {
  return api("/api/account");
}

/** Tous les membres inscrits (réservé à l'admin). */
/* ---------- Détection automatique (admin) ---------- */

/** Sources surveillées, nombre d'événements détectés en attente. */
export async function getDetection() {
  return api("/api/detection");
}

/** Action sur les sources : ajouter, retirer, activer, analyser. */
export async function detectionAction(body) {
  return api("/api/detection", { method: "POST", body });
}

/* ---------- Signalements ---------- */

/** Signale une erreur sur une fiche. Public : le compte est facultatif. */
export async function signalerEvenement(eventId, motif, message) {
  const body = { eventId, motif, message };
  try {
    return await api("/api/signalement", { method: "POST", body });
  } catch (e) {
    // Réponse du serveur (quota, motif…) : on la transmet telle quelle.
    if (e.code || /^http_/.test(e.message)) throw e;
    // Clerk injoignable (bloqueur de scripts, réseau) : le signalement n'exige
    // pas de compte, on le renvoie sans identité.
    const res = await fetch("/api/signalement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let data = {};
    try { data = await res.json(); } catch { /* réponse non JSON */ }
    if (!res.ok) {
      const err = new Error(data.error || "http_" + res.status);
      err.code = data.error || "";
      throw err;
    }
    return data;
  }
}

/** Liste des signalements (admin) : {signalements, ouverts}. */
export async function getSignalements() {
  return api("/api/signalement");
}

/** Nombre de signalements à traiter (admin), pour la pastille. */
export async function getSignalementsOuverts() {
  return (await api("/api/signalement?ouverts=1")).ouverts || 0;
}

/* ---------- Statistiques (admin) ---------- */

/** Statistiques de l'administration pour « semaine », « mois » ou « annee ». */
export async function getStats(periode) {
  return api("/api/views?stats=1&periode=" + encodeURIComponent(periode || "semaine"));
}

/** Marque un signalement « traite » ou le rouvre « ouvert » (admin). */
export async function majSignalement(id, statut) {
  return api("/api/signalement?id=" + encodeURIComponent(id), { method: "PATCH", body: { statut } });
}

/** Supprime un signalement (admin). */
export async function supprimerSignalement(id) {
  return api("/api/signalement?id=" + encodeURIComponent(id), { method: "DELETE" });
}

export async function getAllUsers() {
  return (await api("/api/account?users=1")).users || [];
}

/** Met à jour (fusionne) le profil du membre connecté. */
export async function updateUserProfile(uid, data) {
  await api("/api/account", { method: "POST", body: { action: "saveProfile", profile: data } });
}

/** Liste des ids d'événements enregistrés par l'utilisateur connecté. */
export async function getFavorites(uid) {
  const d = await api("/api/account");
  return d.favorites || [];
}

/** Ajoute (add=true) ou retire (add=false) un événement des favoris. */
export async function toggleFavorite(uid, eventId, add) {
  await api("/api/account", { method: "POST", body: { action: "toggleFavorite", eventId, add } });
}

/* ---------- Alertes e-mail ---------- */

/** Alertes du membre connecté. */
export async function getAlerts() {
  return (await api("/api/alerts")).alerts || [];
}

/** Alertes ET événements repérés par elles ({eventId, alertId, vu, at}). */
export async function getAlertsEtReperes() {
  const r = await api("/api/alerts");
  return { alerts: r.alerts || [], notifications: r.notifications || [] };
}

/** Marque les événements repérés comme vus. */
export async function markAlertsSeen() {
  await api("/api/alerts?lues=1", { method: "POST" });
}

/** Crée une alerte et renvoie l'alerte créée. */
export async function createAlert(donnees) {
  return (await api("/api/alerts", { method: "POST", body: donnees })).alert;
}

/** Modifie une alerte (nom, critères, ou activation). */
export async function updateAlert(id, patch) {
  return (await api("/api/alerts?id=" + encodeURIComponent(id), { method: "PATCH", body: patch })).alert;
}

/** Supprime une alerte. */
export async function deleteAlert(id) {
  await api("/api/alerts?id=" + encodeURIComponent(id), { method: "DELETE" });
}

/** Héberge un lot d'affiches encore stockées en base (admin).
 *  Traité par lots côté serveur : renvoie `restant` et `relancer`. */
export async function hostStoredPosters({ dry = false, limit = 5 } = {}) {
  const q = `?limit=${encodeURIComponent(limit)}${dry ? "&dry=1" : ""}`;
  return api("/api/migrate-posters" + q, { method: "POST" });
}

/* ---------- Inscriptions et outils d'organisateur ---------- */
const INSC = "/api/events?r=insc";
const e = encodeURIComponent;
/** État des inscriptions d'un événement (ouvertes, places, ma demande). */
export async function etatInscriptions(eventId) {
  return api(`${INSC}&event=${e(eventId)}&etat=1`);
}
/** M'inscrire : envoie une demande que l'organisateur validera. */
export async function sInscrire(eventId, demande) {
  return api(`${INSC}&event=${e(eventId)}`, { method: "POST", body: demande });
}
export async function mesInscriptions() {
  return (await api(`${INSC}&mine=1`)).inscriptions || [];
}
export async function annulerInscription(id) {
  return api(`${INSC}&id=${e(id)}`, { method: "DELETE" });
}
/** Dépose un document demandé (image ou PDF) puis le rattache à l'inscription. */
export async function deposerDocument(inscriptionId, docId, fichier) {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      ...(await authHeader()),
      "Content-Type": fichier.type || "application/pdf",
      "x-filename": encodeURIComponent(fichier.name || "document"),
      "x-folder": "documents",
    },
    body: fichier,
  });
  let data = {};
  try { data = await res.json(); } catch { /* réponse non JSON */ }
  if (!res.ok || !data.url) throw new Error(data.error || "upload_" + res.status);
  return api(`${INSC}&id=${e(inscriptionId)}&doc=${e(docId)}`, { method: "PATCH", body: { url: data.url, nom: fichier.name || "" } });
}
/** Les événements que j'organise (propriétaire ou co-organisateur). */
export async function mesEvenementsOrganises() {
  return (await api(`${INSC}&orga=1`)).events || [];
}
/** Tableau de bord d'un événement : réglages, inscrits, messages. */
export async function tableauOrganisateur(eventId) {
  return api(`${INSC}&event=${e(eventId)}`);
}
/** Statistiques d'un événement sur 7, 30 ou 90 jours (vues, favoris, demandes, clics). */
export async function statsOrganisateur(eventId, jours) {
  return api(`${INSC}&event=${e(eventId)}&stats=1&jours=${e(jours)}`);
}
export async function majInscription(id, patch) {
  return (await api(`${INSC}&id=${e(id)}`, { method: "PATCH", body: patch })).inscription;
}
export async function majReglagesInscription(eventId, patch) {
  return api(`${INSC}&event=${e(eventId)}&reglages=1`, { method: "PATCH", body: patch });
}
export async function envoyerMessageInscrits(eventId, message) {
  return api(`${INSC}&event=${e(eventId)}&message=1`, { method: "POST", body: message });
}
/** Réponse à « gérer ton événement avec les outils EBOK ? ». */
export async function repondreInteretOutils(eventId, reponse) {
  return api(`${INSC}&event=${e(eventId)}&interet=1`, { method: "POST", body: { reponse } });
}
/** Action groupée sur des inscrits : {ids, statut?, ajouterCat?, retirerCat?, docsValides?}. */
export async function actionLotInscrits(eventId, action) {
  return api(`${INSC}&event=${e(eventId)}&lot=1`, { method: "PATCH", body: action });
}
/** Supprime définitivement des inscriptions (organisateur). */
export async function supprimerInscrits(eventId, ids) {
  return api(`${INSC}&event=${e(eventId)}&lot=1`, { method: "DELETE", body: { ids } });
}
/** Pointe un inscrit le jour J (organisateur) : liste à cocher ou QR code. */
export async function pointerInscrit(eventId, inscriptionId, present = true) {
  return api(`${INSC}&event=${e(eventId)}&pointage=${e(inscriptionId)}`, { method: "POST", body: { present } });
}
