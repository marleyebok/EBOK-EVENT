/* =========================================================
   EBOK Event — COUCHE API (Neon via /api + Clerk)
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
