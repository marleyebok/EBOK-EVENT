/* =========================================================
   EBOK Event — ACTIVATION FIREBASE
   ---------------------------------------------------------
   Branche la base de données ET l'authentification sur l'app.
   Activé via <script type="module" src="js/firebase-init.js"> dans
   index.html. Prérequis : public/js/firebase-config.js configuré.

   Tant que ce fichier n'est pas chargé, l'app tourne sur les données
   locales de data.js (mode démo, sans compte).
   ========================================================= */
import {
  getAllEvents, getAllEventsForAdmin, getEvent, getEventsByUser,
  createEvent, updateEvent, approveEvent, deleteEvent, incrementViews, importEvents,
  signUp, signIn, signInWithGoogle, signOutUser, observeAuth, getUserProfile, updateUserProfile, isAdmin,
  getFavorites, toggleFavorite
} from './services.js';

// Couche données exposée à app.js.
window.EBOK_DATA = {
  getAllEvents, getAllEventsForAdmin, getEvent, getEventsByUser,
  createEvent, updateEvent, approveEvent, deleteEvent, incrementViews,
  getFavorites, toggleFavorite, updateUserProfile
};

// Couche authentification exposée à app.js.
window.EBOK_AUTH = { signUp, signIn, signInWithGoogle, signOutUser };

// Relaie l'état de connexion à l'app (topbar, formulaire, dashboard).
observeAuth(async (user) => {
  let profile = null, admin = false;
  if (user) {
    try { profile = await getUserProfile(user.uid); } catch (e) { /* profil optionnel */ }
    admin = await isAdmin(user.uid);
  }
  if (window.EBOK && typeof window.EBOK.onAuthChanged === 'function') {
    window.EBOK.onAuthChanged(user, profile, admin);
  }
});

/* Import initial des données locales vers Firestore.
   À lancer UNE FOIS, depuis la console du navigateur : EBOK_IMPORT()
   (quand la base est encore vide). */
window.EBOK_IMPORT = async function () {
  const list = window.EBOK ? window.EBOK.events : [];
  if (!list.length) { console.warn('[EBOK] Aucune donnée locale à importer.'); return; }
  console.info(`[EBOK] Import de ${list.length} événement(s) vers Firebase…`);
  const n = await importEvents(list);
  console.info(`[EBOK] ✅ ${n} événement(s) importé(s). Recharge la page.`);
  return n;
};

// Remplace les données locales par celles de Firestore dès que l'app est prête.
async function hydrate() {
  try {
    const list = await getAllEvents();
    if (Array.isArray(list) && list.length && window.EBOK) {
      window.EBOK.setEvents(list);
      console.info(`[EBOK] ${list.length} événement(s) chargé(s) depuis Firebase.`);
    } else if (window.EBOK) {
      console.info('[EBOK] Firebase branché, base vide — lance EBOK_IMPORT().');
    }
  } catch (err) {
    console.warn('[EBOK] Firebase branché mais lecture impossible — données locales conservées.', err);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', hydrate);
} else {
  hydrate();
}
