/* =========================================================
   EBOK — INTRO : décision d'affichage
   ---------------------------------------------------------
   Minuscule script chargé dans le <head>, avant le premier affichage : il
   décide si l'intro (js/intro.js) doit se jouer et pose alors la classe
   `intro-on` sur <html>, ce qui affiche le voile beige dès la première image
   (pas de flash de la page d'accueil).

   L'intro se joue :
     - sur la page d'accueil seulement (jamais sur /evenement/…) ;
     - à la première visite (ensuite : accès direct au site) ;
     - sauf si le visiteur a demandé à son système de réduire les animations ;
     - ou toujours avec /?intro=1 (lien « Revoir l'intro » du pied de page).
   ========================================================= */
(function(){
  try{
    var force = /[?&]intro=1(&|$)/.test(location.search);
    var accueil = (location.pathname === '/' || location.pathname === '/index.html')
      && !location.hash && (force || !location.search);
    var vue = false;
    try{ vue = localStorage.getItem('ebok-intro') === '1'; }catch(e){}
    var calme = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var robot = /bot|crawl|spider|lighthouse|pagespeed/i.test(navigator.userAgent);
    var dessin = !!document.createElement('canvas').getContext;
    if(accueil && dessin && !robot && (force || (!vue && !calme))){
      var html = document.documentElement;
      html.classList.add('intro-on');
      // Garde-fou : si le moteur de l'intro ne démarre pas, on rend le site.
      setTimeout(function(){
        if(!window.EbokIntro) html.classList.remove('intro-on');
      }, 6000);
    }
  }catch(e){}
})();
