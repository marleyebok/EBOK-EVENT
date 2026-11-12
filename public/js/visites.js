/* =========================================================
   EBOK — MESURE DES VISITES
   ---------------------------------------------------------
   Une requête par session de navigation, qui sert à compter les visiteurs du
   jour dans l'onglet Statistiques de l'administration. Rien n'est posé dans le
   navigateur de la personne (ni cookie, ni identifiant) : le serveur ne retient
   qu'une empreinte salée, non réversible et renouvelée chaque jour, effacée au
   bout de 7 jours (voir lib/stats.js et la politique de confidentialité).

   Le signal « ne pas me suivre » du navigateur est respecté. Si ce fichier ne se
   charge pas, le site fonctionne à l'identique.
   ========================================================= */
(function(){
  try{
    if(navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
    // Une seule fois par session : recharger la page ou changer de page ne recompte rien.
    if(sessionStorage.getItem('ebok-visite')) return;
    sessionStorage.setItem('ebok-visite', '1');
  }catch(e){ /* stockage indisponible : on envoie quand même, le serveur dédoublonne */ }
  fetch('/api/views?visite=1', { method: 'POST', keepalive: true }).catch(function(){});
})();
