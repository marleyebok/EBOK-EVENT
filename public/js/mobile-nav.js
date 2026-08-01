/* =========================================================
   EBOK Event — NAVIGATION MOBILE
   ---------------------------------------------------------
   Bouton « Menu » dans la barre du haut + panneau plein écran
   qui rassemble toute la navigation (pages, compte, thème).
   Sur mobile, la barre du haut ne garde que le logo et ce bouton.

   Le routage reste celui de app.js : les entrées portent
   data-nav et sont câblées par showPage() automatiquement.
   Ce fichier ne gère que l'ouverture/fermeture et l'état affiché.
   ========================================================= */
(function(){
  'use strict';

  const panel   = document.getElementById('mobileNav');
  const toggle  = document.getElementById('navToggle');
  if(!panel || !toggle) return;

  const MOBILE = '(max-width:900px)';
  const label  = toggle.querySelector('.nav-toggle-label');

  /* ---------- ouverture / fermeture ---------- */
  let lastFocus = null;

  // Le panneau commence sous la barre du haut, dont la hauteur varie.
  function setTopOffset(){
    const bar = document.querySelector('.topbar');
    if(bar) document.documentElement.style.setProperty('--topbar-h', bar.offsetHeight + 'px');
  }

  function isOpen(){ return panel.classList.contains('open'); }

  function open(){
    setTopOffset();
    syncActive();
    lastFocus = document.activeElement;
    panel.classList.add('open');
    document.body.classList.add('mnav-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Fermer le menu');
    toggle.classList.add('is-open');
    if(label) label.textContent = 'Fermer';
    const first = panel.querySelector('button, a, summary');
    if(first) first.focus();
  }

  function close(){
    if(!isOpen()) return;
    panel.classList.remove('open');
    document.body.classList.remove('mnav-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Ouvrir le menu');
    toggle.classList.remove('is-open');
    if(label) label.textContent = 'Menu';
    // Rendre le focus au bouton, sauf si l'utilisateur est parti ailleurs.
    if(lastFocus === toggle || panel.contains(lastFocus)) toggle.focus();
    lastFocus = null;
  }

  toggle.addEventListener('click', ()=> isOpen() ? close() : open());

  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && isOpen()){ close(); return; }
    if(e.key !== 'Tab' || !isOpen()) return;
    // Le panneau couvre l'écran : on y enferme le focus tant qu'il est ouvert.
    const stops = [toggle].concat([...panel.querySelectorAll('button, a[href], summary, input')])
      .filter(el=> el.offsetParent !== null && !el.disabled);
    if(!stops.length) return;
    const first = stops[0], last = stops[stops.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  });

  // Retour au desktop : le panneau n'a plus lieu d'être.
  window.addEventListener('resize', ()=>{
    setTopOffset();
    if(isOpen() && !window.matchMedia(MOBILE).matches) close();
  });

  /* ---------- entrées du panneau ---------- */
  // data-nav est déjà géré par app.js ; on ferme juste derrière, et on
  // descend jusqu'à la bonne section pour les raccourcis du profil.
  panel.querySelectorAll('[data-nav]').forEach(item=>{
    item.addEventListener('click', ()=>{
      const target = item.dataset.scroll;
      close();
      if(!target) return;
      // showPage() renvoie vers la connexion si le compte manque : on ne
      // fait défiler que si la page profil est bien affichée.
      requestAnimationFrame(()=>{
        const page = document.getElementById('page-profile');
        const box  = document.getElementById(target);
        if(!page || !page.classList.contains('active') || !box) return;
        const section = box.closest('.profile-section') || box;
        section.scrollIntoView({behavior:'smooth', block:'start'});
      });
    });
  });

  panel.querySelectorAll('a[href]').forEach(a=> a.addEventListener('click', close));

  // Connexion / inscription : on réutilise les boutons de la barre du haut
  // pour ne pas dupliquer l'ouverture de la fenêtre d'authentification.
  function relay(fromId, toId){
    const from = document.getElementById(fromId);
    const to   = document.getElementById(toId);
    if(from && to) from.addEventListener('click', ()=>{ close(); to.click(); });
  }
  relay('mnavLogin',  'btnLogin');
  relay('mnavSignup', 'btnSignup');
  relay('mnavLogout', 'btnLogout');

  /* ---------- thème ---------- */
  const themeBtn = document.getElementById('mnavTheme');
  const themeIc  = document.getElementById('mnavThemeIc');
  const themeLbl = document.getElementById('mnavThemeLabel');

  function syncTheme(){
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    if(themeIc)  themeIc.textContent  = light ? '☀️' : '🌙';
    if(themeLbl) themeLbl.textContent = light ? 'Thème clair' : 'Thème sombre';
    if(themeBtn){
      themeBtn.classList.toggle('is-on', !light);
      themeBtn.setAttribute('aria-pressed', String(!light));
    }
  }
  if(themeBtn){
    themeBtn.addEventListener('click', ()=>{
      const bar = document.getElementById('themeToggle');
      if(bar) bar.click();          // la bascule et la mémorisation restent dans app.js
      syncTheme();
    });
  }
  syncTheme();

  /* ---------- galaxie EBOK ---------- */
  const GALAXY = [
    { name: 'BASKETBALL', color: '#E8590C', url: 'https://ebok.fr/' },
    { name: 'VIDEO',      color: '#1FA98C', url: 'https://video.ebok.fr/' },
    { name: 'EVENT',      color: '#E23A3A', url: 'https://event.ebok.fr/', here: true },
    { name: 'MERCATO',    color: '#4CA62E', url: 'https://mercato.ebok.fr/' },
    { name: 'PLAYBOOK',   color: '#E08A2B', url: 'https://playbook.ebok.fr/' },
    { name: 'STATS',      color: '#2E6FD6', url: 'https://stats.ebok.fr/' },
    { name: 'NOTEBOOK',   color: '#7A86A0', url: 'https://notebook.ebok.fr/' },
    { name: 'ACADÉMIE',   color: '#8A4CE0', url: 'https://academie.ebok.fr/' },
    { name: 'SCOUTING',   color: '#EA5A3C', url: 'https://scouting.ebok.fr/' },
    { name: 'BLOG',       color: '#C8317E', url: 'https://blog.ebok.fr/' },
    { name: 'FORUM',      color: '#18A0C4', url: 'https://forum.ebok.fr/' },
    { name: 'MÉDIAS',     color: '#C9A227', url: 'https://medias.ebok.fr/' },
    { name: 'WORKOUT',    color: '#A3BD18', url: 'https://workout.ebok.fr/' }
  ];
  const galaxyBox = document.getElementById('mnavGalaxy');
  if(galaxyBox){
    galaxyBox.innerHTML = GALAXY.map(app=>{
      const dot = `<span class="mnav-dot" style="background:${app.color}"></span>`;
      const nm  = `<span>EBOK ${app.name}</span>`;
      return app.here
        ? `<span class="mnav-gx here">${dot}${nm}<span class="mnav-arrow">vous êtes ici</span></span>`
        : `<a class="mnav-gx" href="${app.url}">${dot}${nm}<span class="mnav-arrow">↗</span></a>`;
    }).join('');
  }

  /* ---------- état affiché ---------- */
  // Surligne l'entrée correspondant à la page ouverte (à l'ouverture du menu).
  function syncActive(){
    const active = document.querySelector('.page.active');
    const name = active ? active.id.replace('page-', '') : 'home';
    panel.querySelectorAll('.mnav-item[data-primary]').forEach(el=>{
      el.classList.toggle('active', el.dataset.nav === name);
    });
  }

  function show(el, visible){ if(el) el.classList.toggle('hidden', !visible); }

  function setCount(el, n){
    if(!el) return;
    el.textContent = n;
    el.classList.toggle('hidden', !(n > 0));
  }

  /* Appelé par app.js quand le compte ou les compteurs changent. */
  const api = {
    setUser(user){
      const logged = !!user;
      show(document.getElementById('mnavWelcome'), !logged);
      show(document.getElementById('mnavUser'),    logged);
      show(document.getElementById('mnavSpace'),   logged);
      show(document.getElementById('mnavCta'),     logged);
      show(document.getElementById('mnavCreate'), !logged);
      show(document.getElementById('mnavLogout'),  logged);
      show(document.getElementById('mnavAdmin'),   logged && !!user.admin);
      if(!logged) return;

      const nameEl = document.getElementById('mnavName');
      const mailEl = document.getElementById('mnavEmail');
      const avaEl  = document.getElementById('mnavAvatar');
      if(nameEl) nameEl.textContent = user.name || 'Mon compte';
      if(mailEl) mailEl.textContent = user.email || '';
      if(avaEl){
        if(user.photo){
          avaEl.style.backgroundImage = `url("${encodeURI(user.photo)}")`;
          avaEl.textContent = '';
        }else{
          avaEl.style.backgroundImage = '';
          avaEl.textContent = (user.name || '?').trim().slice(0,2).toUpperCase();
        }
      }
    },
    setCounts(counts){
      if(counts.favorites != null) setCount(document.getElementById('mnavFavCount'), counts.favorites);
      if(counts.published != null) setCount(document.getElementById('mnavMineCount'), counts.published);
    },
    close: close
  };
  window.EBOK_NAV = api;
  api.setUser(null);   // état de départ : visiteur

  /* =========================================================
     FILTRES REPLIABLES (accueil, mobile)
     ---------------------------------------------------------
     Le panneau « Recherche rapide » pousse la carte hors de
     l'écran sur un téléphone : on le replie derrière un bouton
     qui indique le nombre de filtres actifs.
     ========================================================= */
  const fToggle = document.getElementById('filtersToggle');
  const fPanel  = document.getElementById('filterPanel');
  const fCount  = document.getElementById('filtersCount');

  if(fToggle && fPanel){
    fToggle.addEventListener('click', ()=>{
      const open = fPanel.classList.toggle('open');
      fToggle.setAttribute('aria-expanded', String(open));
      fToggle.classList.toggle('is-open', open);
    });
  }

  /* Nombre de filtres actifs : types, lieu, date. Relu après chaque
     interaction avec le panneau (les filtres vivent dans app.js). */
  function countFilters(){
    let n = 0;
    const chips  = document.querySelectorAll('#typeFilterHome .type-chip');
    const active = document.querySelectorAll('#typeFilterHome .type-chip.active');
    if(active.length && active.length !== chips.length) n++;
    const city = document.getElementById('citySearch');
    if(city && city.value.trim()) n++;
    const period = document.getElementById('periodText');
    if(period && period.textContent.trim() && period.textContent.trim() !== 'Indifférent') n++;
    return n;
  }

  function syncFilterCount(){
    if(!fCount) return;
    const n = countFilters();
    fCount.textContent = n > 1 ? `${n} actifs` : `${n} actif`;
    fCount.classList.toggle('hidden', n === 0);
  }

  if(fPanel){
    fPanel.addEventListener('click', ()=> setTimeout(syncFilterCount, 0));
    fPanel.addEventListener('input', ()=> setTimeout(syncFilterCount, 0));
    syncFilterCount();
  }

  setTopOffset();
})();
