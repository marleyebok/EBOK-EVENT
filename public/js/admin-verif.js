/* =========================================================
   EBOK — À VÉRIFIER (admin)
   ---------------------------------------------------------
   Sous chaque événement importé ou en attente, la liste de ce qui demande un
   coup d'œil, modifiable sur place :

     ?  une information présente mais incertaine (un « doute » du lot) ;
     ✕  une information importante absente (adresse, horaires, tarif…).

   Le même bloc sert dans l'aperçu d'un lot (Administration → Importer), où
   l'on corrige avant d'ajouter, et dans « À traiter », où chaque correction
   est enregistrée aussitôt sur la fiche. Chaque écran déclare sa « source » :
   comment retrouver l'objet, lire un champ, enregistrer une valeur.

   Classique (pas un module) : s'appuie sur les globales de app.js
   (esc, lienPropre, parseDay, AGE_OPTIONS, compressImage, hostPoster).
   ========================================================= */
(function(){
  const SEXES = ['Masculin', 'Féminin', 'Mixte'];
  const NIVEAUX = ['Tous niveaux', 'Loisir', 'Amateur', 'Confirmé', 'Semi-pro / Pro'];

  /* Champs modifiables sur place. t = type de saisie. */
  const CHAMPS = {
    title:           { l: 'Titre' },
    dateStart:       { l: 'Date de début', t: 'date' },
    dateEnd:         { l: 'Date de fin', t: 'date' },
    address:         { l: 'Adresse / salle', ph: 'Nom de la salle, rue…' },
    horaires:        { l: 'Horaires', ph: 'ex. 9h à 18h' },
    tarif:           { l: 'Tarif', ph: 'ex. 10 € par équipe, Gratuit' },
    sexe:            { l: 'Public', t: 'select', o: SEXES },
    age:             { l: 'Âges', t: 'ages' },
    niveau:          { l: 'Niveau', t: 'select', o: NIVEAUX },
    lienInscription: { l: "Lien d'inscription", t: 'url', ph: 'https://…' },
    lienBilletterie: { l: 'Lien de billetterie', t: 'url', ph: 'https://…' },
    reservation:     { l: 'Inscription / réservation' },
    orgName:         { l: 'Organisateur' },
    insta:           { l: 'Instagram', ph: 'nom du compte' },
    tel:             { l: 'Téléphone' },
    email:           { l: 'E-mail' },
    site:            { l: "Site de l'organisateur", t: 'url', ph: 'https://…' },
    description:     { l: 'Description', t: 'area' },
    poster:          { l: 'Affiche', t: 'file' },
  };

  /* Ce qui manque et mérite un ✕. `vide` reçoit une fonction de lecture. */
  const IMPORTANTS = [
    { champ: 'address' }, { champ: 'horaires' }, { champ: 'tarif' }, { champ: 'age' },
    { champ: 'lienInscription', label: "Lien d'inscription (ou un contact)",
      vide: lit => !lit('lienInscription') && !lit('lienBilletterie') && !lit('tel') && !lit('email') },
    { champ: 'description' },
    { champ: 'poster', seulement: 'event' },   // dans l'aperçu d'un lot, l'affiche a déjà son bouton
  ];

  /* Un doute écrit en clair (ancien format) : on devine les champs concernés. */
  const INDICES = [
    [/tarif|prix|gratuit/i, ['tarif']],
    [/horaire|heure/i, ['horaires']],
    [/adresse|salle|gymnase|lieu/i, ['address']],
    [/dates? exactes?|mois entier/i, ['dateStart', 'dateEnd']],
    [/ann[ée]e|\bdate\b/i, ['dateStart']],
    [/masculin|f[ée]minin|mixte|filles|gar[çc]ons/i, ['sexe']],
    [/\b[âa]ges?\b|cat[ée]gorie/i, ['age']],
    [/lien d['’ ]inscription|lien de candidature|formulaire/i, ['lienInscription']],
  ];
  function deviner(note){
    const champs = [];
    for(const [re, liste] of INDICES){
      if(re.test(note)) for(const c of liste) if(!champs.includes(c)) champs.push(c);
    }
    return champs;
  }

  /* Doutes sous une seule forme : { note, champs[], ok[] }. `ok` = champs déjà
     confirmés par l'admin ; un doute dont tous les champs le sont disparaît. */
  function normaliser(brut){
    const liste = Array.isArray(brut) ? brut : (brut ? [brut] : []);
    const vus = new Set(), out = [];
    for(const d of liste){
      let note, champs, ok = [];
      if(d && typeof d === 'object'){
        note = String(d.note || d.texte || '').replace(/\s+/g, ' ').trim().slice(0, 240);
        const c = Array.isArray(d.champs) ? d.champs : (d.champ ? [d.champ] : null);
        champs = c ? c.map(String).filter(k => CHAMPS[k] && k !== 'poster') : deviner(note);
        ok = Array.isArray(d.ok) ? d.ok.map(String) : [];
      }else{
        note = String(d == null ? '' : d).replace(/\s+/g, ' ').trim().slice(0, 240);
        champs = deviner(note);
      }
      if(!note || vus.has(note)) continue;
      vus.add(note);
      out.push({ note, champs, ok });
      if(out.length >= 8) break;
    }
    return out;
  }

  /* ---------- sources ---------- */
  const sources = {};
  function declarer(nom, source){ sources[nom] = source; }

  const vide = v => Array.isArray(v) ? v.length === 0 : (v == null || String(v).trim() === '');

  /* Les lignes à afficher pour un objet. */
  function elements(nom, o){
    const src = sources[nom];
    const lit = c => src.lire(o, c);
    const doutes = normaliser(src.doutes(o));
    const lignes = [], indices = {};
    for(const d of doutes){
      if(!d.champs.length){ lignes.push({ genre: 'q', note: d.note, champs: [] }); continue; }
      const aConfirmer = d.champs.filter(c => !vide(lit(c)) && !d.ok.includes(c));
      for(const c of d.champs) if(vide(lit(c))) indices[c] = d.note;
      if(aConfirmer.length) lignes.push({ genre: 'q', note: d.note, champs: aConfirmer });
    }
    for(const imp of IMPORTANTS){
      if(imp.seulement && imp.seulement !== nom) continue;
      const manque = imp.vide ? imp.vide(lit) : vide(lit(imp.champ));
      if(manque) lignes.push({ genre: 'x', champ: imp.champ, label: imp.label || CHAMPS[imp.champ].l, note: indices[imp.champ] || '' });
    }
    return lignes;
  }

  function saisieHtml(champ, valeur, note){
    const def = CHAMPS[champ];
    const attrs = `data-vf-champ="${champ}"${note ? ` data-vf-doute="${esc(note)}"` : ''}`;
    if(def.t === 'select'){
      return `<select ${attrs}>${def.o.map(x => `<option${x === valeur ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
    }
    if(def.t === 'ages'){
      const pris = Array.isArray(valeur) ? valeur : [];
      return `<span class="vf-ages" ${attrs}>${AGE_OPTIONS.filter(a => a !== 'Non renseigné').map(a =>
        `<label><input type="checkbox" value="${esc(a)}"${pris.includes(a) ? ' checked' : ''}><span>${esc(a)}</span></label>`).join('')}</span>`;
    }
    if(def.t === 'area'){
      return `<textarea rows="3" ${attrs} placeholder="Quelques lignes pour présenter l'événement">${esc(valeur || '')}</textarea>`;
    }
    if(def.t === 'file'){
      return `<label class="btn btn-ghost btn-xs">Ajouter l'affiche<input type="file" accept="image/*" hidden ${attrs}></label>`;
    }
    const type = def.t === 'date' ? 'date' : (def.t === 'url' ? 'url' : 'text');
    return `<input type="${type}" ${attrs} value="${esc(valeur == null ? '' : valeur)}" placeholder="${esc(def.ph || '')}" autocomplete="off">`;
  }

  function champHtml(src, o, champ, label, note){
    return `<label class="vf-champ${CHAMPS[champ].t === 'area' || CHAMPS[champ].t === 'ages' ? ' is-large' : ''}">
      <span class="vf-label">${esc(label || CHAMPS[champ].l)}</span>${saisieHtml(champ, src.lire(o, champ), note)}</label>`;
  }

  /* Le bloc complet. `id` = ce qui permet à la source de retrouver l'objet. */
  function html(nom, o, id){
    const src = sources[nom];
    if(!src || !o) return '';
    const lignes = elements(nom, o);
    if(!lignes.length) return '';
    const nq = lignes.filter(l => l.genre === 'q').length, nx = lignes.length - nq;
    const resume = [nq ? `<span class="vf-badge is-q">?</span> ${nq} à confirmer` : '', nx ? `<span class="vf-badge is-x">✕</span> ${nx} info${nx > 1 ? 's' : ''} manquante${nx > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
    return `<div class="vf" data-vf-src="${esc(nom)}" data-vf-id="${esc(id)}">
      <div class="vf-titre">À vérifier : ${resume}</div>
      ${lignes.map(l => l.genre === 'q'
        ? `<div class="vf-ligne is-q"><span class="vf-badge is-q" title="Information incertaine">?</span>
            <div class="vf-corps"><div class="vf-note">${esc(l.note)}</div>
              ${l.champs.length ? `<div class="vf-champs">${l.champs.map(c => champHtml(src, o, c, '', l.note)).join('')}</div>` : ''}
            </div>
            <button type="button" class="btn btn-ghost btn-xs vf-ok" data-vf-ok="${esc(l.note)}" title="C'est vérifié : retirer cette ligne">C'est bon</button>
            <span class="vf-etat" role="status"></span></div>`
        : `<div class="vf-ligne is-x"><span class="vf-badge is-x" title="Information manquante">✕</span>
            <div class="vf-corps"><div class="vf-champs">${champHtml(src, o, l.champ, l.label, '')}</div>
              ${l.note ? `<div class="vf-indice">${esc(l.note)}</div>` : ''}
            </div>
            <span class="vf-etat" role="status"></span></div>`).join('')}
    </div>`;
  }

  /* ---------- enregistrement ---------- */
  function contexte(el){
    const bloc = el.closest('.vf');
    if(!bloc) return null;
    const src = sources[bloc.dataset.vfSrc];
    const o = src && src.trouver(bloc.dataset.vfId);
    return (src && o) ? { src, o, bloc, ligne: el.closest('.vf-ligne') } : null;
  }
  function etat(ligne, texte, classe){
    if(!ligne) return;
    const e = ligne.querySelector('.vf-etat');
    if(e) e.textContent = texte;
    ligne.classList.remove('is-fait', 'is-echec', 'is-cours');
    if(classe) ligne.classList.add(classe);
  }

  /* Valeur propre d'un champ, ou une erreur à montrer. */
  function nettoyer(champ, el, o, src){
    const def = CHAMPS[champ];
    if(def.t === 'ages') return { v: Array.from(el.querySelectorAll('input:checked')).map(i => i.value) };
    let v = String(el.value == null ? '' : el.value).trim();
    if(def.t === 'url'){
      if(!v) return { v: '' };
      const propre = lienPropre(v);
      return propre ? { v: propre } : { erreur: 'Lien illisible' };
    }
    if(def.t === 'date'){
      if(!parseDay(v)) return { erreur: 'Date illisible' };
      if(champ === 'dateEnd' && v < src.lire(o, 'dateStart')) return { erreur: 'Avant la date de début' };
      return { v };
    }
    if(champ === 'title' && !v) return { erreur: 'Le titre est obligatoire' };
    if(champ === 'insta') v = v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?].*$/, '');
    if(champ !== 'description') v = v.replace(/\s+/g, ' ');
    return { v: v.slice(0, champ === 'description' ? 3000 : 300) };
  }

  /* Après une saisie : le champ est tenu pour confirmé dans tous les doutes
     qui le citent ; un doute entièrement confirmé est retiré. */
  function doutesApres(src, o, champ, noteRetiree){
    const avant = normaliser(src.doutes(o));
    const apres = [];
    for(const d of avant){
      if(noteRetiree != null && d.note === noteRetiree) continue;
      if(champ && d.champs.includes(champ) && !d.ok.includes(champ)) d.ok.push(champ);
      if(champ === 'dateStart' && d.champs.includes('dateEnd') && !d.ok.includes('dateEnd')) d.ok.push('dateEnd');
      if(d.champs.length && d.champs.every(c => d.ok.includes(c))) continue;
      apres.push(d);
    }
    return apres;
  }

  async function enregistrer(el){
    const ctx = contexte(el);
    if(!ctx) return;
    const { src, o, ligne } = ctx;
    const champ = el.dataset.vfChamp;
    let valeurs;
    if(champ === 'poster'){
      if(!el.files || !el.files[0]) return;
      etat(ligne, 'Envoi de l\'affiche…', 'is-cours');
      try{ valeurs = { poster: await hostPoster(await compressImage(el.files[0], 1200, 0.8)) }; }
      catch(e){ etat(ligne, '⚠️ Affiche illisible', 'is-echec'); return; }
    }else{
      const r = nettoyer(champ, el, o, src);
      if(r.erreur){ etat(ligne, '⚠️ ' + r.erreur, 'is-echec'); return; }
      valeurs = { [champ]: r.v };
      // Une date de début qui dépasse la fin emmène la fin avec elle.
      if(champ === 'dateStart' && src.lire(o, 'dateEnd') < r.v) valeurs.dateEnd = r.v;
    }
    etat(ligne, 'Enregistrement…', 'is-cours');
    try{
      await src.enregistrer(o, valeurs, doutesApres(src, o, champ, null));
      etat(ligne, '✓ Enregistré', 'is-fait');
    }catch(e){
      etat(ligne, '⚠️ Non enregistré, réessaie', 'is-echec');
    }
  }

  async function confirmer(bouton){
    const ctx = contexte(bouton);
    if(!ctx) return;
    const { src, o, ligne } = ctx;
    bouton.disabled = true;
    try{
      await src.enregistrer(o, {}, doutesApres(src, o, null, bouton.dataset.vfOk));
      ligne.remove();
      if(!ctx.bloc.querySelector('.vf-ligne')) ctx.bloc.remove();
    }catch(e){
      bouton.disabled = false;
      etat(ligne, '⚠️ Non enregistré, réessaie', 'is-echec');
    }
  }

  document.addEventListener('change', e => {
    const t = e.target;
    if(!t || !t.closest) return;
    const el = t.dataset && t.dataset.vfChamp ? t : t.closest('.vf-ages[data-vf-champ]');
    if(el && el.closest('.vf')) enregistrer(el);
  });
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('[data-vf-ok]');
    if(b) confirmer(b);
  });
  // Entrée valide la saisie d'une ligne (sauf dans la description).
  document.addEventListener('keydown', e => {
    if(e.key === 'Enter' && e.target && e.target.matches && e.target.matches('.vf input[data-vf-champ]')){ e.preventDefault(); e.target.blur(); }
  });

  /* ---------- source « event » : les fiches de l'administration ---------- */
  const DANS_INFOS = { address: 'adresse', horaires: 'horaires', reservation: 'reservation' };
  const DANS_ORG = { orgName: 'name', insta: 'insta', tel: 'tel', email: 'email', site: 'site' };
  declarer('event', {
    trouver: id => (typeof adminList !== 'undefined' ? adminList : []).find(e => e.id === id) || null,
    lire(ev, c){
      if(DANS_INFOS[c]) return (ev.infos && ev.infos[DANS_INFOS[c]]) || '';
      if(DANS_ORG[c]) return (ev.org && ev.org[DANS_ORG[c]]) || '';
      return ev[c];
    },
    doutes: ev => (ev.importe && ev.importe.doutes) || [],
    async enregistrer(ev, valeurs, doutes){
      const patch = {};
      for(const [c, v] of Object.entries(valeurs)){
        if(DANS_INFOS[c]){
          patch.infos = Object.assign({}, ev.infos, patch.infos, { [DANS_INFOS[c]]: v });
          if(c === 'address') patch.lieu = v || ev.city || '';
        }else if(DANS_ORG[c]){
          patch.org = Object.assign({}, ev.org, patch.org, { [DANS_ORG[c]]: v });
        }else patch[c] = v;
      }
      const avant = normaliser(this.doutes(ev));
      if(JSON.stringify(avant) !== JSON.stringify(doutes) || (ev.importe && (ev.importe.doutes || []).some(d => typeof d === 'string'))){
        patch.importe = Object.assign({}, ev.importe, { doutes });
      }
      if(!Object.keys(patch).length) return;
      await window.EBOK_DATA.updateEvent(ev.id, patch);
      Object.assign(ev, patch);
      const local = (typeof events !== 'undefined' ? events : []).find(x => x.id === ev.id);
      if(local) Object.assign(local, patch);
    },
  });

  window.EbokVerif = { html, declarer, normaliser, CHAMPS };
})();
