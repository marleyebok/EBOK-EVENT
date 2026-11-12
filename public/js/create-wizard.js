/* =========================================================
   EBOK — PARCOURS DE PUBLICATION EN ÉTAPES
   ---------------------------------------------------------
   Le formulaire de publication présentait une trentaine de champs d'un coup :
   de quoi décourager un organisateur bénévole. Il est découpé en cartes
   courtes, une à la fois, avec une barre de progression et un aperçu de la
   fiche qui se construit pendant la saisie.

   Ce fichier ne fait QUE la présentation. Les champs gardent leurs
   identifiants : la publication (initCreatePage, js/app.js) et l'assistant
   IA (runImport) les lisent et les remplissent comme avant. Il s'appuie sur
   des fonctions de js/app.js (esc, safeImg, typeColor, fmtDateRange,
   ageLabel, readAgeChoices, openAuth, currentUser…), chargé avant lui.
   ========================================================= */
(function(){
  const form = document.getElementById('createForm');
  if(!form) return;

  const $ = id => document.getElementById(id);
  const etapes = Array.from(form.querySelectorAll('.wz-step'));
  const btnRetour = $('wzBack');
  const btnPasser = $('wzSkip');
  const btnSuivant = $('wzNext');
  const btnPublier = $('wzSubmit');
  const blocIa = $('iaImport');

  let courante = 'depart';

  // Message d'erreur commun, placé juste au-dessus des boutons.
  const erreur = document.createElement('p');
  erreur.className = 'wz-error hidden';
  erreur.setAttribute('role', 'alert');
  form.querySelector('.wz-nav').before(erreur);

  /* --- Étapes ------------------------------------------------------------ */

  /* L'étape « voyage » n'existe que pour ce type d'événement. */
  function etapesActives(){
    const voyage = $('c-type') && $('c-type').value === 'Voyage';
    return etapes.filter(e => e.dataset.step !== 'voyage' || voyage);
  }
  const etape = cle => etapes.find(e => e.dataset.step === cle);

  /* Une étape sans aucun champ obligatoire peut être passée : le bouton
     « Passer » le dit clairement, pour qu'un organisateur ne croie pas devoir
     tout remplir. Seuls le nom, le type, la date de début et la ville sont
     exigés (sans eux, pas de fiche ni de place sur la carte). */
  const facultative = el => el.dataset.step !== 'depart' && el.dataset.step !== 'recap'
    && !el.querySelector('[required]');

  function afficher(cle){
    const actives = etapesActives();
    if(!actives.some(e => e.dataset.step === cle)) cle = 'depart';
    courante = cle;
    const i = actives.findIndex(e => e.dataset.step === cle);
    const el = actives[i];

    etapes.forEach(e => e.classList.toggle('active', e === el));
    masquerErreur();

    // Progression : l'étape de départ compte pour la première.
    $('wzStepLabel').textContent = `Étape ${i + 1} sur ${actives.length}`;
    $('wzStepTitle').textContent = el.dataset.title || '';
    $('wzBarFill').style.width = `${Math.max(4, (i / (actives.length - 1)) * 100)}%`;

    const depart = cle === 'depart';
    const recap = cle === 'recap';
    btnRetour.classList.toggle('invisible', depart);
    btnPasser.classList.toggle('hidden', !facultative(el));
    btnSuivant.classList.toggle('hidden', depart || recap);
    btnPublier.classList.toggle('hidden', !recap);
    form.classList.toggle('wz-is-recap', recap);

    if(recap) rendreRecap();
    majApercu();

    // On ramène le haut du parcours à l'écran s'il est sorti par le haut.
    const haut = $('wizard').getBoundingClientRect().top;
    if(haut < 0) $('wizard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function suivante(){
    const actives = etapesActives();
    const i = actives.findIndex(e => e.dataset.step === courante);
    if(i < actives.length - 1) afficher(actives[i + 1].dataset.step);
  }
  function precedente(){
    const actives = etapesActives();
    const i = actives.findIndex(e => e.dataset.step === courante);
    if(i > 0) afficher(actives[i - 1].dataset.step);
  }

  /* --- Validation -------------------------------------------------------- */

  /* Libellé lisible d'un champ, sans la mention « (facultatif) ». */
  function libelle(champ){
    const l = form.querySelector(`label[for="${champ.id}"]`);
    return l ? l.childNodes[0].textContent.trim() : champ.id;
  }

  /* Problèmes d'une étape : champs obligatoires vides, formats invalides,
     dates incohérentes. Renvoie une liste de { champ, message }. */
  function problemes(el){
    const liste = [];
    el.querySelectorAll('input, select, textarea').forEach(champ => {
      if(champ.type === 'file' || champ.type === 'checkbox') return;
      const vide = !String(champ.value || '').trim();
      if(champ.required && vide){
        liste.push({ champ, message: `${libelle(champ)} : à remplir` });
      }else if(!vide && champ.type === 'email' && !champ.checkValidity()){
        liste.push({ champ, message: 'E-mail : l\'adresse semble incomplète' });
      }
    });
    if(el.dataset.step === 'essentiel'){
      const debut = $('c-date-debut').value, fin = $('c-date-fin').value;
      if(debut && fin && fin < debut){
        liste.push({ champ: $('c-date-fin'), message: 'La date de fin est avant la date de début' });
      }
    }
    return liste;
  }

  function montrerErreur(liste){
    form.querySelectorAll('.field.invalid').forEach(f => f.classList.remove('invalid'));
    liste.forEach(p => p.champ.closest('.field')?.classList.add('invalid'));
    erreur.textContent = '⚠️ ' + liste.map(p => p.message).join(' · ');
    erreur.classList.remove('hidden');
    liste[0].champ.focus({ preventScroll: false });
  }
  function masquerErreur(){
    erreur.classList.add('hidden');
    form.querySelectorAll('.field.invalid').forEach(f => f.classList.remove('invalid'));
  }

  /* Vérifie toutes les étapes avant publication ; s'arrête sur la première
     étape à corriger. */
  function toutValider(){
    for(const el of etapesActives()){
      const liste = problemes(el);
      if(liste.length){
        afficher(el.dataset.step);
        montrerErreur(liste);
        return false;
      }
    }
    return true;
  }

  /* --- Aperçu de la fiche ------------------------------------------------ */

  const val = id => String(($(id) && $(id).value) || '').trim();

  function affichePresente(){
    const img = $('dzPreview');
    return img && !img.classList.contains('hidden') && img.src ? img.src : '';
  }

  /* Même rendu que les cartes de la liste (classes .event-card), sans les
     boutons favori / modification, et avec des textes d'attente. */
  function carteApercu(){
    const type = val('c-type') || 'Divers';
    const couleur = typeColor(type);
    const affiche = safeImg(affichePresente());
    const debut = val('c-date-debut'), fin = val('c-date-fin') || debut;
    const dates = debut ? fmtDateRange(debut, fin) : '<span class="wz-ph">Dates à venir</span>';
    const ville = val('c-ville') ? `<b>${esc(val('c-ville'))}</b>` : '<span class="wz-ph">Ville</span>';
    const titre = val('c-nom') ? esc(val('c-nom')) : '<span class="wz-ph">Nom de ton événement</span>';
    const ages = readAgeChoices('c-age');
    const dispo = val('c-dispo');
    return `
      <div class="event-card wz-card">
        <div class="card-media">
          ${affiche
            ? `<img src="${esc(affiche)}" alt="Aperçu de l'affiche">`
            : `<div class="wz-card-noposter" style="background:linear-gradient(135deg, ${couleur}33, var(--asphalt-3));color:${couleur}">${esc(type.toUpperCase())}</div>`}
          <span class="card-type-badge" style="background:${couleur}">${esc(type)}</span>
          ${dispo && DISPO_META[dispo] ? `<span class="dispo-badge ${DISPO_META[dispo].cls}">${DISPO_META[dispo].label}</span>` : ''}
        </div>
        <div class="card-body">
          <h4>${titre}</h4>
          <div class="card-meta">
            ${ville} · ${dates}<br>
            ${esc(val('c-sexe') || 'Mixte')} · ${esc(ages.length ? ageLabel(ages) : 'Tous âges')} · ${esc(val('c-niveau') || 'Loisir')}
          </div>
        </div>
      </div>`;
  }

  function majApercu(){
    const html = carteApercu();
    $('wzPreviewCard').innerHTML = html;
    const recapCarte = $('wzRecapCard');
    if(recapCarte) recapCarte.innerHTML = html;
  }

  /* --- Récapitulatif ----------------------------------------------------- */

  function ligne(label, valeur){
    return valeur ? `<div class="wz-recap-row"><span>${esc(label)}</span><b>${esc(valeur)}</b></div>` : '';
  }

  function rendreRecap(){
    const sections = [
      ['essentiel', 'L\'essentiel', [
        ['Nom', val('c-nom')], ['Type', val('c-type')],
        ['Dates', val('c-date-debut') ? fmtDateRange(val('c-date-debut'), val('c-date-fin') || val('c-date-debut')) : ''],
      ]],
      ['voyage', 'Le voyage', [
        ['Destination', val('c-voy-destination')], ['Départ', val('c-voy-lieux-depart')],
        ['Logement', val('c-voy-logement')],
      ]],
      ['lieu', 'Où', [
        ['Ville', val('c-ville')], ['Région', val('c-region')], ['Pays', val('c-pays')],
        ['Adresse', val('c-adresse')],
      ]],
      ['public', 'Pour qui', [
        ['Âge', readAgeChoices('c-age').join(', ')], ['Public', val('c-sexe')],
        ['Niveau', val('c-niveau')], ['Tarifs', val('c-tarif')],
      ]],
      ['affiche', 'Affiche et description', [
        ['Affiche', affichePresente() ? 'Ajoutée ✓' : 'Pas d\'affiche'],
        ['Description', val('c-desc')],
      ]],
      ['pratique', 'Infos pratiques', [
        ['Horaires', val('c-horaires')], ['Buvette', val('c-buvette')],
        ['Réservation', val('c-reservation')], ['Places', val('c-places')],
        ['Lien d\'inscription', val('c-inscription')], ['Billetterie', val('c-billetterie')],
        ['Site officiel', val('c-site-officiel')],
      ]],
      ['contact', 'Contact', [
        ['Diffuseur', val('c-orgname')], ['Instagram', val('c-insta')], ['Site', val('c-site')],
        ['Téléphone', val('c-tel')], ['E-mail', val('c-email')],
      ]],
    ];
    const actives = new Set(etapesActives().map(e => e.dataset.step));
    const manque = etapesActives().filter(e => problemes(e).length);

    $('wzRecap').innerHTML = `
      ${manque.length ? `<p class="wz-recap-warn">⚠️ Il reste à compléter : ${manque.map(e => esc(e.dataset.title)).join(', ')}.</p>` : ''}
      <div class="wz-recap-card" id="wzRecapCard"></div>
      ${sections.filter(([cle]) => actives.has(cle)).map(([cle, titre, lignes]) => {
        const contenu = lignes.map(([l, v]) => ligne(l, v)).join('');
        return `
        <div class="wz-recap-sec">
          <div class="wz-recap-head">
            <h4>${esc(titre)}</h4>
            <button type="button" class="wz-edit" data-goto="${cle}">Modifier</button>
          </div>
          ${contenu || '<p class="wz-recap-empty">Rien de renseigné</p>'}
        </div>`;
      }).join('')}`;
  }

  /* --- Branchements ------------------------------------------------------ */

  btnSuivant.addEventListener('click', () => {
    const liste = problemes(etape(courante));
    if(liste.length){ montrerErreur(liste); return; }
    suivante();
  });
  btnRetour.addEventListener('click', precedente);
  btnPasser.addEventListener('click', suivante);

  $('wzRecap').addEventListener('click', e => {
    const b = e.target.closest('[data-goto]');
    if(b) afficher(b.dataset.goto);
  });

  $('wzChoiceManuel').addEventListener('click', () => {
    blocIa.classList.add('hidden');
    afficher('essentiel');
  });
  $('wzChoiceIa').addEventListener('click', () => {
    // L'assistant demande un compte : le serveur vérifie la session et le quota.
    if(typeof currentUser !== 'undefined' && !currentUser && typeof openAuth === 'function'){
      openAuth('login');
      return;
    }
    $('wzChoiceIa').classList.add('selected');
    blocIa.classList.remove('hidden');
    blocIa.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    $('ia-url').focus({ preventScroll: true });
  });

  // Entrée dans un champ : passer à l'étape suivante plutôt que publier.
  form.addEventListener('keydown', e => {
    if(e.key !== 'Enter' || e.target.tagName === 'TEXTAREA' || e.target.type === 'submit') return;
    if(e.target.closest('.ac-wrap')) return;          // l'autocomplétion de ville gère sa touche Entrée
    if(e.target.id === 'ia-url'){ e.preventDefault(); $('ia-btn').click(); return; }
    if(courante !== 'recap'){ e.preventDefault(); btnSuivant.click(); }
  });

  // Aperçu en direct : toute saisie, tout choix, toute affiche ajoutée.
  form.addEventListener('input', majApercu);
  form.addEventListener('change', () => {
    majApercu();
    // Changer de type peut ajouter ou retirer l'étape « voyage » : la
    // progression doit suivre.
    if(courante !== 'depart') afficher(courante);
  });
  $('dzPreview').addEventListener('load', majApercu);

  // Contrôle final, AVANT le gestionnaire de publication de js/app.js
  // (phase de capture sur le document, qui passe avant ceux du formulaire).
  document.addEventListener('submit', e => {
    if(e.target !== form) return;
    if(courante !== 'recap' || !toutValider()){
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  // Après une publication réussie, js/app.js vide le formulaire : on repart
  // du début pour un éventuel événement suivant.
  form.addEventListener('reset', () => {
    setTimeout(() => {
      blocIa.classList.add('hidden');
      $('wzChoiceIa').classList.remove('selected');
      $('ia-status').textContent = '';
      // Le contact mémorisé revient pour l'événement suivant.
      if(typeof prefillOrgFromProfile === 'function') prefillOrgFromProfile();
      afficher('depart');
    }, 0);
  });

  /* Appelée par runImport (js/app.js) quand l'IA a rempli le formulaire :
     direction le récapitulatif, où tout se relit et se corrige d'un clic. */
  window.wizardApresImport = function(){
    afficher('recap');
  };

  afficher('depart');
})();
