/* =========================================================
   EBOK — ADMIN : IMPORTER UN LOT D'ÉVÉNEMENTS
   ---------------------------------------------------------
   Le cas : l'admin a 5 à 15 événements (liens, affiches, calendrier) à faire
   entrer sur le site. Il les confie à Claude dans une session, qui les lit et
   rend un lot au format JSON décrit dans IMPORT_LOT.md. L'admin le colle ici :
   l'aperçu signale ce qui cloche (doublon probable, date passée, champ illisible),
   il joint les affiches, puis ajoute le lot. Les événements passent par le chemin
   normal de création (même géocodage, même hébergement d'affiche, même route
   authentifiée) : en attente de vérification par défaut, ou en ligne tout de suite.

   S'appuie sur js/app.js (esc, safeUrl, lienPropre, parseDay, isPast, fmtDateRange,
   resolveCoords, hostPoster, compressImage, listeRegions, TYPE_COLORS, AGE_OPTIONS,
   DEFAULT_COUNTRY, events, refreshPublicEvents, renderAll, renderAdminEvents) et sur
   window.EBOK_DATA (createEvent, getAllEventsForAdmin).
   ========================================================= */
(function(){
  const $ = id => document.getElementById(id);
  const MAX_LIGNES = 50;
  const SEXES = ['Masculin', 'Féminin', 'Mixte'];
  const NIVEAUX = ['Tous niveaux', 'Loisir', 'Amateur', 'Confirmé', 'Semi-pro / Pro'];
  const VOYAGE = ['dateDepart', 'dateRetour', 'lieuxDepart', 'lieuRetour', 'destination', 'logement'];

  let lignes = [];
  let enCours = false;
  let construit = false;

  const EXEMPLE = `{
  "evenements": [
    {
      "title": "Summer 3x3 de Montpellier",
      "type": "Circuit 3x3",
      "dateStart": "2027-07-10",
      "dateEnd": "2027-07-11",
      "city": "Montpellier",
      "address": "Gymnase Jean Bouin",
      "sexe": "Mixte",
      "age": ["U15", "U17"],
      "niveau": "Amateur",
      "tarif": "10 € par équipe",
      "horaires": "9h à 18h",
      "orgName": "Mosson Basket",
      "email": "contact@exemple.fr",
      "lienInscription": "https://exemple.fr/inscription",
      "source": "https://exemple.fr/summer-3x3",
      "doutes": ["Année absente de l'affiche : 2027 supposé"]
    }
  ]
}`;

  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const cle = s => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();
  const court = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  /* Valeur d'une liste fermée, sans tenir compte de la casse ni des accents. */
  const dans = (valeur, liste) => liste.find(x => norm(x) === norm(valeur)) || null;

  function lireLot(texte){
    let t = String(texte || '').trim();
    // Un lot copié depuis un message arrive souvent dans un bloc de code.
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    if(!t) throw new Error('Colle d\'abord le lot, ou choisis un fichier.');
    let data;
    try{ data = JSON.parse(t); }
    catch(e){ throw new Error('Ce texte n\'est pas au bon format. Vérifie que tu as collé tout le lot, de la première accolade à la dernière.'); }
    const liste = Array.isArray(data) ? data : (data && Array.isArray(data.evenements) ? data.evenements : null);
    if(!liste) throw new Error('Je ne trouve pas la liste « evenements » dans ce texte.');
    if(!liste.length) throw new Error('Le lot est vide.');
    if(liste.length > MAX_LIGNES) throw new Error(`Trop d'événements d'un coup (${liste.length}). Maximum : ${MAX_LIGNES}.`);
    return liste;
  }

  /* Un événement du lot, vérifié : ce qui bloque (erreurs), ce qui mérite un
     coup d'œil (alertes), et un éventuel doublon déjà sur le site. */
  function analyser(b, i, existants){
    b = (b && typeof b === 'object') ? b : {};
    const erreurs = [], alertes = [];
    const l = {
      i, statut: 'attente', message: '', poster: '',
      title: court(b.title, 200), city: court(b.city, 120), pays: court(b.pays, 80) || DEFAULT_COUNTRY,
      address: court(b.address, 200), tarif: court(b.tarif, 200),
      horaires: court(b.horaires, 200), buvette: court(b.buvette, 200), reservation: court(b.reservation, 200),
      description: String(b.description == null ? '' : b.description).trim().slice(0, 3000),
      orgName: court(b.orgName, 120), insta: court(b.insta, 80).replace(/^@/, ''), site: court(b.site, 300),
      tel: court(b.tel, 40), email: court(b.email, 120),
      dateStart: court(b.dateStart, 10), dateEnd: court(b.dateEnd, 10),
    };

    if(!l.title) erreurs.push('Titre manquant.');
    if(!l.city) erreurs.push('Ville manquante.');
    if(!parseDay(l.dateStart)) erreurs.push('Date de début absente ou illisible (format AAAA-MM-JJ).');
    if(l.dateStart && parseDay(l.dateStart)){
      if(!parseDay(l.dateEnd)) l.dateEnd = l.dateStart;
      else if(l.dateEnd < l.dateStart){ alertes.push('Date de fin avant le début : remise au jour de début.'); l.dateEnd = l.dateStart; }
      if(isPast({ dateEnd: l.dateEnd })) alertes.push('Cet événement est déjà passé.');
    }

    l.type = dans(b.type, Object.keys(TYPE_COLORS));
    if(!l.type){
      if(b.type) alertes.push(`Type « ${court(b.type, 40)} » inconnu : classé en Divers.`);
      l.type = 'Divers';
    }
    l.sexe = dans(b.sexe, SEXES);
    if(!l.sexe){ if(b.sexe) alertes.push(`Public « ${court(b.sexe, 30)} » inconnu : remis à Mixte.`); l.sexe = 'Mixte'; }
    l.niveau = dans(b.niveau, NIVEAUX);
    if(!l.niveau){ if(b.niveau) alertes.push(`Niveau « ${court(b.niveau, 30)} » inconnu : remis à Loisir.`); l.niveau = 'Loisir'; }

    const ages = Array.isArray(b.age) ? b.age : (b.age ? [b.age] : []);
    l.age = [];
    for(const a of ages){
      const ok = dans(a, AGE_OPTIONS);
      if(ok) { if(!l.age.includes(ok)) l.age.push(ok); }
      else alertes.push(`Catégorie d'âge « ${court(a, 20)} » inconnue : ignorée.`);
    }

    const regions = listeRegions();
    const reg = court(b.region, 80);
    l.region = '';
    if(reg){
      const ok = dans(reg, [...regions.metro, ...regions.outreMer]);
      if(ok) l.region = ok; else alertes.push(`Région « ${reg} » inconnue : elle sera déduite de la ville.`);
    }

    const lien = (champ, libelle) => {
      if(!b[champ]) return '';
      const v = lienPropre(b[champ]);
      if(!v) alertes.push(`${libelle} illisible : ignoré.`);
      return v;
    };
    l.lienInscription = lien('lienInscription', "Lien d'inscription");
    l.lienBilletterie = lien('lienBilletterie', 'Lien de billetterie');
    l.siteOfficiel = lien('siteOfficiel', 'Site officiel');
    l.source = b.source ? (safeUrl(String(b.source).trim()) && /^https?:/i.test(String(b.source).trim()) ? String(b.source).trim().slice(0, 500) : '') : '';

    const places = parseInt(b.placesTotal, 10);
    l.placesTotal = Number.isFinite(places) && places > 0 ? places : null;

    l.voyage = {};
    if(l.type === 'Voyage' && b.voyage && typeof b.voyage === 'object'){
      for(const k of VOYAGE) if(b.voyage[k]) l.voyage[k] = court(b.voyage[k], 200);
    }

    const doutes = Array.isArray(b.doutes) ? b.doutes : (b.doutes ? [b.doutes] : []);
    l.doutes = doutes.map(d => court(d, 200)).filter(Boolean).slice(0, 6);

    // Doublon : même jour, même titre, ou même ville et titres qui se contiennent.
    const t = cle(l.title);
    l.doublon = (l.title && l.dateStart) ? (existants.find(e => {
      if(e.dateStart !== l.dateStart) return false;
      const et = cle(e.title);
      return et === t || (cle(e.city) === cle(l.city) && et && t && (et.includes(t) || t.includes(et)));
    }) || null) : null;

    l.erreurs = erreurs;
    l.alertes = alertes;
    l.coche = !erreurs.length && !l.doublon;
    return l;
  }

  function marquerDoublonsDansLot(){
    const vus = new Map();
    for(const l of lignes){
      if(l.erreurs.length) continue;
      const k = cle(l.title) + '|' + l.dateStart;
      if(vus.has(k)){
        l.alertes.push(`Déjà dans ce lot (ligne ${vus.get(k) + 1}).`);
        l.coche = false;
      }else vus.set(k, l.i);
    }
  }

  function intituleStatut(l){
    if(l.statut === 'cours') return '⏳ Ajout en cours…';
    if(l.statut === 'ok') return `✅ Ajouté${l.id ? ` · <button type="button" class="imp-lien" data-voir="${esc(l.id)}">voir la fiche</button>` : ''}`;
    if(l.statut === 'echec') return `⛔ Échec : ${esc(l.message || 'erreur inconnue')}`;
    return '';
  }

  function ligneHtml(l){
    const bloque = l.erreurs.length > 0;
    const figee = enCours || l.statut === 'ok' || l.statut === 'cours';
    const publicTexte = [l.sexe, l.age.length ? l.age.join(', ') : '', l.niveau].filter(Boolean).join(', ');
    return `<div class="imp-ligne${bloque ? ' is-erreur' : ''}${l.statut === 'ok' ? ' is-ok' : ''}" data-i="${l.i}">
      <label class="imp-coche"><input type="checkbox" ${l.coche ? 'checked' : ''} ${(bloque || figee) ? 'disabled' : ''} aria-label="Ajouter « ${esc(l.title || 'sans titre')} »"></label>
      <div class="imp-corps">
        <div class="imp-titre"><b>${esc(l.title || '(sans titre)')}</b><span class="imp-type">${esc(l.type)}</span></div>
        <div class="imp-meta">${esc([fmtDateRange(l.dateStart, l.dateEnd) || 'date ?', l.city || 'ville ?', publicTexte].filter(Boolean).join(' · '))}</div>
        ${l.erreurs.map(e => `<div class="imp-note is-erreur">⛔ ${esc(e)}</div>`).join('')}
        ${l.doublon ? `<div class="imp-note is-doublon">⚠️ Déjà sur le site ? « ${esc(l.doublon.title)} », le même jour. Décoché par défaut.</div>` : ''}
        ${l.alertes.map(a => `<div class="imp-note">⚠️ ${esc(a)}</div>`).join('')}
        ${l.doutes.map(d => `<div class="imp-note">❓ ${esc(d)}</div>`).join('')}
        <div class="imp-pied-ligne">
          ${bloque ? '' : `<label class="btn btn-ghost btn-xs imp-affiche-btn">${l.poster ? "Changer l'affiche" : "Ajouter l'affiche"}<input type="file" accept="image/*" hidden data-affiche="${l.i}" ${figee ? 'disabled' : ''}></label>`}
          ${l.poster ? `<img class="imp-vignette" src="${esc(l.poster)}" alt="Affiche de ${esc(l.title)}">` : ''}
          ${l.source ? `<a class="imp-source" href="${esc(l.source)}" target="_blank" rel="noopener noreferrer">source ↗</a>` : ''}
        </div>
        <div class="imp-statut" role="status">${intituleStatut(l)}</div>
      </div>
    </div>`;
  }

  function nbCoches(){ return lignes.filter(l => l.coche && !l.erreurs.length && l.statut !== 'ok').length; }

  function majPied(){
    const n = nbCoches();
    const bouton = $('impAjouter');
    if(!bouton) return;
    bouton.textContent = enCours ? 'Ajout en cours…' : `Ajouter ${n} événement${n > 1 ? 's' : ''}`;
    bouton.disabled = enCours || n === 0;
    const direct = document.querySelector('input[name="impMode"]:checked');
    $('impAideDirect').classList.toggle('hidden', !(direct && direct.value === 'approved'));
  }

  function dessinerApercu(){
    const zone = $('impApercu');
    if(!lignes.length){ zone.innerHTML = ''; return; }
    const bloquees = lignes.filter(l => l.erreurs.length).length;
    zone.innerHTML = `
      <p class="det-summary"><b>${lignes.length}</b> événement${lignes.length > 1 ? 's' : ''} dans le lot${bloquees ? `, dont <b>${bloquees}</b> à corriger` : ''}. Décoche ce que tu ne veux pas ajouter.</p>
      <div class="imp-lignes">${lignes.map(ligneHtml).join('')}</div>
      <div class="imp-pied">
        <fieldset class="imp-mode">
          <legend>Où les ajouter ?</legend>
          <label><input type="radio" name="impMode" value="pending" checked> <span><b>En attente de vérification</b><small>Tu les valides ensuite dans « À traiter ».</small></span></label>
          <label><input type="radio" name="impMode" value="approved"> <span><b>En ligne tout de suite</b><small>Visibles immédiatement.</small></span></label>
        </fieldset>
        <p class="imp-aide hidden" id="impAideDirect">Les membres dont une alerte correspond sont prévenus dès l'ajout.</p>
        <div class="maint-actions">
          <button type="button" class="btn btn-primary" id="impAjouter"></button>
          <button type="button" class="btn btn-ghost" id="impRecommencer">Recommencer</button>
        </div>
      </div>`;
    majPied();
  }

  function majLigne(l){
    const el = document.querySelector(`.imp-ligne[data-i="${l.i}"]`);
    if(el) el.outerHTML = ligneHtml(l);
  }

  async function verifier(){
    const msg = $('impMessage');
    msg.textContent = '';
    let brut;
    try{ brut = lireLot($('impTexte').value); }
    catch(e){ msg.textContent = '⚠️ ' + e.message; lignes = []; dessinerApercu(); return; }
    // Les événements déjà sur le site : publics, plus tout ce que l'admin a chargé.
    const existants = new Map();
    for(const e of events) existants.set(e.id, e);
    try{
      const tous = await window.EBOK_DATA.getAllEventsForAdmin();
      if(Array.isArray(tous)) for(const e of tous) existants.set(e.id, e);
    }catch(e){ /* sans la liste complète, on compare avec les événements publics */ }
    lignes = brut.map((b, i) => analyser(b, i, [...existants.values()]));
    marquerDoublonsDansLot();
    dessinerApercu();
    msg.textContent = '';
  }

  async function creer(l, direct){
    // Même chemin que le formulaire de publication : position et région
    // d'après la ville, affiche hébergée sur le stockage.
    const coords = await resolveCoords(l.address, l.city, l.region);
    const poster = l.poster ? await hostPoster(l.poster) : '';
    const ev = {
      id: 'evt-' + Date.now() + '-' + l.i,
      title: l.title, type: l.type,
      city: l.city, region: coords.region || l.region || '', pays: l.pays,
      lieu: l.address || l.city,
      x: coords.x, y: coords.y,
      lat: coords.lat != null ? coords.lat : null,
      lng: coords.lng != null ? coords.lng : null,
      dateStart: l.dateStart, dateEnd: l.dateEnd,
      sexe: l.sexe, age: l.age, niveau: l.niveau, tarif: l.tarif,
      lienInscription: l.lienInscription, lienBilletterie: l.lienBilletterie, siteOfficiel: l.siteOfficiel,
      voyage: l.voyage,
      poster: poster || null,
      description: l.description,
      infos: { adresse: l.address, horaires: l.horaires, buvette: l.buvette, reservation: l.reservation },
      gallery: [],
      placesTotal: l.placesTotal, dispo: '',
      featured: false, visibility: 'standard',
      status: direct ? 'approved' : 'pending',
      userId: currentUser ? currentUser.uid : null,
      org: { name: l.orgName, insta: l.insta, site: l.site, tel: l.tel, email: l.email },
    };
    // Trace de l'import : d'où vient l'information, et ce qui restait incertain.
    if(l.source || l.doutes.length) ev.importe = { url: l.source, le: new Date().toISOString().slice(0, 10), doutes: l.doutes };
    l.id = await window.EBOK_DATA.createEvent(ev);
  }

  async function ajouter(){
    if(enCours) return;
    const direct = (document.querySelector('input[name="impMode"]:checked') || {}).value === 'approved';
    const aFaire = lignes.filter(l => l.coche && !l.erreurs.length && l.statut !== 'ok');
    if(!aFaire.length) return;
    enCours = true;
    majPied();
    let ok = 0, echecs = 0;
    for(const l of aFaire){
      l.statut = 'cours'; majLigne(l);
      try{ await creer(l, direct); l.statut = 'ok'; ok++; }
      catch(e){
        l.statut = 'echec'; echecs++;
        l.message = e && e.code === 'auth' ? 'connexion expirée, reconnecte-toi.' : 'enregistrement impossible, réessaie.';
      }
      majLigne(l);
    }
    enCours = false;
    $('impMessage').innerHTML = `✅ <b>${ok}</b> événement${ok > 1 ? 's' : ''} ajouté${ok > 1 ? 's' : ''}${echecs ? `, <b>${echecs}</b> en échec (tu peux réessayer)` : ''}. ${direct ? 'Ils sont en ligne.' : 'Ils t\'attendent dans « À traiter ».'}`;
    majPied();
    if(ok){
      await refreshPublicEvents();
      renderAll();
      renderAdminEvents();
    }
  }

  function brancher(){
    const racine = $('adminImport');
    racine.addEventListener('click', async e => {
      if(e.target.closest('#impVerifier')) verifier();
      else if(e.target.closest('#impAjouter')) ajouter();
      else if(e.target.closest('#impRecommencer')){
        if(enCours) return;
        lignes = []; $('impTexte').value = ''; $('impMessage').textContent = ''; dessinerApercu();
      }else if(e.target.closest('#impExemple')){
        $('impTexte').value = EXEMPLE;
        $('impTexte').focus();
      }else{
        const voir = e.target.closest('[data-voir]');
        if(voir) openEvent(voir.dataset.voir);
      }
    });
    racine.addEventListener('change', async e => {
      const t = e.target;
      if(t.id === 'impFichier' && t.files[0]){
        try{ $('impTexte').value = await t.files[0].text(); verifier(); }
        catch(err){ $('impMessage').textContent = '⚠️ Impossible de lire ce fichier.'; }
        t.value = '';
      }else if(t.matches('.imp-coche input')){
        const l = lignes[Number(t.closest('.imp-ligne').dataset.i)];
        if(l){ l.coche = t.checked; majPied(); }
      }else if(t.name === 'impMode'){
        majPied();
      }else if(t.dataset && t.dataset.affiche != null && t.files[0]){
        const l = lignes[Number(t.dataset.affiche)];
        try{ l.poster = await compressImage(t.files[0], 1200, 0.8); majLigne(l); }
        catch(err){ l.alertes.push("L'affiche n'a pas pu être lue."); majLigne(l); }
      }
    });
  }

  /* Appelée par js/admin-page.js à l'ouverture de l'administration. */
  window.renderAdminImport = function(){
    const racine = $('adminImport');
    if(!racine || construit) return;
    if(!window.EBOK_DATA || typeof window.EBOK_DATA.createEvent !== 'function'){
      racine.innerHTML = '<p class="maint-desc">Disponible une fois la base connectée.</p>';
      return;
    }
    construit = true;
    racine.innerHTML = `
      <p class="maint-desc">
        Envoie tes liens, affiches ou calendriers à Claude dans une session sur ce projet : il te rend un lot.
        Colle-le ici, vérifie l'aperçu, joins les affiches, puis ajoute.
      </p>
      <label class="sr-only" for="impTexte">Lot d'événements</label>
      <textarea id="impTexte" class="report-text imp-texte" rows="6" placeholder="Colle ici le lot d'événements…" spellcheck="false"></textarea>
      <div class="maint-actions">
        <button type="button" class="btn btn-primary" id="impVerifier">Vérifier le lot</button>
        <label class="btn btn-ghost imp-fichier">Choisir un fichier<input type="file" id="impFichier" accept=".json,application/json,text/plain" hidden></label>
      </div>
      <div class="maint-status" id="impMessage" role="status"></div>
      <div id="impApercu"></div>
      <details class="imp-format">
        <summary>Format attendu</summary>
        <p class="maint-desc">Un objet avec la liste <code>evenements</code>. Seuls <code>title</code>, <code>type</code>, <code>dateStart</code> (AAAA-MM-JJ) et <code>city</code> sont obligatoires. Le détail est dans <code>IMPORT_LOT.md</code>.</p>
        <pre class="imp-exemple" tabindex="0">${esc(EXEMPLE)}</pre>
        <button type="button" class="btn btn-ghost btn-xs" id="impExemple">Coller l'exemple pour essayer</button>
      </details>`;
    brancher();
  };
})();
