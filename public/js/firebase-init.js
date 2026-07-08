/* =========================================================
   EBOK Event — ACTIVATION FIREBASE
   ---------------------------------------------------------
   Ce fichier branche la base de données Firebase sur l'app.

   POUR L'ACTIVER (3 étapes) :
   1. Crée `firebase-config.js` à partir de `firebase-config.example.js`
      et colle-y tes clés Firebase.
   2. Dans `index.html`, décommente la ligne :
        <!-- <script type="module" src="js/firebase-init.js"></script> -->
   3. Recharge la page. L'app lit alors ses données depuis Firestore ;
      le formulaire de publication écrit dans Firestore ; le compteur
      de "curieux" est partagé entre tous les visiteurs.

   Tant que ce fichier n'est pas activé, l'app tourne sur les données
   locales de data.js — aucune régression.
   ========================================================= */
import {
  getAllEvents, getEvent, getEventsByUser,
  createEvent, updateEvent, incrementViews, importEvents
} from './services.js';

// Expose la couche de données à app.js (qui l'utilise si elle est présente).
window.EBOK_DATA = {
  getAllEvents, getEvent, getEventsByUser,
  createEvent, updateEvent, incrementViews
};

/* Import initial des données locales vers Firestore.
   À lancer UNE FOIS, depuis la console du navigateur : EBOK_IMPORT()
   (quand la base est encore vide). */
window.EBOK_IMPORT = async function(){
  const list = window.EBOK ? window.EBOK.events : [];
  if(!list.length){ console.warn('[EBOK] Aucune donnée locale à importer.'); return; }
  console.info(`[EBOK] Import de ${list.length} événement(s) vers Firebase…`);
  const n = await importEvents(list);
  console.info(`[EBOK] ✅ ${n} événement(s) importé(s). Recharge la page.`);
  return n;
};

// Remplace les données locales par celles de Firestore dès que l'app est prête.
async function hydrate(){
  try{
    const list = await getAllEvents();
    if(Array.isArray(list) && list.length && window.EBOK){
      window.EBOK.setEvents(list);
      console.info(`[EBOK] ${list.length} événement(s) chargé(s) depuis Firebase.`);
    }else if(window.EBOK){
      console.info('[EBOK] Firebase branché, base vide — lance le script d\'import (backend/import-events.mjs).');
    }
  }catch(err){
    console.warn('[EBOK] Firebase branché mais lecture impossible — données locales conservées.', err);
  }
}

if(document.readyState === 'loading'){
  window.addEventListener('DOMContentLoaded', hydrate);
}else{
  hydrate();
}
