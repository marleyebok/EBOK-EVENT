/* =========================================================
   EBOK Event — CHARGEUR CLERK (identité / comptes)
   ---------------------------------------------------------
   ⚙️  CONFIGURATION — UNE SEULE LIGNE À CHANGER (voir ci-dessous).

   La clé « publishable » est PUBLIQUE (elle part dans le navigateur) : la
   mettre ici est sans risque, c'est l'usage prévu par Clerk. Ne jamais mettre
   la clé secrète (`sk_…`) dans ce fichier — elle vit uniquement dans la
   variable d'environnement CLERK_SECRET_KEY sur Vercel.

   Le domaine de l'instance Clerk est ENCODÉ DANS LA CLÉ : il est décodé plus
   bas plutôt que recopié, pour qu'une bascule d'instance ne puisse pas laisser
   les deux valeurs désynchronisées.

   → Pour basculer vers une autre instance Clerk : remplacer PUBLISHABLE_KEY
     par la clé de la nouvelle instance, et mettre à jour CLERK_SECRET_KEY sur
     Vercel. Rien d'autre à toucher dans le code.
     Procédure complète et conséquences : voir le README (« Comptes »).
   ========================================================= */
const PUBLISHABLE_KEY = "pk_test_bm9ybWFsLXNoaW5lci00MDYwLmNsZXJrLmFjY291bnRzLmRldiQ";

/** Domaine de l'instance Clerk, décodé de la clé publishable. */
function frontendApi(key) {
  const encoded = key.replace(/^pk_(live|test)_/, "");
  // La clé encode « <domaine>$ » en base64.
  const decoded = atob(encoded).replace(/\$$/, "");
  if (!decoded) throw new Error("Clé Clerk illisible : " + key.slice(0, 12) + "…");
  return decoded;
}

/* ------------------------------------------------------------------ */
/* Habillage du widget Clerk                                           */
/* ------------------------------------------------------------------ */
/* Sans cette configuration, le widget s'affiche avec son thème clair par
   défaut : illisible au milieu du site sombre. Les valeurs reprennent celles
   de css/styles.css.

   Deux palettes, parce que les deux contextes diffèrent :
   - le site public suit la bascule clair / sombre (`data-theme` sur <html>) ;
   - l'espace compte (/compte) est toujours clair — ces pages le déclarent avec
     <body data-clerk-theme="light">. */
const PALETTES = {
  dark: {
    colorBackground: "#1F1F23",
    colorText: "#F3EEE2",
    colorTextSecondary: "#ACA79A",
    colorInputBackground: "#28282D",
    colorInputText: "#F3EEE2",
  },
  light: {
    colorBackground: "#FFFFFF",
    colorText: "#1D2530",
    colorTextSecondary: "#6A7280",
    colorInputBackground: "#FFFFFF",
    colorInputText: "#1D2530",
  },
};

/** Thème à appliquer : forcé par la page, sinon celui du site (sombre par défaut). */
function themeMode() {
  const forced = document.body?.dataset?.clerkTheme;
  if (forced === "light" || forced === "dark") return forced;
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/** Options `appearance` du widget, recalculées à chaque ouverture pour suivre
 *  la bascule de thème. */
export function clerkAppearance() {
  return {
    variables: {
      colorPrimary: "#FF5722",
      colorDanger: "#E8483A",
      colorSuccess: "#1F8F6B",
      colorWarning: "#FFC93C",
      fontFamily: "'Work Sans', sans-serif",
      borderRadius: "10px",
      ...PALETTES[themeMode()],
    },
    elements: {
      // Le bouton principal reprend le ton du site : pas de MAJUSCULES forcées.
      formButtonPrimary: { textTransform: "none", fontWeight: 700, fontSize: "15px" },
      footerAction: { fontWeight: 600 },
    },
  };
}

let _loaded = null;

/** Charge clerk-js une seule fois et renvoie l'instance `window.Clerk` prête. */
export function loadClerk() {
  if (_loaded) return _loaded;
  _loaded = new Promise((resolve, reject) => {
    if (window.Clerk) {
      window.Clerk.load({ appearance: clerkAppearance() }).then(() => resolve(window.Clerk)).catch(reject);
      return;
    }
    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.setAttribute("data-clerk-publishable-key", PUBLISHABLE_KEY);
    s.src = `https://${frontendApi(PUBLISHABLE_KEY)}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
    s.addEventListener("load", async () => {
      try {
        await window.Clerk.load({ appearance: clerkAppearance() });
        resolve(window.Clerk);
      } catch (e) {
        reject(e);
      }
    });
    s.addEventListener("error", () => reject(new Error("Chargement de Clerk impossible")));
    document.head.appendChild(s);
  });
  return _loaded;
}

/** En-tête d'authentification pour les appels API (token de session Clerk). */
export async function authHeader() {
  const clerk = await loadClerk();
  if (!clerk.session) return {};
  const token = await clerk.session.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Utilisateur Clerk connecté (ou null). */
export async function currentUser() {
  const clerk = await loadClerk();
  return clerk.user || null;
}
