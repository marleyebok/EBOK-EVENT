/* =========================================================
   EBOK — PRÉCHARGEMENT DE LA LISTE DES ÉVÉNEMENTS
   ---------------------------------------------------------
   Chargé tout en haut de la page : la liste des événements (publique, la
   même pour tous) est demandée tout de suite, pendant que le navigateur
   télécharge le reste du site, au lieu d'attendre la fin de tous les
   scripts. services.js (getAllEvents) reprend cette demande.
   La dernière liste connue (visite précédente) est aussi lue ici : app.js
   l'affiche dès son démarrage, puis la liste fraîche la remplace.
   ========================================================= */
(function(){
  try{
    var p = fetch('/api/events').then(function(r){
      if(!r.ok) throw new Error('http_' + r.status);
      return r.json();
    }).then(function(d){ return d.events || []; });
    p.catch(function(){});
    window.EBOK_LISTE = p;
  }catch(e){ /* navigateur ancien : services.js refera la demande */ }
  try{
    var c = JSON.parse(localStorage.getItem('ebok_evenements_v1') || 'null');
    if(c && c.events && c.events.length && Date.now() - c.t < 7 * 86400000) window.EBOK_CACHE_LISTE = c.events;
  }catch(e){ /* stockage indisponible */ }
})();
