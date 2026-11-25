/* =========================================================
   EBOK — DONNÉES
   Constantes partagées : date du jour, couleurs des types d'événements,
   liste des événements (remplie par la base). Chargé AVANT app.js.
   ========================================================= */
const TODAY = new Date().toISOString().slice(0,10);

const TYPE_COLORS = {
  /* Couleurs de maillot, posées sur le papier crème : mêmes familles qu'avant
     (on reconnaît toujours un tournoi orange), saturation calmée pour que la
     carte reste lisible et que le bordeaux de la marque garde la vedette. */
  "Tournoi":"#D9531E",
  "Camp":"#1F8F6B",
  "Stage":"#1B8AA0",
  "Voyage":"#C9961A",
  "Show":"#7759C2",
  "Détections":"#D97A10",
  "Clinic Coachs":"#2F6DB5",
  "Circuit 3x3":"#3C8F45",
  "Handibasket":"#8A3E9C",
  "Match Pro":"#A8283A",
  "Divers":"#6B7680"
};

// Les événements viennent de la base (clerk-init.js → EBOK.setEvents) :
// la liste démarre vide, aucun événement fictif ne s'affiche en attendant.
let events = [];
