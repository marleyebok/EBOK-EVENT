/* =========================================================
   EBOK Event — COUCHE API (Firestore + Auth)
   ---------------------------------------------------------
   Accès aux données et à l'authentification Firebase.
   Chargée uniquement quand Firebase est activé (firebase-init.js).
   ========================================================= */
import { db, auth } from "./firebase-config.js";
import {
  collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc,
  query, where, increment, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const EVENTS = "events";
const VIEWS = "views";
const USERS = "users";
const ADMINS = "admins";

/* ---------- Événements ---------- */

/**
 * Import initial : envoie une liste d'événements dans Firestore en
 * conservant leur id d'origine (pour que les compteurs de vues suivent).
 * Utilisé une seule fois pour migrer les données locales de data.js.
 */
export async function importEvents(list) {
  let n = 0;
  for (const ev of list) {
    const { id, ...data } = ev;
    await setDoc(doc(db, EVENTS, id), { ...data, status: "approved" }, { merge: true });
    n++;
  }
  return n;
}

/** Événements publics : uniquement ceux qui sont validés (approved). */
export async function getAllEvents() {
  const q = query(collection(db, EVENTS), where("status", "==", "approved"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Tous les événements, quel que soit le statut (réservé à l'admin). */
export async function getAllEventsForAdmin() {
  const snap = await getDocs(collection(db, EVENTS));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Récupère un événement par son id. */
export async function getEvent(id) {
  const snap = await getDoc(doc(db, EVENTS, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Récupère les événements d'un diffuseur donné (tous statuts). */
export async function getEventsByUser(userId) {
  const q = query(collection(db, EVENTS), where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Crée un événement. Le statut par défaut est "pending" ; l'appelant
 *  (admin) peut fournir status:"approved". */
export async function createEvent(eventData) {
  const ref = await addDoc(collection(db, EVENTS), {
    status: "pending",
    ...eventData,
    createdAt: Date.now()
  });
  return ref.id;
}

/** Met à jour un événement existant. */
export async function updateEvent(id, patch) {
  await updateDoc(doc(db, EVENTS, id), patch);
}

/** Valide (publie) un événement en attente. */
export async function approveEvent(id) {
  await updateDoc(doc(db, EVENTS, id), { status: "approved" });
}

/** Supprime un événement. */
export async function deleteEvent(id) {
  await deleteDoc(doc(db, EVENTS, id));
}

/**
 * Incrémente le compteur de "curieux" partagé d'un événement et renvoie
 * la nouvelle valeur. `seed` sert de valeur de départ au tout premier vu.
 */
export async function incrementViews(eventId, seed = 0) {
  const ref = doc(db, VIEWS, eventId);
  const before = await getDoc(ref);
  const base = before.exists() ? (before.data().count || 0) : seed;
  const next = base + 1;
  await setDoc(ref, { count: next }, { merge: true });
  return next;
}

/* ---------- Authentification ---------- */

/** Inscription d'un diffuseur : crée le compte + son profil. */
export async function signUp(email, password, profile) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  await setDoc(doc(db, USERS, uid), {
    email,
    ...profile,
    createdAt: Date.now()
  });
  return cred.user;
}

/** Connexion d'un diffuseur. */
export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

/** Déconnexion. */
export async function signOutUser() {
  await signOut(auth);
}

/** Observe l'état de connexion (appelé à chaque login/logout). */
export function observeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/** Profil diffuseur (nom, insta…). */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, USERS, uid));
  return snap.exists() ? snap.data() : null;
}

/** Vrai si l'utilisateur figure dans la collection `admins`. */
export async function isAdmin(uid) {
  if (!uid) return false;
  try {
    const snap = await getDoc(doc(db, ADMINS, uid));
    return snap.exists();
  } catch (e) {
    return false;
  }
}
