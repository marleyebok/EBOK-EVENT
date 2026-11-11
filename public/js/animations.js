/* =========================================================
   EBOK — ANIMATIONS (Motion, motion.dev)
   ---------------------------------------------------------
   Couche purement décorative, posée par-dessus l'application : elle observe
   la page et anime ce qui apparaît, sans que app.js ait à la connaître. Si ce
   fichier ou la bibliothèque (js/vendor/motion.js) ne se charge pas, le site
   fonctionne à l'identique, simplement sans mouvement.

   Rien n'est animé pour un visiteur qui a demandé à son système de réduire
   les animations.

   Pour tout couper : retirer les deux balises <script defer> d'index.html.
   ========================================================= */
(function(){
  const M = window.Motion;
  if(!M || typeof M.animate !== 'function') return;
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ressort = { type: 'spring', stiffness: 380, damping: 26 };

  /* Une animation terminée ne doit rien laisser derrière elle : un style en
     ligne resté sur l'élément masquerait le survol défini dans la feuille de
     style (la carte qui se soulève, le ♥ qui grossit). */
  function jouer(el, images, options, aNettoyer){
    try{ M.animate(el, images, options); }
    catch(e){ nettoyer(el, aNettoyer); return; }
    // Nettoyage à l'horloge plutôt qu'à la fin annoncée par la bibliothèque :
    // elle réécrit ses styles finaux juste après, ce qui les ferait revenir.
    const duree = ((options.duration || 0.7) + (options.delay || 0)) * 1000 + 150;
    clearTimeout(el._ebokAnim);
    el._ebokAnim = setTimeout(()=> nettoyer(el, aNettoyer), duree);
  }
  function nettoyer(el, proprietes){
    for(const p of proprietes || ['opacity', 'transform']) el.style.removeProperty(p);
  }

  /* ---------- 1. Cartes d'événements : apparition en cascade ---------- */
  /* Les cartes sont redessinées à chaque filtre : on anime chaque carte au
     moment où elle entre dans l'écran, pas avant. Le décalage suit sa colonne
     (trois par rangée) : une rangée arrive de gauche à droite. */
  function animerCartes(cartes){
    cartes.forEach((carte, i)=>{
      carte.style.opacity = '0';
      const lancer = ()=> jouer(carte,
        { opacity: [0, 1], y: [22, 0] },
        { duration: 0.45, delay: (i % 3) * 0.07, ease: [0.22, 1, 0.36, 1] });
      if(typeof M.inView === 'function'){
        const arreter = M.inView(carte, ()=>{ lancer(); if(typeof arreter === 'function') arreter(); }, { amount: 0.15 });
      }else{
        lancer();
      }
    });
  }

  /* ---------- 2. Fenêtres : la boîte arrive avec un léger ressort ---------- */
  function animerFenetre(fenetre){
    const boite = fenetre.querySelector('.edit-box');
    if(boite) jouer(boite, { opacity: [0, 1], scale: [0.95, 1], y: [16, 0] }, ressort);
  }

  /* ---------- 3. Pastille des alertes : elle « saute » en apparaissant ---------- */
  function animerPastille(pastille){
    jouer(pastille, { scale: [0, 1.25, 1] }, { duration: 0.5, ease: 'easeOut' }, ['transform']);
  }

  /* ---------- 4. Pages : le titre et son texte entrent l'un après l'autre ---------- */
  function animerPage(page){
    // En « v2 », l'accueil a sa propre séquence d'arrivée (js/v2.js).
    const v2 = document.documentElement.getAttribute('data-ui') === 'v2';
    const blocs = page.querySelectorAll(v2 ? '.hero-sub, .page-head > *, .profile-head' : '.hero > *, .page-head > *, .profile-head');
    blocs.forEach((bloc, i)=>{
      jouer(bloc, { opacity: [0, 1], y: [14, 0] },
        { duration: 0.5, delay: 0.05 + i * 0.07, ease: [0.22, 1, 0.36, 1] });
    });
  }

  /* ---------- Observation de la page ---------- */
  const observateur = new MutationObserver(mutations=>{
    const cartes = [];
    for(const m of mutations){
      if(m.type === 'childList'){
        for(const n of m.addedNodes){
          if(n.nodeType !== 1) continue;
          if(n.matches('.event-card')) cartes.push(n);
          else if(n.querySelectorAll) cartes.push(...n.querySelectorAll('.event-card'));
        }
        continue;
      }
      // Changement de classe : une fenêtre qui s'ouvre, une pastille qui se
      // montre, une page qui devient active.
      const el = m.target;
      const avant = String(m.oldValue || '').split(/\s+/);
      const a = c => el.classList.contains(c);
      if(a('edit-modal') && a('open') && !avant.includes('open')) animerFenetre(el);
      else if(el.hasAttribute('data-alert-badge') && !a('hidden') && avant.includes('hidden')) animerPastille(el);
      else if(a('page') && a('active') && !avant.includes('active')) animerPage(el);
    }
    if(cartes.length) animerCartes(cartes);
  });
  observateur.observe(document.body, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['class'], attributeOldValue: true,
  });

  /* ---------- 5. Le ♥ rebondit au clic ---------- */
  document.addEventListener('click', e=>{
    const coeur = e.target.closest && e.target.closest('.fav-btn');
    if(coeur) jouer(coeur, { scale: [1, 1.4, 0.92, 1] }, { duration: 0.45, ease: 'easeOut' }, ['transform']);
  }, true);

  /* ---------- Premier affichage ---------- */
  const active = document.querySelector('.page.active');
  if(active) animerPage(active);
  animerCartes([...document.querySelectorAll('.event-card')]);
})();
