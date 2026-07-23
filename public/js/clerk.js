/* =========================================================
   EBOK Event — CHARGEUR CLERK (identité unique de la galaxie EBOK)
   ---------------------------------------------------------
   La clé « publishable » est PUBLIQUE (elle part dans le navigateur) : on peut
   la mettre ici sans risque. Elle encode aussi le domaine de l'instance Clerk,
   d'où l'on charge clerk-js. Instance de PRODUCTION : clerk.ebok.fr.

   Le reste du site (services.js, clerk-init.js) s'appuie sur ce module ; ne rien
   changer ici lors d'une bascule d'environnement.
   ========================================================= */
const PUBLISHABLE_KEY = "pk_live_Y2xlcmsuZWJvay5mciQ";
const FRONTEND_API = "clerk.ebok.fr"; // instance de production (décodé de la clé)

let _loaded = null;

/** Charge clerk-js une seule fois et renvoie l'instance `window.Clerk` prête. */
export function loadClerk() {
  if (_loaded) return _loaded;
  _loaded = new Promise((resolve, reject) => {
    if (window.Clerk) {
      window.Clerk.load().then(() => resolve(window.Clerk)).catch(reject);
      return;
    }
    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.setAttribute("data-clerk-publishable-key", PUBLISHABLE_KEY);
    s.src = `https://${FRONTEND_API}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
    s.addEventListener("load", async () => {
      try {
        await window.Clerk.load();
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
