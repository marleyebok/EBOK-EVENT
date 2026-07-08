/* =========================================================
   EBOK Event — COUCHE API (Firestore)
   ---------------------------------------------------------
   Couche d'accès aux données. Tant que Firebase n'est pas
   branché, l'app fonctionne avec le tableau `events` de data.js.

   Pour activer Firebase :
   1. Crée `firebase-config.js` à partir de firebase-config.example.js
   2. Charge ce fichier en module dans index.html :
        <script type="module" src="js/services.js"></script>
   3. Remplace dans app.js l'usage direct de `events` par un appel
      à getAllEvents() (voir README, phase 4).
   ========================================================= */
import { db } from "./firebase-config.js";
import {
  collection, getDocs, getDoc, addDoc, updateDoc, doc,
  query, where, increment, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const EVENTS = "events";
const VIEWS = "views";

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

/** Récupère tous les événements. */
export async function getAllEvents() {
  const snap = await getDocs(collection(db, EVENTS));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Récupère un événement par son id. */
export async function getEvent(id) {
  const snap = await getDoc(doc(db, EVENTS, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Récupère les événements d'un diffuseur donné. */
export async function getEventsByUser(userId) {
  const q = query(collection(db, EVENTS), where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Crée un événement (depuis le formulaire de publication). */
export async function createEvent(eventData) {
  const ref = await addDoc(collection(db, EVENTS), {
    ...eventData,
    createdAt: Date.now(),
    status: "pending"        // vérifié avant publication
  });
  return ref.id;
}

/** Met à jour un événement existant. */
export async function updateEvent(id, patch) {
  await updateDoc(doc(db, EVENTS, id), patch);
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
