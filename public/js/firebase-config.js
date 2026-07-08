/* =========================================================
   EBOK Event — CONFIG FIREBASE (projet ebok-event-61657)
   ---------------------------------------------------------
   Ces clés Web ne sont pas secrètes : elles sont visibles dans
   tout site Firebase côté navigateur. La sécurité des données
   est assurée par les règles Firestore (voir firestore.rules).
   ========================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAeOxodAkp4TFU1V5PiOqV2qUh9WVQEKhA",
  authDomain: "ebok-event-61657.firebaseapp.com",
  projectId: "ebok-event-61657",
  storageBucket: "ebok-event-61657.firebasestorage.app",
  messagingSenderId: "15963189912",
  appId: "1:15963189912:web:1dda2fdb67f89f977c16ed",
  measurementId: "G-JNPEN2BLFQ"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
