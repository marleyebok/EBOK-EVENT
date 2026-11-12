/* =========================================================
   EBOK — PAGE ADMINISTRATION : onglets, compteurs, pastille
   ---------------------------------------------------------
   La page regroupe ce qui était mêlé à « Mon profil » :
     À traiter   événements à vérifier + signalements
     Importer    import d'un lot, assistant IA, détection automatique
     Événements  tous les événements, avec recherche
     Membres     les comptes inscrits
     Statistiques membres, événements, favoris, visiteurs, évolution (admin-stats.js)
     Outils      hébergement des affiches

   Chaque liste est dessinée par son propre module (app.js, admin-signalements.js,
   admin-detection.js, admin-import.js) ; ce fichier ne tient que les onglets et
   les compteurs : la pastille du lien Admin, celle de l'onglet « À traiter » et
   la phrase d'ouverture de la page.

   S'appuie sur window.EBOK_DATA (getAllEventsForAdmin, getSignalementsOuverts).
   ========================================================= */
(function(){
  const $ = id => document.getElementById(id);
  const ONGLETS = ['traiter', 'importer', 'evenements', 'membres', 'stats', 'outils'];

  /* aTraiter : événements en attente ou modifiés par leur organisateur
     (comptés une seule fois) ; aVerifier / aRelire : le détail. */
  const compteurs = { aTraiter: 0, aVerifier: 0, aRelire: 0, signalements: 0, evenements: null, membres: null };
  window.adminCompteurs = compteurs;

  const s = n => (n > 1 ? 's' : '');

  function rendreCompteurs(){
    const total = compteurs.aTraiter + compteurs.signalements;
    for(const b of document.querySelectorAll('[data-admin-badge], [data-adm-count="traiter"]')){
      b.textContent = total > 0 ? total : '';
      b.classList.toggle('hidden', !(total > 0));
    }
    const phrase = $('admSummary');
    if(!phrase) return;
    const morceaux = [];
    if(compteurs.aVerifier) morceaux.push(`<b>${compteurs.aVerifier}</b> événement${s(compteurs.aVerifier)} à vérifier`);
    if(compteurs.aRelire) morceaux.push(`<b>${compteurs.aRelire}</b> modification${s(compteurs.aRelire)} d'organisateur à relire`);
    if(compteurs.signalements) morceaux.push(`<b>${compteurs.signalements}</b> signalement${s(compteurs.signalements)}`);
    let texte = morceaux.length ? morceaux.join(', ') + '.' : 'Rien à traiter pour le moment.';
    const stock = [];
    if(compteurs.evenements != null) stock.push(`${compteurs.evenements} événement${s(compteurs.evenements)}`);
    if(compteurs.membres != null) stock.push(`${compteurs.membres} membre${s(compteurs.membres)}`);
    if(stock.length) texte += ` ${stock.join(', ')} au total.`;
    phrase.innerHTML = texte;
  }

  /* Détail des compteurs à partir de la liste complète des événements. */
  window.compterEvenementsAdmin = function(liste){
    const enAttente = liste.filter(e => e.status !== 'approved');
    const aRelire = liste.filter(e => e.aRelire);
    return {
      aTraiter: liste.filter(e => e.status !== 'approved' || e.aRelire).length,
      aVerifier: enAttente.length,
      aRelire: aRelire.length,
      evenements: liste.length,
    };
  };
  window.majTableauAdmin = function(partiel){
    Object.assign(compteurs, partiel);
    rendreCompteurs();
  };

  /* À la connexion de l'admin : de quoi remplir la pastille sans ouvrir la page. */
  window.majPastilleAdmin = async function(admin){
    if(!admin){
      Object.assign(compteurs, { aTraiter: 0, aVerifier: 0, aRelire: 0, signalements: 0 });
      rendreCompteurs();
      return;
    }
    const data = window.EBOK_DATA;
    if(!data) return;
    const [evenements, signalements] = await Promise.allSettled([
      typeof data.getAllEventsForAdmin === 'function' ? data.getAllEventsForAdmin() : Promise.reject(),
      typeof data.getSignalementsOuverts === 'function' ? data.getSignalementsOuverts() : Promise.reject(),
    ]);
    if(evenements.status === 'fulfilled' && Array.isArray(evenements.value)) Object.assign(compteurs, window.compterEvenementsAdmin(evenements.value));
    if(signalements.status === 'fulfilled') compteurs.signalements = Number(signalements.value) || 0;
    rendreCompteurs();
  };

  /* ---------- Onglets ---------- */
  function choisir(nom, focus){
    if(!ONGLETS.includes(nom)) nom = 'traiter';
    for(const t of ONGLETS){
      const onglet = $('tab-' + t), panneau = $('panel-' + t);
      if(!onglet || !panneau) continue;
      const actif = t === nom;
      onglet.setAttribute('aria-selected', String(actif));
      onglet.tabIndex = actif ? 0 : -1;
      panneau.classList.toggle('hidden', !actif);
      if(actif && focus) onglet.focus();
    }
    try{ localStorage.setItem('ebok-admin-onglet', nom); }catch(e){ /* confort seulement */ }
    // Les statistiques se chargent à l'ouverture de leur onglet, pas avec la page.
    if(nom === 'stats' && typeof renderAdminStats === 'function') renderAdminStats();
  }
  window.choisirOngletAdmin = choisir;

  function brancher(){
    const barre = document.querySelector('.adm-tabs');
    if(!barre || barre.dataset.ready) return;
    barre.dataset.ready = '1';
    barre.addEventListener('click', e => {
      const b = e.target.closest('[data-adm]');
      if(b) choisir(b.dataset.adm);
    });
    // Flèches gauche / droite entre les onglets, comme sur tout menu d'onglets.
    barre.addEventListener('keydown', e => {
      if(e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
      const actuel = ONGLETS.findIndex(t => $('tab-' + t).getAttribute('aria-selected') === 'true');
      let suivant = actuel;
      if(e.key === 'ArrowRight') suivant = (actuel + 1) % ONGLETS.length;
      else if(e.key === 'ArrowLeft') suivant = (actuel - 1 + ONGLETS.length) % ONGLETS.length;
      else if(e.key === 'Home') suivant = 0;
      else suivant = ONGLETS.length - 1;
      e.preventDefault();
      choisir(ONGLETS[suivant], true);
    });
    const ia = $('admIaBtn');
    if(ia) ia.addEventListener('click', () => {
      showPage('create');
      // Le parcours de publication ouvre l'assistant sur ce choix.
      setTimeout(() => { const c = $('wzChoiceIa'); if(c) c.click(); }, 60);
    });
    const recherche = $('adminSearch');
    if(recherche) recherche.addEventListener('input', () => adminFiltrer(recherche.value));
  }

  /* Appelée par showPage('admin') : (re)dessine toutes les listes. */
  window.renderAdminPage = function(){
    brancher();
    let nom = 'traiter';
    try{ nom = localStorage.getItem('ebok-admin-onglet') || 'traiter'; }catch(e){ /* confort seulement */ }
    choisir(nom);
    rendreCompteurs();
    if(typeof renderAdminEvents === 'function') renderAdminEvents();
    if(typeof renderAdminMembers === 'function') renderAdminMembers();
    if(typeof renderAdminSignalements === 'function') renderAdminSignalements();
    if(typeof renderAdminDetection === 'function') renderAdminDetection();
    if(typeof renderAdminImport === 'function') renderAdminImport();
  };
})();
