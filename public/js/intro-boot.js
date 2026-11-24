/* =========================================================
   EBOK — INTRO : décision d'affichage
   ---------------------------------------------------------
   Minuscule script chargé dans le <head>, avant le premier affichage : il
   décide si l'intro (js/intro.js) doit se jouer et pose alors la classe
   `intro-on` sur <html>, ce qui affiche le voile beige dès la première image
   (pas de flash de la page d'accueil).

   L'intro ne se joue plus d'elle-même (choix du propriétaire, 11/2026) :
   seulement avec /?intro=1, le lien « Revoir l'intro » du pied de page, et
   sur la page d'accueil uniquement. Pour revenir à l'ancien comportement
   (première visite), remettre `(force || (!vue && !calme))` dans le test.
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
    if(accueil && dessin && !robot && force){
      var html = document.documentElement;
      html.classList.add('intro-on');
      // Garde-fou : si le moteur de l'intro ne démarre pas, on rend le site.
      setTimeout(function(){
        if(!window.EbokIntro) html.classList.remove('intro-on');
      }, 6000);
    }
  }catch(e){}
})();
