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
    // Le hero de l'accueil a sa propre entrée, en CSS (titre masqué, terrain tracé).
    const blocs = page.querySelectorAll('.hero:not(.hero-home) > *, .page-head > *, .profile-head');
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

  /* ---------- 6. La pastille de l'onglet actif glisse d'un onglet à l'autre ---------- */
  const nav = document.querySelector('.nav-links');
  if(nav){
    const pastille = document.createElement('span');
    pastille.className = 'nav-pill';
    nav.insertBefore(pastille, nav.firstChild);
    nav.classList.add('pill-on');
    let sansGlisser = true;      // premier placement, ou après un redimensionnement
    const placer = ()=>{
      const actif = nav.querySelector('.navlink.active');
      // Aucun onglet actif (fiche événement) ou barre masquée (mobile).
      if(!actif || !actif.offsetWidth){ pastille.style.opacity = '0'; sansGlisser = true; return; }
      const x = actif.offsetLeft, largeur = actif.offsetWidth;
      if(sansGlisser){
        pastille.style.transform = 'translateX(' + x + 'px)';
        pastille.style.width = largeur + 'px';
      }else{
        M.animate(pastille, { x: x, width: largeur }, { type: 'spring', stiffness: 420, damping: 34 });
      }
      pastille.style.opacity = '1';
      sansGlisser = false;
    };
    new MutationObserver(placer).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', ()=>{ sansGlisser = true; placer(); });
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{ sansGlisser = true; placer(); });
    placer();
  }

  /* ---------- 7. Cartes : un reflet suit le pointeur ---------- */
  /* On ne fait que poser la position dans deux variables CSS ; le dessin du
     reflet est dans la feuille de style (.event-card::after). */
  const survol = window.matchMedia('(hover: hover)').matches;
  if(survol){
    document.addEventListener('pointermove', e=>{
      const carte = e.target.closest && e.target.closest('.event-card');
      if(carte){
        const r = carte.getBoundingClientRect();
        carte.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        carte.style.setProperty('--my', (e.clientY - r.top) + 'px');
      }
      // À la une : l'affiche s'incline vers le pointeur.
      const une = e.target.closest && e.target.closest('.carousel-item');
      const affiche = une && une.querySelector('.fx-poster');
      if(affiche){
        const r = une.getBoundingClientRect();
        const dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
        affiche.style.setProperty('--ry', (dx * 14).toFixed(2) + 'deg');
        affiche.style.setProperty('--rx', (-dy * 10).toFixed(2) + 'deg');
      }
    }, { passive: true });
    document.addEventListener('pointerout', e=>{
      const une = e.target.closest && e.target.closest('.carousel-item');
      if(!une || une.contains(e.relatedTarget)) return;
      const affiche = une.querySelector('.fx-poster');
      if(affiche){ affiche.style.removeProperty('--rx'); affiche.style.removeProperty('--ry'); }
    });
  }

  /* ---------- 8. À la une : le texte de la diapositive entre en cascade ---------- */
  const points = document.getElementById('carouselDots');
  const piste = document.getElementById('carouselTrack');
  if(points && piste){
    let derniere = 0;
    new MutationObserver(()=>{
      const i = [...points.children].findIndex(p => p.classList.contains('active'));
      if(i < 0 || i === derniere) return;
      derniere = i;
      const diapo = piste.children[i];
      if(!diapo) return;
      diapo.querySelectorAll('.fx-text > *').forEach((bloc, n)=>{
        jouer(bloc, { opacity: [0, 1], x: [26, 0] },
          { duration: 0.5, delay: 0.18 + n * 0.06, ease: [0.22, 1, 0.36, 1] });
      });
    }).observe(points, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  /* ---------- 9. Carte : les épingles tombent à son arrivée à l'écran ---------- */
  /* Une seule fois : la carte est redessinée à chaque filtre, et des épingles
     qui retombent à chaque clic lasseraient vite. */
  const carteFr = document.getElementById('franceMap');
  if(carteFr && typeof M.inView === 'function'){
    const stop = M.inView(carteFr, ()=>{
      carteFr.classList.add('pins-intro');
      setTimeout(()=> carteFr.classList.remove('pins-intro'), 1300);
      if(typeof stop === 'function') stop();
    }, { amount: 0.25 });
  }

  /* ---------- 10. Terrain du hero : un clic rejoue l'action ---------- */
  const terrain = document.getElementById('heroCourt');
  if(terrain){
    terrain.addEventListener('click', ()=>{
      const svg = terrain.querySelector('svg');
      const copie = svg.cloneNode(true);   // un élément neuf relance ses animations CSS
      svg.replaceWith(copie);
    });
  }

  /* ---------- Premier affichage ---------- */
  const active = document.querySelector('.page.active');
  if(active) animerPage(active);
  animerCartes([...document.querySelectorAll('.event-card')]);
})();
