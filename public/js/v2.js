/* =========================================================
   EBOK — PROPOSITION DE DESIGN « V2 » (comportements)
   ---------------------------------------------------------
   Ne fait rien tant que html[data-ui="v2"] n'est pas posé (js/v2-switch.js).

   Trois éléments, tous ajoutés par-dessus la page sans toucher à app.js :
   - le demi-terrain qui se trace derrière le titre, puis le tir qui rentre ;
   - la pastille de l'onglet actif, qui glisse d'un onglet à l'autre ;
   - le bandeau « Aperçu », pour revenir au site actuel.

   Motion (js/vendor/motion.js) anime ; sans lui, ou si le visiteur a demandé
   de réduire les animations, tout s'affiche à sa place, immobile.
   ========================================================= */
(function(){
  if(document.documentElement.getAttribute('data-ui') !== 'v2') return;

  const M = window.Motion;
  const calme = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anime = !!(M && typeof M.animate === 'function') && !calme;
  const doux = [0.22, 1, 0.36, 1];

  /* ---------- Bandeau d'aperçu ---------- */
  const bandeau = document.createElement('div');
  bandeau.className = 'v2-bandeau';
  bandeau.innerHTML = '<span>Aperçu du nouveau design</span><button type="button">Revenir au site actuel</button>';
  bandeau.querySelector('button').addEventListener('click', ()=>{
    try{ localStorage.removeItem('ebok-ui'); }catch(e){ /* rien à retirer */ }
    location.href = location.pathname;
  });
  document.body.appendChild(bandeau);

  /* ---------- Titre : deux lignes qui montent l'une après l'autre ---------- */
  const titre = document.querySelector('#page-home .hero h1');
  if(titre && !titre.querySelector('.v2-ligne')){
    const lignes = titre.innerHTML.split(/<br\s*\/?>/i).map(h=>{
      const tmp = document.createElement('div');
      tmp.innerHTML = h;
      return tmp.textContent.trim();
    }).filter(Boolean);
    titre.textContent = '';
    for(const texte of lignes){
      const ligne = document.createElement('span');
      ligne.className = 'v2-ligne';
      const dedans = document.createElement('span');
      dedans.textContent = texte;
      ligne.appendChild(dedans);
      titre.appendChild(ligne);
    }
  }

  /* ---------- Le demi-terrain ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  const PANIER = { x: 524, y: 260 };
  const TRAITS = [
    'M40 20 H580 V500 H40',                       // lignes de touche et de fond
    'M40 20 V500',                                // ligne médiane
    'M40 190 A70 70 0 0 1 40 330',                // rond central
    'M580 60 H490 A203 203 0 0 0 490 460 H580',   // ligne à trois points
    'M580 180 H390 V340 H580',                    // raquette
    'M390 200 A60 60 0 0 0 390 320',              // demi-cercle des lancers francs
    'M546 222 A38 38 0 0 0 546 298',              // zone de non-charge
    'M546 232 V288',                              // planche
  ];
  function construireTerrain(){
    const hero = document.querySelector('#page-home .hero');
    if(!hero || hero.querySelector('.v2-terrain')) return null;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'v2-terrain');
    svg.setAttribute('viewBox', '0 0 620 520');
    svg.setAttribute('aria-hidden', 'true');
    const traits = TRAITS.map(d=>{
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('pathLength', '1');
      svg.appendChild(p);
      return p;
    });
    const cercle = document.createElementNS(NS, 'circle');
    cercle.setAttribute('class', 'v2-trait v2-cercle');
    cercle.setAttribute('cx', PANIER.x); cercle.setAttribute('cy', PANIER.y); cercle.setAttribute('r', 13);
    cercle.setAttribute('pathLength', '1');
    svg.appendChild(cercle);
    traits.push(cercle);
    const ballon = document.createElementNS(NS, 'circle');
    ballon.setAttribute('class', 'v2-ballon');
    ballon.setAttribute('r', 9);
    ballon.setAttribute('cx', PANIER.x); ballon.setAttribute('cy', PANIER.y);
    svg.appendChild(ballon);
    hero.insertBefore(svg, hero.firstChild);
    return { svg, traits, cercle, ballon };
  }
  const terrain = construireTerrain();

  /* Séquence d'arrivée : le titre monte, le terrain se trace, le tir part de
     la ligne à trois points et rentre. Un seul moment orchestré. */
  if(anime){
    document.querySelectorAll('#page-home .hero .v2-ligne > span').forEach((s, i)=>{
      M.animate(s, { y: ['105%', '0%'] }, { duration: 0.9, delay: 0.05 + i * 0.12, ease: doux });
    });
    if(terrain){
      terrain.traits.forEach((t, i)=>{
        t.style.strokeDasharray = '1';
        t.style.strokeDashoffset = '1';
        M.animate(t, { strokeDashoffset: [1, 0] }, { duration: 1.1, delay: 0.25 + i * 0.09, ease: doux });
      });
      // Trajectoire en cloche (courbe de Bézier) depuis la ligne à trois points.
      const depart = { x: 300, y: 330 }, sommet = { x: 420, y: 20 };
      const xs = [], ys = [];
      for(let k = 0; k <= 16; k++){
        const t = k / 16, u = 1 - t;
        xs.push(u*u*depart.x + 2*u*t*sommet.x + t*t*PANIER.x - PANIER.x);
        ys.push(u*u*depart.y + 2*u*t*sommet.y + t*t*PANIER.y - PANIER.y);
      }
      // Le ballon reste caché jusqu'au départ du tir. Chaque étape est lancée
      // à son heure plutôt que programmée d'avance : deux animations en
      // attente sur le même élément se marcheraient dessus.
      terrain.ballon.style.opacity = '0';
      setTimeout(()=>{
        terrain.ballon.style.opacity = '1';
        M.animate(terrain.ballon, { x: xs, y: ys }, { duration: 1.05, ease: 'linear' });
      }, 1500);
      // Le cercle « encaisse » le tir (son trait s'épaissit), le ballon s'efface.
      setTimeout(()=>{
        M.animate(terrain.cercle, { strokeWidth: [3.5, 8, 3.5] }, { duration: 0.55, ease: 'easeOut' });
        M.animate(terrain.ballon, { opacity: [1, 0] }, { duration: 0.4, ease: 'easeIn' });
      }, 2560);
    }
  }else if(terrain){
    terrain.ballon.style.display = 'none';
  }

  /* ---------- Pastille de l'onglet actif ---------- */
  const nav = document.querySelector('.nav-links');
  if(nav){
    const pastille = document.createElement('span');
    pastille.className = 'v2-nav-pill';
    nav.insertBefore(pastille, nav.firstChild);
    nav.classList.add('v2-pill-on');
    let premiere = true;
    function placer(){
      const actif = nav.querySelector('.navlink.active');
      if(!actif || !actif.offsetWidth){ pastille.style.opacity = '0'; return; }
      const cible = { x: actif.offsetLeft, width: actif.offsetWidth };
      if(anime && !premiere && pastille.style.opacity !== '0'){
        M.animate(pastille, { x: cible.x, width: cible.width }, { type: 'spring', stiffness: 420, damping: 34 });
      }else{
        pastille.style.transform = 'translateX(' + cible.x + 'px)';
        pastille.style.width = cible.width + 'px';
      }
      pastille.style.opacity = '1';
      premiere = false;
    }
    new MutationObserver(placer).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', ()=>{ premiere = true; placer(); });
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{ premiere = true; placer(); });
    placer();
  }

  /* ---------- La barre se resserre dès qu'on défile ---------- */
  const barre = document.querySelector('.topbar');
  if(barre){
    const suivre = ()=> barre.classList.toggle('v2-serree', window.scrollY > 24);
    window.addEventListener('scroll', suivre, { passive: true });
    suivre();
  }
})();
