/* =========================================================
   EBOK Event — CONFIG FIREBASE (modèle)
   ---------------------------------------------------------
   1. Copie ce fichier en `firebase-config.js` (le vrai fichier
      est ignoré par git — voir .gitignore).
   2. Remplace les valeurs ci-dessous par celles de ta console
      Firebase (console.firebase.google.com > Paramètres du projet).
   3. Ces scripts utilisent le SDK Firebase en modules ES via CDN,
      donc les fichiers qui l'importent doivent être chargés avec
      <script type="module">.
   ========================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "TON_API_KEY",
  authDomain: "ton-projet.firebaseapp.com",
  projectId: "ton-projet",
  storageBucket: "ton-projet.appspot.com",
  messagingSenderId: "TON_SENDER_ID",
  appId: "TON_APP_ID"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
