/* =========================================================
   EBOK Event — ACTIVATION NEON + CLERK
   ---------------------------------------------------------
   Remplace l'ancien firebase-init.js. Branche la couche données (/api Neon) et
   l'identité (Clerk) sur l'app. Activé via
   <script type="module" src="js/clerk-init.js"> dans index.html.

   Tant que ce fichier n'est pas chargé, l'app tourne sur les données locales de
   data.js (mode démo, sans compte).
   ========================================================= */
import {
  getAllEvents, getAllEventsForAdmin, getEvent, getEventsByUser,
  createEvent, updateEvent, approveEvent, deleteEvent, incrementViews,
  getFavorites, toggleFavorite, updateUserProfile, getAllUsers,
  openSignIn, signOutUser, getSession, migrateFromFirestore,
} from "./services.js";
import { loadClerk } from "./clerk.js";

// Couche données exposée à app.js (mêmes clés qu'avant).
window.EBOK_DATA = {
  getAllEvents, getAllEventsForAdmin, getEvent, getEventsByUser,
  createEvent, updateEvent, approveEvent, deleteEvent, incrementViews,
  getFavorites, toggleFavorite, updateUserProfile, getAllUsers,
  migrateFromFirestore,
};

// Couche authentification exposée à app.js. `openSignIn` ouvre le widget Clerk ;
// les anciens noms (signIn/signUp/signInWithGoogle) y renvoient pour compat.
window.EBOK_AUTH = {
  openSignIn,
  signIn: () => openSignIn("login"),
  signUp: () => openSignIn("signup"),
  signInWithGoogle: () => openSignIn("login"),
  signOutUser,
};

/* Transforme l'utilisateur Clerk en objet compatible avec app.js
   (qui lit .uid, .email, .displayName et .getIdToken() — héritage Firebase). */
function normalize(clerk) {
  const u = clerk.user;
  if (!u) return null;
  const email =
    u.primaryEmailAddress?.emailAddress ||
    (u.emailAddresses && u.emailAddresses[0]?.emailAddress) ||
    "";
  const name = u.fullName || [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "";
  return {
    uid: u.id,
    email,
    displayName: name,
    getIdToken: async () => (clerk.session ? clerk.session.getToken() : null),
  };
}

/* Relaie l'état de connexion à l'app (topbar, formulaire, dashboard, admin). */
async function relay(clerk) {
  const user = normalize(clerk);
  let profile = null, admin = false;
  if (user) {
    try {
      const s = await getSession();
      profile = s.profile || null;
      admin = !!(s.user && s.user.isAdmin);
      if (s.user && s.user.email) user.email = s.user.email;
      if (s.user && s.user.displayName) user.displayName = s.user.displayName;
    } catch (e) {
      /* session optionnelle : on relaie quand même l'utilisateur Clerk */
    }
  }
  if (window.EBOK && typeof window.EBOK.onAuthChanged === "function") {
    window.EBOK.onAuthChanged(user, profile, admin);
  }
}

(async () => {
  try {
    const clerk = await loadClerk();
    clerk.addListener(() => relay(clerk));
    relay(clerk);
  } catch (e) {
    console.warn("[EBOK] Clerk indisponible — connexion désactivée.", e);
  }
})();

/* Remplace les données locales par celles de la base dès qu'elles arrivent. */
async function hydrate() {
  try {
    const list = await getAllEvents();
    if (Array.isArray(list) && list.length && window.EBOK) {
      window.EBOK.setEvents(list);
      console.info(`[EBOK] ${list.length} événement(s) chargé(s) depuis Neon.`);
    } else if (window.EBOK) {
      console.info("[EBOK] Neon branché, base vide — lance la migration (/api/migrate) ou crée un événement.");
    }
  } catch (err) {
    console.warn("[EBOK] Données Neon indisponibles — données locales conservées.", err);
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", hydrate);
} else {
  hydrate();
}
