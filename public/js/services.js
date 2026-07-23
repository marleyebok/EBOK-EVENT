/* =========================================================
   EBOK Event — COUCHE API (Neon via /api + Clerk)
   ---------------------------------------------------------
   Remplace l'ancienne couche Firebase. Les SIGNATURES exportées n'ont pas
   changé : app.js n'a (presque) pas à bouger. Les données passent par les
   fonctions serverless /api/* (base Neon partagée, schéma « event ») ;
   l'identité passe par Clerk (compte unique de la galaxie EBOK — voir clerk.js).

   « Zéro miroir » : e-mail et nom réel sont lus en direct depuis Clerk, jamais
   copiés en base.
   ========================================================= */
import { loadClerk, authHeader } from "./clerk.js";

/* Emails administrateurs — doit rester cohérent avec api/_lib.js (ADMIN_EMAILS).
   L'autorité finale est le serveur (isAdmin via l'e-mail Clerk). */
const ADMIN_EMAILS = ["marley.ebok@gmail.com"];
export function isAdminEmail(email) {
  return !!email && ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

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

/** Incrémente le compteur de « curieux » et renvoie la nouvelle valeur. */
export async function incrementViews(eventId, seed = 0) {
  const d = await api(
    "/api/views?id=" + encodeURIComponent(eventId) + "&seed=" + (seed || 0),
    { method: "POST" }
  );
  return d.count;
}

/* ---------- Authentification (widget Clerk) ---------- */

/** Ouvre le widget Clerk (connexion ou inscription). */
export async function openSignIn(mode) {
  const clerk = await loadClerk();
  if (mode === "signup") clerk.openSignUp();
  else clerk.openSignIn();
}

/** Déconnexion. */
export async function signOutUser() {
  const clerk = await loadClerk();
  await clerk.signOut();
}

/* Compat : les anciens noms redirigent vers le widget Clerk (email + Google
   sont gérés par Clerk lui-même ; plus de formulaire maison). */
export async function signIn() { return openSignIn("login"); }
export async function signUp() { return openSignIn("signup"); }
export async function signInWithGoogle() { return openSignIn("login"); }

/* ---------- Session / profil / favoris ---------- */

/** Session courante : { user:{uid,email,displayName,isAdmin}|null, profile, favorites }. */
export async function getSession() {
  return api("/api/account");
}

/** Profil diffuseur de la session (null si non connecté). */
export async function getUserProfile(uid) {
  const d = await api("/api/account");
  return d.profile || null;
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

/** Vrai si l'utilisateur connecté est administrateur (autorité serveur). */
export async function isAdmin(uid) {
  try {
    const d = await api("/api/account");
    return !!(d.user && d.user.isAdmin);
  } catch {
    return false;
  }
}

/** Migration ponctuelle Firestore → Neon (admin). Renvoie le récap d'import. */
export async function migrateFromFirestore(overwrite = false) {
  return api("/api/migrate", { method: "POST", body: { overwrite } });
}
