/* =========================================================
   EBOK — INSCRIPTIONS PRISES SUR EBOK
   ---------------------------------------------------------
   - Fiche événement : bouton « S'inscrire » → fenêtre d'inscription
     (questions de l'organisateur, liste d'attente, annulation).
   - Page « Mes inscriptions » du participant.
   - Page « Gérer les inscriptions » de l'organisateur : réglages, liste des
     inscrits, export Excel, e-mail groupé.
   Chargé après app.js, dont il réutilise les aides (esc, ico, showPage,
   openAuth, openEvent, fmtDateRange…). Serveur : lib/inscriptions-route.js.
   Les droits sont vérifiés côté serveur ; ici, ce n'est que de l'affichage.
   ========================================================= */
(function(){
  'use strict';

  const MESSAGES = {
    auth: 'Connecte-toi pour continuer.',
    ferme: 'Les inscriptions sont fermées.',
    deja_inscrit: 'Tu es déjà inscrit à cet événement.',
    reponse_manquante: 'Réponds aux questions obligatoires.',
    choix_invalide: 'Une réponse ne fait pas partie des choix proposés.',
    quota: "Tu as atteint la limite de 3 e-mails par jour pour cet événement. Réessaie demain.",
    email_indisponible: "L'envoi d'e-mails n'est pas encore activé sur EBOK.",
    aucun_destinataire: 'Personne dans ce groupe pour le moment.',
    envoi_echoue: "L'envoi a échoué. Réessaie dans quelques minutes.",
    message_vide: "Indique un objet et un message.",
    prive: "Tu n'as pas accès à ces inscriptions.",
  };
  const RAISONS = {
    inactif: "L'organisateur ne prend pas les inscriptions sur EBOK.",
    non_publie: "Les inscriptions ouvriront dès que l'événement sera validé.",
    termine: 'Cet événement est terminé.',
    date_limite: 'La date limite d\'inscription est passée.',
  };
  const msg = (err)=> MESSAGES[err && err.code] || "Une erreur est survenue. Réessaie dans un instant.";
  const data = ()=> window.EBOK_DATA;
  const fmtJour = (d)=> d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'long' }) : '';
  const fmtQuand = (t)=> new Date(t).toLocaleString('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });

  async function pret(){
    if(data()) return true;
    if(typeof attendreDonnees === 'function') await attendreDonnees(6000);
    return Boolean(data());
  }

  /* ---------------------------------------------------------
     FICHE ÉVÉNEMENT
     --------------------------------------------------------- */
  let ficheEv = null;
  let ficheEtat = null;

  function jaugeTexte(e){
    if(!e) return '';
    if(!e.places) return e.confirmes ? `${e.confirmes} inscrit${e.confirmes > 1 ? 's' : ''}` : '';
    const reste = Math.max(0, e.places - e.confirmes);
    let t = reste ? `${reste} place${reste > 1 ? 's' : ''} restante${reste > 1 ? 's' : ''} sur ${e.places}` : `Complet (${e.places} places)`;
    if(e.attente) t += ` · ${e.attente} en liste d'attente`;
    if(e.dateLimite && e.ouvert) t += ` · jusqu'au ${fmtJour(e.dateLimite)}`;
    return t;
  }

  function majBoutonFiche(){
    const btn = document.getElementById('btnInscrire');
    const jauge = document.getElementById('evInsJauge');
    if(!btn || !ficheEtat) return;
    const e = ficheEtat;
    const label = btn.querySelector('span');
    btn.classList.remove('is-inscrit', 'is-attente');
    if(e.moi && e.moi.statut === 'confirme'){ label.textContent = 'Inscrit ✓'; btn.classList.add('is-inscrit'); }
    else if(e.moi){ label.textContent = `Liste d'attente · n°${e.moi.rang}`; btn.classList.add('is-attente'); }
    else if(!e.ouvert) label.textContent = 'Inscriptions fermées';
    else if(e.complet) label.textContent = "Liste d'attente";
    else label.textContent = "S'inscrire";
    if(jauge) jauge.textContent = !e.ouvert && !e.moi ? (RAISONS[e.raison] || '') : jaugeTexte(e);
  }

  async function chargerEtat(ev){
    if(!(await pret())) return null;
    try{ return await data().getInscription(ev.id); }
    catch(err){ return null; }
  }

  async function brancherFiche(ev){
    ficheEv = ev;
    ficheEtat = null;
    const btn = document.getElementById('btnInscrire');
    if(!btn) return;
    btn.addEventListener('click', ()=> ouvrirModale(ev, btn));
    const etat = await chargerEtat(ev);
    if(ficheEv !== ev) return; // une autre fiche a été ouverte entre-temps
    ficheEtat = etat;
    majBoutonFiche();
  }

  /* ---------------------------------------------------------
     FENÊTRE D'INSCRIPTION
     --------------------------------------------------------- */
  let modaleOpener = null;

  function questionHtml(q){
    const oblig = q.obligatoire ? ' <span class="ins-oblig" aria-hidden="true">*</span>' : ' <span class="wz-opt">(facultatif)</span>';
    const req = q.obligatoire ? 'required aria-required="true"' : '';
    const id = 'insq-' + q.id;
    if(q.type === 'ouinon'){
      return `<fieldset class="field" style="border:0;padding:0;margin:0 0 14px;min-width:0">
        <legend style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--chalk-dim);margin-bottom:8px;padding:0">${esc(q.libelle)}${oblig}</legend>
        <div class="ins-oui-non">
          <label><input type="radio" name="${esc(q.id)}" value="oui" ${req}> Oui</label>
          <label><input type="radio" name="${esc(q.id)}" value="non"> Non</label>
        </div></fieldset>`;
    }
    if(q.type === 'choix'){
      return `<div class="field"><label for="${id}">${esc(q.libelle)}${oblig}</label>
        <select id="${id}" name="${esc(q.id)}" ${req}><option value="">— Choisir</option>
        ${q.options.map(o=> `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></div>`;
    }
    return `<div class="field"><label for="${id}">${esc(q.libelle)}${oblig}</label>
      <input type="text" id="${id}" name="${esc(q.id)}" maxlength="500" ${req}></div>`;
  }

  function reponsesHtml(questions, reponses){
    const l = (questions || []).filter(q=> reponses && reponses[q.id]);
    if(!l.length) return '';
    return `<ul class="ins-reponses">${l.map(q=> `<li><b>${esc(q.libelle)} :</b> ${esc(reponses[q.id])}</li>`).join('')}</ul>`;
  }

  function rendreModale(ev, e){
    document.getElementById('insEvent').textContent = [ev.title, typeof fmtDateRange === 'function' ? fmtDateRange(ev.dateStart, ev.dateEnd) : ''].filter(Boolean).join(' · ');
    document.getElementById('insPlaces').innerHTML = esc(jaugeTexte(e));
    const corps = document.getElementById('insCorps');
    const titre = document.getElementById('insTitre');

    if(e.moi){
      const ok = e.moi.statut === 'confirme';
      titre.textContent = ok ? 'Tu es inscrit' : "Tu es sur liste d'attente";
      corps.innerHTML = `
        <div class="ins-statut ${ok ? 'is-ok' : 'is-wait'}">
          <strong>${ok ? 'Ta place est réservée ✓' : `N°${esc(e.moi.rang)} sur la liste d'attente`}</strong>
          ${ok ? "Un e-mail de confirmation t'a été envoyé. Tu ne peux plus venir ? Annule pour laisser ta place au suivant."
               : "Si une place se libère, elle te revient automatiquement et tu es prévenu par e-mail."}
          ${reponsesHtml(e.questions, e.moi.reponses)}
        </div>
        <p class="report-error hidden" id="insErreur" role="alert"></p>
        <div class="report-actions">
          <button type="button" class="btn btn-ghost" id="insAnnuler">${ok ? 'Annuler mon inscription' : 'Quitter la liste d\'attente'}</button>
          <button type="button" class="btn btn-primary" data-ins-fermer>Fermer</button>
        </div>`;
      document.getElementById('insAnnuler').addEventListener('click', ()=> annuler(ev));
      return;
    }

    if(!e.ouvert){
      titre.textContent = 'Inscriptions fermées';
      corps.innerHTML = `<p>${esc(RAISONS[e.raison] || 'Les inscriptions ne sont pas ouvertes.')}</p>
        <div class="report-actions"><button type="button" class="btn btn-primary" data-ins-fermer>Fermer</button></div>`;
      return;
    }

    titre.textContent = e.complet ? "Rejoindre la liste d'attente" : "S'inscrire";
    corps.innerHTML = `
      <form class="ins-form" id="insForm" novalidate>
        ${e.complet ? `<p class="section-hint" style="margin:0 0 14px">C'est complet : tu seras placé en liste d'attente et prévenu par e-mail si une place se libère.</p>` : ''}
        ${(e.questions || []).map(questionHtml).join('')}
        <p class="ins-legal">En t'inscrivant, ton nom, ton adresse e-mail et tes réponses sont transmis à l'organisateur, qui peut t'écrire au sujet de cet événement. <a href="/confidentialite" target="_blank" rel="noopener">Confidentialité</a></p>
        <p class="report-error hidden" id="insErreur" role="alert"></p>
        <div class="report-actions">
          <button type="button" class="btn btn-ghost" data-ins-fermer>Annuler</button>
          <button type="submit" class="btn btn-primary" id="insEnvoyer">${e.complet ? "Rejoindre la liste d'attente" : 'Confirmer mon inscription'}</button>
        </div>
      </form>`;
    document.getElementById('insForm').addEventListener('submit', (evt)=>{ evt.preventDefault(); soumettre(ev, e); });
  }

  function erreur(id, texte){
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = texte || '';
    el.classList.toggle('hidden', !texte);
  }

  async function soumettre(ev, e){
    const form = document.getElementById('insForm');
    const reponses = {};
    for(const q of e.questions || []){
      const champ = form.elements[q.id];
      if(!champ) continue;
      reponses[q.id] = q.type === 'ouinon'
        ? ((form.querySelector(`input[name="${CSS.escape(q.id)}"]:checked`) || {}).value || '')
        : champ.value.trim();
    }
    const manque = (e.questions || []).find(q=> q.obligatoire && !reponses[q.id]);
    if(manque){
      erreur('insErreur', `Réponds à la question « ${manque.libelle} ».`);
      const champ = form.querySelector(`[name="${CSS.escape(manque.id)}"]`);
      if(champ) champ.focus();
      return;
    }
    const btn = document.getElementById('insEnvoyer');
    btn.disabled = true;
    erreur('insErreur', '');
    try{
      await data().inscrire(ev.id, reponses);
      ficheEtat = await chargerEtat(ev);
      if(ficheEtat){ majBoutonFiche(); rendreModale(ev, ficheEtat); }
    }catch(err){
      erreur('insErreur', err.code === 'ferme' ? (RAISONS[(err.raison)] || MESSAGES.ferme) : msg(err));
      btn.disabled = false;
    }
  }

  async function annuler(ev){
    if(!confirm('Annuler ton inscription ? Ta place sera donnée à quelqu\'un d\'autre.')) return;
    const btn = document.getElementById('insAnnuler');
    if(btn) btn.disabled = true;
    try{
      await data().annulerInscription(ev.id);
      ficheEtat = await chargerEtat(ev);
      if(ficheEtat){ majBoutonFiche(); rendreModale(ev, ficheEtat); }
    }catch(err){
      erreur('insErreur', msg(err));
      if(btn) btn.disabled = false;
    }
  }

  async function ouvrirModale(ev, opener){
    if(!currentUser){
      if(typeof openAuth === 'function') openAuth('login');
      return;
    }
    const modal = document.getElementById('insModal');
    modaleOpener = opener || null;
    document.getElementById('insTitre').textContent = "S'inscrire";
    document.getElementById('insCorps').innerHTML = '<p>Chargement…</p>';
    document.getElementById('insPlaces').textContent = '';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    // L'état a pu changer depuis l'ouverture de la fiche : on le relit.
    const etat = await chargerEtat(ev);
    if(!etat){
      document.getElementById('insCorps').innerHTML = `<p>Impossible de charger les inscriptions. Réessaie dans un instant.</p>`;
      return;
    }
    ficheEtat = etat;
    majBoutonFiche();
    rendreModale(ev, etat);
    const premier = modal.querySelector('#insCorps input, #insCorps select, #insCorps button');
    if(premier) premier.focus();
  }

  function fermerModale(){
    const modal = document.getElementById('insModal');
    if(!modal.classList.contains('open')) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if(modaleOpener && document.contains(modaleOpener)) modaleOpener.focus();
    modaleOpener = null;
  }

  function initModale(){
    const modal = document.getElementById('insModal');
    if(!modal) return;
    document.getElementById('insFermer').addEventListener('click', fermerModale);
    modal.addEventListener('click', (e)=>{ if(e.target.closest('[data-ins-fermer]')) fermerModale(); });
    if(typeof bindBackdropClose === 'function') bindBackdropClose(modal, fermerModale);
    modal.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape'){ fermerModale(); return; }
      if(e.key !== 'Tab') return;
      const f = Array.from(modal.querySelectorAll('input, select, textarea, button, a[href]')).filter(x=> !x.disabled && x.offsetParent !== null);
      if(!f.length) return;
      const premier = f[0], dernier = f[f.length - 1];
      if(e.shiftKey && document.activeElement === premier){ e.preventDefault(); dernier.focus(); }
      else if(!e.shiftKey && document.activeElement === dernier){ e.preventDefault(); premier.focus(); }
    });
  }

  /* ---------------------------------------------------------
     MES INSCRIPTIONS (participant)
     --------------------------------------------------------- */
  async function ouvrirMesInscriptions(){
    const box = document.getElementById('mesInscriptions');
    if(!box) return;
    box.innerHTML = `<div class="empty-state"><p>Chargement…</p></div>`;
    if(!(await pret())){ box.innerHTML = `<div class="empty-state"><p>Disponible une fois la base connectée.</p></div>`; return; }
    let liste;
    try{ liste = await data().getMesInscriptions(); }
    catch(err){ box.innerHTML = `<div class="empty-state"><h4>Erreur</h4><p>${esc(msg(err))}</p></div>`; return; }
    if(!liste.length){
      box.innerHTML = `<div class="empty-state"><h4>Aucune inscription</h4><p>Quand un organisateur prend les inscriptions sur EBOK, le bouton « S'inscrire » de sa fiche t'inscrit en un clic.</p><button class="btn btn-primary" data-nav-ins="search">Trouver un événement</button></div>`;
      box.querySelector('[data-nav-ins]').addEventListener('click', ()=> showPage('search'));
      return;
    }
    box.innerHTML = liste.map(i=>{
      const ev = i.event || {};
      const fini = typeof isPast === 'function' && ev.dateEnd ? isPast(ev) : false;
      const pastille = i.statut === 'confirme'
        ? `<span class="ins-pastille">Inscrit</span>`
        : `<span class="ins-pastille is-wait">Liste d'attente · n°${esc(i.rang)}</span>`;
      return `<div class="alert-card">
        <div class="alert-main">
          <strong>${esc(ev.title || 'Événement')} ${pastille}</strong>
          <span class="ins-mes-date">${esc([typeof fmtDateRange === 'function' ? fmtDateRange(ev.dateStart, ev.dateEnd) : ev.dateStart, ev.city].filter(Boolean).join(' · '))}${fini ? ' · terminé' : ''}</span>
        </div>
        <div class="alert-actions">
          <button class="btn btn-ghost" data-voir="${esc(i.eventId)}">Voir</button>
          ${fini ? '' : `<button class="btn btn-ghost alert-del" data-annuler="${esc(i.eventId)}">Annuler</button>`}
        </div>
      </div>`;
    }).join('');
    box.querySelectorAll('[data-voir]').forEach(b=> b.addEventListener('click', ()=> openEvent(b.dataset.voir)));
    box.querySelectorAll('[data-annuler]').forEach(b=> b.addEventListener('click', async ()=>{
      if(!confirm('Annuler cette inscription ? Ta place sera donnée à quelqu\'un d\'autre.')) return;
      b.disabled = true;
      try{ await data().annulerInscription(b.dataset.annuler); ouvrirMesInscriptions(); }
      catch(err){ alert(msg(err)); b.disabled = false; }
    }));
  }

  /* ---------------------------------------------------------
     GÉRER LES INSCRIPTIONS (organisateur)
     --------------------------------------------------------- */
  let ges = { id: null, ev: null, donnees: null, filtre: 'tous', questions: [] };

  const TYPES = [['texte', 'Réponse libre'], ['choix', 'Liste de choix'], ['ouinon', 'Oui / Non']];

  function questionEditeur(q, i){
    return `<div class="ins-q" data-q="${i}">
      <div class="ins-q-ligne">
        <input type="text" data-champ="libelle" maxlength="120" placeholder="Ex. Taille de maillot" value="${esc(q.libelle)}" aria-label="Question ${i + 1}">
        <select data-champ="type" aria-label="Type de réponse">${TYPES.map(([v, l])=> `<option value="${v}" ${q.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      ${q.type === 'choix' ? `<input type="text" data-champ="options" maxlength="600" placeholder="Choix séparés par des virgules : S, M, L, XL" value="${esc((q.options || []).join(', '))}" aria-label="Choix proposés">` : ''}
      <div class="ins-q-bas">
        <label><input type="checkbox" data-champ="obligatoire" ${q.obligatoire ? 'checked' : ''}> Réponse obligatoire</label>
        <button type="button" class="ins-q-suppr" data-suppr="${i}">Supprimer</button>
      </div>
    </div>`;
  }

  function lireQuestions(){
    return Array.from(document.querySelectorAll('#gesQuestions .ins-q')).map((el, i)=>{
      const v = (c)=> el.querySelector(`[data-champ="${c}"]`);
      const type = v('type').value;
      return {
        id: (ges.questions[i] && ges.questions[i].id) || '',
        libelle: v('libelle').value.trim(),
        type,
        options: type === 'choix' && v('options') ? v('options').value.split(',').map(s=> s.trim()).filter(Boolean) : [],
        obligatoire: v('obligatoire').checked,
      };
    });
  }

  function rendreQuestions(){
    const box = document.getElementById('gesQuestions');
    box.innerHTML = ges.questions.length
      ? ges.questions.map(questionEditeur).join('')
      : `<p class="section-hint" style="margin:0 0 10px">Aucune question : le participant s'inscrit en un clic (son nom et son e-mail viennent de son compte).</p>`;
    document.getElementById('gesAjoutQ').disabled = ges.questions.length >= 10;
  }

  function rendreStats(){
    const d = ges.donnees;
    const confirmes = d.inscrits.filter(i=> i.statut === 'confirme').length;
    const attente = d.inscrits.length - confirmes;
    const st = (l, v, sous)=> `<div class="ins-stat"><span>${l}</span><b>${esc(v)}</b>${sous ? `<small>${esc(sous)}</small>` : ''}</div>`;
    const ouverture = d.config.actif
      ? (d.ouverture.ouvert ? 'Ouvertes' : 'Fermées')
      : 'Désactivées';
    document.getElementById('gesStats').innerHTML = [
      st('Confirmés', d.places ? `${confirmes} / ${d.places}` : confirmes, d.places ? `${Math.max(0, d.places - confirmes)} place(s) restante(s)` : 'Places illimitées'),
      st("Liste d'attente", attente),
      st('Inscriptions', ouverture, d.config.actif && !d.ouverture.ouvert ? (RAISONS[d.ouverture.raison] || '') : (d.config.dateLimite ? `Jusqu'au ${fmtJour(d.config.dateLimite)}` : '')),
    ].join('');
  }

  function rendreListe(){
    const d = ges.donnees;
    const box = document.getElementById('gesListe');
    const l = d.inscrits.filter(i=> ges.filtre === 'tous' || i.statut === ges.filtre);
    document.getElementById('gesExport').disabled = !d.inscrits.length;
    if(!l.length){
      box.innerHTML = `<div class="empty-state"><p>${d.inscrits.length ? 'Personne dans ce groupe.' : 'Aucun inscrit pour le moment.'}</p></div>`;
      return;
    }
    const questions = d.config.questions || [];
    box.innerHTML = l.map(i=> `<div class="ins-ligne">
      <div class="ins-ligne-id">
        <strong>${esc(i.nom || 'Membre sans nom')}${i.statut === 'confirme' ? '<span class="ins-pastille">Confirmé</span>' : `<span class="ins-pastille is-wait">Attente · n°${esc(i.rang)}</span>`}</strong>
        ${i.email ? `<a href="mailto:${encodeURIComponent(i.email)}">${esc(i.email)}</a>` : ''}
        <span> · inscrit le ${esc(fmtQuand(i.inscritLe))}</span>
        ${reponsesHtml(questions, i.reponses)}
      </div>
      <button class="btn btn-ghost alert-del" data-retirer="${esc(i.id)}" data-nom="${esc(i.nom || 'ce membre')}">Retirer</button>
    </div>`).join('');
    box.querySelectorAll('[data-retirer]').forEach(b=> b.addEventListener('click', async ()=>{
      if(!confirm(`Retirer ${b.dataset.nom} des inscrits ? Il sera prévenu par e-mail et sa place ira au premier de la liste d'attente.`)) return;
      b.disabled = true;
      try{ await data().retirerInscrit(ges.id, b.dataset.retirer); await chargerGestion(); }
      catch(err){ alert(msg(err)); b.disabled = false; }
    }));
  }

  function rendreEnvois(){
    const d = ges.donnees;
    const q = document.getElementById('gesQuota');
    q.textContent = d.envoisRestants == null ? '' : `Encore ${d.envoisRestants} envoi${d.envoisRestants > 1 ? 's' : ''} possible${d.envoisRestants > 1 ? 's' : ''} sur les dernières 24 h.`;
    document.getElementById('gesEnvoyer').disabled = d.envoisRestants === 0 || !d.inscrits.length;
    const seg = { tous: 'tous', confirmes: 'confirmés', attente: "liste d'attente" };
    document.getElementById('gesEnvois').innerHTML = d.envois.length
      ? `<p><strong>Derniers envois</strong></p><ul>${d.envois.map(e=> `<li>${esc(fmtQuand(e.created_at))} — « ${esc(e.sujet)} » → ${esc(seg[e.segment] || e.segment)} (${esc(e.nb)} e-mail${e.nb > 1 ? 's' : ''})</li>`).join('')}</ul>`
      : '';
  }

  function remplirReglages(){
    const d = ges.donnees;
    document.getElementById('gesActif').checked = Boolean(d.config.actif);
    document.getElementById('gesPlaces').value = d.places || '';
    document.getElementById('gesLimite').value = d.config.dateLimite || '';
    ges.questions = (d.config.questions || []).map(q=> ({ ...q }));
    rendreQuestions();
  }

  async function chargerGestion(){
    try{
      ges.donnees = await data().getGestionInscriptions(ges.id);
    }catch(err){
      document.getElementById('gesStats').innerHTML = `<div class="empty-state"><h4>Erreur</h4><p>${esc(msg(err))}</p></div>`;
      return false;
    }
    rendreStats();
    rendreListe();
    rendreEnvois();
    return true;
  }

  async function ouvrirGestion(id){
    if(!currentUser){ if(typeof openAuth === 'function') openAuth('login'); return; }
    showPage('gestion-ins');
    ges = { id, ev: null, donnees: null, filtre: 'tous', questions: [] };
    document.getElementById('gesTitre').textContent = 'Gérer les inscriptions';
    document.getElementById('gesSous').textContent = '';
    document.getElementById('gesStats').innerHTML = `<div class="empty-state"><p>Chargement…</p></div>`;
    document.getElementById('gesListe').innerHTML = '';
    document.querySelectorAll('#gesFiltres .ins-chip').forEach(c=> c.classList.toggle('active', c.dataset.filtre === 'tous'));
    if(!(await pret())) return;
    ges.ev = (typeof events !== 'undefined' && events.find(e=> e.id === id)) || await data().getEvent(id);
    if(ges.ev){
      document.getElementById('gesTitre').textContent = ges.ev.title;
      document.getElementById('gesSous').textContent = [typeof fmtDateRange === 'function' ? fmtDateRange(ges.ev.dateStart, ges.ev.dateEnd) : '', ges.ev.city, ges.ev.status !== 'approved' ? 'en attente de validation' : ''].filter(Boolean).join(' · ');
    }
    if(await chargerGestion()) remplirReglages();
  }

  async function enregistrerReglages(e){
    e.preventDefault();
    erreur('gesErreur', '');
    const questions = lireQuestions();
    const vide = questions.findIndex(q=> !q.libelle);
    if(vide >= 0){ erreur('gesErreur', `La question n°${vide + 1} est vide : écris-la ou supprime-la.`); return; }
    const sansChoix = questions.findIndex(q=> q.type === 'choix' && !q.options.length);
    if(sansChoix >= 0){ erreur('gesErreur', `Indique les choix de la question n°${sansChoix + 1}, séparés par des virgules.`); return; }
    const placesRaw = document.getElementById('gesPlaces').value.trim();
    const places = placesRaw ? parseInt(placesRaw, 10) : null;
    if(placesRaw && !(places > 0)){ erreur('gesErreur', 'Le nombre de places doit être un nombre positif.'); return; }
    const config = {
      actif: document.getElementById('gesActif').checked,
      dateLimite: document.getElementById('gesLimite').value || '',
      questions,
    };
    const btn = document.getElementById('gesEnregistrer');
    btn.disabled = true;
    try{
      await data().updateEvent(ges.id, { inscriptions: config, placesTotal: places });
      // La fiche en mémoire suit, pour que le bouton de la fiche change tout de suite.
      const frais = await data().getEvent(ges.id);
      if(frais && typeof events !== 'undefined'){
        const i = events.findIndex(x=> x.id === ges.id);
        if(i >= 0) events[i] = frais;
        ges.ev = frais;
      }
      await chargerGestion();
      remplirReglages();
      const ok = document.getElementById('gesOk');
      ok.classList.remove('hidden');
      setTimeout(()=> ok.classList.add('hidden'), 2500);
      if(config.actif && ges.ev && ges.ev.status !== 'approved'){
        erreur('gesErreur', "C'est enregistré. Les inscriptions ouvriront dès que l'événement sera validé.");
      }
    }catch(err){
      erreur('gesErreur', msg(err));
    }finally{
      btn.disabled = false;
    }
  }

  async function exporter(){
    const btn = document.getElementById('gesExport');
    btn.disabled = true;
    try{
      const { blob, nom } = await data().exporterInscrits(ges.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nom;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=> URL.revokeObjectURL(url), 2000);
    }catch(err){
      alert("L'export a échoué. Réessaie dans un instant.");
    }finally{
      btn.disabled = false;
    }
  }

  async function envoyerMessage(e){
    e.preventDefault();
    erreur('gesMsgErreur', '');
    const segment = document.getElementById('gesSegment').value;
    const sujet = document.getElementById('gesSujet').value.trim();
    const corps = document.getElementById('gesCorps').value.trim();
    if(!sujet || !corps){ erreur('gesMsgErreur', MESSAGES.message_vide); return; }
    const d = ges.donnees;
    const nb = d.inscrits.filter(i=> segment === 'tous' || (segment === 'confirmes' ? i.statut === 'confirme' : i.statut === 'attente')).length;
    if(!nb){ erreur('gesMsgErreur', MESSAGES.aucun_destinataire); return; }
    if(!confirm(`Envoyer ce message à ${nb} personne${nb > 1 ? 's' : ''} ?`)) return;
    const btn = document.getElementById('gesEnvoyer');
    btn.disabled = true;
    try{
      const r = await data().envoyerMessageInscrits(ges.id, { segment, sujet, corps });
      document.getElementById('gesSujet').value = '';
      document.getElementById('gesCorps').value = '';
      const ok = document.getElementById('gesMsgOk');
      ok.textContent = `Envoyé à ${r.envoyes} personne${r.envoyes > 1 ? 's' : ''} ✓`;
      ok.classList.remove('hidden');
      setTimeout(()=> ok.classList.add('hidden'), 4000);
      await chargerGestion();
    }catch(err){
      erreur('gesMsgErreur', msg(err));
      btn.disabled = false;
    }
  }

  function initGestion(){
    const form = document.getElementById('gesForm');
    if(!form) return;
    form.addEventListener('submit', enregistrerReglages);
    document.getElementById('gesAjoutQ').addEventListener('click', ()=>{
      ges.questions = lireQuestions();
      if(ges.questions.length >= 10) return;
      ges.questions.push({ id: '', libelle: '', type: 'texte', options: [], obligatoire: false });
      rendreQuestions();
      const champs = document.querySelectorAll('#gesQuestions [data-champ="libelle"]');
      if(champs.length) champs[champs.length - 1].focus();
    });
    document.getElementById('gesQuestions').addEventListener('click', (e)=>{
      const b = e.target.closest('[data-suppr]');
      if(!b) return;
      ges.questions = lireQuestions();
      ges.questions.splice(parseInt(b.dataset.suppr, 10), 1);
      rendreQuestions();
    });
    // Changer le type d'une question fait apparaître (ou disparaître) les choix.
    document.getElementById('gesQuestions').addEventListener('change', (e)=>{
      if(e.target.dataset.champ !== 'type') return;
      ges.questions = lireQuestions();
      rendreQuestions();
    });
    document.getElementById('gesFiltres').addEventListener('click', (e)=>{
      const c = e.target.closest('[data-filtre]');
      if(!c || !ges.donnees) return;
      ges.filtre = c.dataset.filtre;
      document.querySelectorAll('#gesFiltres .ins-chip').forEach(x=> x.classList.toggle('active', x === c));
      rendreListe();
    });
    document.getElementById('gesExport').addEventListener('click', exporter);
    document.getElementById('gesMsgForm').addEventListener('submit', envoyerMessage);
  }

  initModale();
  initGestion();

  window.EBOK_INS = { brancherFiche, ouvrirMesInscriptions, ouvrirGestion };
})();
