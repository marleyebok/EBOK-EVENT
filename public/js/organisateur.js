/* =========================================================
   EBOK — MES ÉVÉNEMENTS & OUTILS D'ORGANISATEUR (V1)
   ---------------------------------------------------------
   - Menu « Mon compte » de la barre du haut.
   - Page « Mes événements » : Favoris, Alertes, Mes inscriptions, J'organise.
   - Tableau de bord d'un événement : inscrits (validation, catégories,
     commentaire privé, documents), messages groupés, réglages des
     inscriptions, co-organisateurs, export CSV.
   - Inscription depuis la fiche d'un événement.
   - Question « gérer ton événement avec les outils EBOK ? » après publication.

   Script classique chargé après app.js : il en réutilise les fonctions
   (esc, ico, showPage, openEvent, openAuth, tableauDeMarque…). Les appels
   serveur passent par window.EBOK_DATA (js/services.js → /api/events?r=insc).
   Les droits sont toujours revérifiés par le serveur.
   ========================================================= */

const D = ()=> window.EBOK_DATA || {};
const STATUT_INSC = {
  en_attente:    { label: 'En attente',       cls: 'st-wait' },
  validee:       { label: 'Validée',          cls: 'st-ok' },
  liste_attente: { label: "Liste d'attente",  cls: 'st-list' },
  refusee:       { label: 'Refusée',          cls: 'st-no' },
  annulee:       { label: 'Annulée',          cls: 'st-off' },
};
const STATUTS_ORDRE = ['en_attente', 'validee', 'liste_attente', 'refusee', 'annulee'];
const DOC_STATUT = { depose: 'Déposé, à vérifier', valide: 'Validé', a_refaire: 'À refaire' };
const ICO_OUTILS = '<svg class="ico ico-outils" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 18H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M7 7V5.5A1.5 1.5 0 0 1 8.5 4h3A1.5 1.5 0 0 1 13 5.5V7"/><path d="M2 11.5h16"/><path d="M8.5 11.5v2h3v-2"/><path class="cle" d="M21.6 14.1a2.6 2.6 0 0 1-3.4 3.4l-3.1 3.1a1 1 0 0 1-1.4-1.4l3.1-3.1a2.6 2.6 0 0 1 3.4-3.4l-1.5 1.5.7.7.7.7z"/></svg>';

const pastille = statut=>{
  const s = STATUT_INSC[statut] || STATUT_INSC.en_attente;
  return `<span class="st-pill ${s.cls}"><i></i>${s.label}</span>`;
};
const dateCourteFr = d=>{ const x = new Date(d); return isNaN(x) ? '' : x.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); };
const chargement = txt=> `<div class="orga-load">${esc(txt || 'Chargement…')}</div>`;
function messageErreur(e){
  const c = (e && (e.code || e.message)) || '';
  if(c === 'auth') return 'Ta session a expiré : reconnecte-toi.';
  if(c === 'prive' || c === 'proprietaire') return "Tu n'as pas les droits pour cette action.";
  if(c === 'fermees') return "Les inscriptions ne sont pas ouvertes pour cet événement.";
  if(c === 'deja_inscrit') return 'Tu as déjà une demande pour cet événement : retrouve-la dans Mes événements.';
  if(c === 'aucun_destinataire') return 'Aucun inscrit ne correspond à ces critères.';
  if(c === 'reponse_manquante') return e.question ? `Réponds à la question « ${e.question} ».` : 'Une réponse obligatoire manque.';
  if(c === 'consentement') return 'Coche la case d\'accord pour transmettre tes réponses sur les allergies et le régime, ou laisse ces questions vides.';
  if(c === 'equipe_incomplete') return `Ton équipe doit compter au moins ${e.min || 1} joueurs.`;
  if(c === 'nom_equipe') return 'Donne un nom à ton équipe.';
  if(c === 'tarif') return 'Choisis un tarif.';
  if(c === 'trop_lourd') return 'Fichier trop lourd (8 Mo au maximum).';
  if(c === 'type_non_supporte') return 'Format non accepté : envoie une image ou un PDF.';
  if(/^stockage/.test(c)) return "Le dépôt de fichiers n'est pas disponible pour le moment.";
  return 'Action impossible pour le moment. Réessaie dans un instant.';
}
function videConnexion(box, titre, texte){
  box.innerHTML = `<div class="empty-state"><h4>${esc(titre)}</h4><p>${esc(texte)}</p>
    <div class="empty-actions"><button class="btn btn-primary" data-auth-orga="signup">Créer un compte</button><button class="btn btn-ghost" data-auth-orga="login">Se connecter</button></div></div>`;
  box.querySelectorAll('[data-auth-orga]').forEach(b=> b.addEventListener('click', ()=> openAuth(b.dataset.authOrga)));
}
function ouvrirModale(id){ const m = document.getElementById(id); if(!m) return; m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); }
function fermerModale(id){ const m = document.getElementById(id); if(!m) return; m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); }

/* =========================================================
   MENU « MON COMPTE »
   ========================================================= */
function fermerMenuCompte(){
  const m = document.getElementById('acctMenu'), b = document.getElementById('acctBtn');
  if(m) m.hidden = true;
  if(b) b.setAttribute('aria-expanded', 'false');
}
(function initMenuCompte(){
  const b = document.getElementById('acctBtn'), m = document.getElementById('acctMenu');
  if(!b || !m) return;
  b.addEventListener('click', e=>{
    e.stopPropagation();
    const ouvrir = m.hidden;
    m.hidden = !ouvrir;
    b.setAttribute('aria-expanded', String(ouvrir));
  });
  document.addEventListener('click', e=>{ if(!m.hidden && !m.contains(e.target)) fermerMenuCompte(); });
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape') fermerMenuCompte(); });
  ['btnLogin', 'btnSignup', 'btnLogout'].forEach(id=>{ const x = document.getElementById(id); if(x) x.addEventListener('click', fermerMenuCompte); });
})();

/* =========================================================
   PAGE « MES ÉVÉNEMENTS »
   ========================================================= */
window.mesOnglet = window.mesOnglet || 'favoris';
const ONGLETS_MES = ['favoris', 'alertes', 'inscriptions', 'organise'];

function renderMes(){
  const onglet = ONGLETS_MES.includes(window.mesOnglet) ? window.mesOnglet : 'favoris';
  document.querySelectorAll('.mes-tab').forEach(t=> t.setAttribute('aria-selected', String(t.dataset.mes === onglet)));
  document.querySelectorAll('.mes-panel').forEach(p=>{
    const on = p.dataset.panel === onglet;
    p.hidden = !on;
    p.classList.toggle('active', on);
  });
  const actif = document.querySelector('.mes-tab[aria-selected="true"]');
  if(actif && actif.parentElement.scrollWidth > actif.parentElement.clientWidth) actif.parentElement.scrollLeft = actif.offsetLeft - 16;
  const nFav = document.getElementById('mesNFav');
  if(nFav) nFav.textContent = currentUser && favorites.size ? String(favorites.size) : '';
  if(onglet === 'favoris') renderFavorites();
  if(onglet === 'alertes') ouvrirPageAlertes();
  if(onglet === 'inscriptions') renderMesInscriptions();
  if(onglet === 'organise') renderOrga();
}
document.querySelectorAll('.mes-tab').forEach(t=> t.addEventListener('click', ()=>{ window.mesOnglet = t.dataset.mes; renderMes(); }));

/* =========================================================
   MES INSCRIPTIONS (participant)
   ========================================================= */
async function renderMesInscriptions(){
  const box = document.getElementById('mesInscriptions');
  if(!box) return;
  if(!currentUser){ videConnexion(box, 'Tes inscriptions au même endroit', "Inscris-toi aux événements qui le proposent sur leur fiche, puis suis ici ta demande et les documents à fournir."); return; }
  if(!D().mesInscriptions){ box.innerHTML = chargement('Connexion au service…'); return; }
  box.innerHTML = chargement();
  let liste = [];
  try{ liste = await D().mesInscriptions(); }
  catch(e){ box.innerHTML = `<div class="empty-state"><p>${esc(messageErreur(e))}</p></div>`; return; }
  const n = document.getElementById('mesNInsc');
  if(n) n.textContent = String(liste.filter(i=> i.statut !== 'annulee').length || '');
  if(!liste.length){
    box.innerHTML = `<div class="empty-state"><h4>Aucune inscription pour l'instant</h4>
      <p>Les événements qui proposent l'inscription sur EBOK ont un bouton « S'inscrire » sur leur fiche.</p>
      <button class="btn btn-primary" data-go-search>Trouver un événement</button></div>`;
    box.querySelector('[data-go-search]').addEventListener('click', ()=> showPage('search'));
    return;
  }
  box.innerHTML = `<div class="mi-list">${liste.map(i=>{
    const docs = i.documentsDemandes || [];
    const actif = !['annulee', 'refusee'].includes(i.statut);
    const docsHtml = docs.length ? `<div class="mi-docs">${docs.map(d=>{
      const depot = (i.documents || {})[d.id];
      const etat = depot ? (DOC_STATUT[depot.statut] || 'Déposé') : 'À fournir';
      const cls = !depot ? 'doc-miss' : depot.statut === 'valide' ? 'doc-ok' : depot.statut === 'a_refaire' ? 'doc-miss' : 'doc-wait';
      return `<div class="mi-doc">
        <span class="mi-doc-nom">${ico('clipboard')}${esc(d.nom)}${d.aide ? `<em>${esc(d.aide)}</em>` : ''}</span>
        <span class="doc-etat ${cls}">${esc(etat)}</span>
        ${actif && !(depot && depot.statut === 'valide') ? `<label class="btn btn-ghost btn-sm mi-up">${depot ? 'Remplacer' : 'Déposer'}<input type="file" accept="image/*,application/pdf" data-up="${esc(i.id)}" data-doc="${esc(d.id)}" hidden></label>` : ''}
        ${depot && depot.url ? `<a class="mi-voir" href="${esc(depot.url)}" target="_blank" rel="noopener">Voir</a>` : ''}
      </div>`;
    }).join('')}</div>` : '';
    return `<div class="mi-row">
      <div class="mi-top">
        ${tableauDeMarque(i.event)}
        <div class="mi-main">
          <button type="button" class="mi-title" data-open="${esc(i.event.id)}">${esc(i.event.title)}</button>
          <span class="mi-where">${ico('pin')}${esc([i.event.city, i.event.type].filter(Boolean).join(' · '))}</span>
        </div>
        ${pastille(i.statut)}
        ${actif ? `<button type="button" class="btn btn-ghost btn-sm" data-annuler="${esc(i.id)}">Annuler</button>` : ''}
      </div>
      ${i.consignes ? `<p class="mi-consignes">${esc(i.consignes)}</p>` : ''}
      ${suiviParticipant(i)}
      ${docsHtml}
      <p class="mi-err hidden" data-err="${esc(i.id)}"></p>
    </div>`;
  }).join('')}</div>
  <p class="section-hint">Les documents déposés ne sont visibles que par l'organisateur de l'événement et ses co-organisateurs.</p>`;
  box.querySelectorAll('[data-open]').forEach(b=> b.addEventListener('click', ()=> openEvent(b.dataset.open)));
  box.querySelectorAll('[data-qr]').forEach(el=> dessinerQr(el, el.dataset.qr));
  box.querySelectorAll('[data-annuler]').forEach(b=> b.addEventListener('click', async ()=>{
    if(!confirm('Annuler ta demande d\'inscription ?')) return;
    b.disabled = true;
    try{ await D().annulerInscription(b.dataset.annuler); renderMesInscriptions(); }
    catch(e){ b.disabled = false; alert(messageErreur(e)); }
  }));
  box.querySelectorAll('[data-up]').forEach(inp=> inp.addEventListener('change', async ()=>{
    const f = inp.files && inp.files[0];
    if(!f) return;
    const err = box.querySelector(`[data-err="${CSS.escape(inp.dataset.up)}"]`);
    if(f.size > 8 * 1024 * 1024){ err.textContent = messageErreur({ code: 'trop_lourd' }); err.classList.remove('hidden'); return; }
    const lab = inp.closest('label'); lab.classList.add('is-busy'); lab.firstChild.textContent = 'Envoi…';
    try{ await D().deposerDocument(inp.dataset.up, inp.dataset.doc, f); renderMesInscriptions(); }
    catch(e){ err.textContent = messageErreur(e); err.classList.remove('hidden'); lab.classList.remove('is-busy'); lab.firstChild.textContent = 'Déposer'; }
  }));
}

function suiviParticipant(i){
  const s = i.suivi || {}, l = [];
  if(s.du) l.push(`<span>Montant : <b>${euros(s.du)}</b>${s.paiement ? ` · ${esc(PAIEMENT[s.paiement.statut] || '')}${s.paiement.statut === 'partiel' && s.paiement.recu ? ` (${euros(s.paiement.recu)} reçus)` : ''}` : ' · à régler avec l\'organisateur'}</span>`);
  if(s.groupe) l.push(`<span>Groupe : <b>${esc(s.groupe)}</b></span>`);
  if(s.chambre) l.push(`<span>Chambre : <b>${esc(s.chambre)}</b></span>`);
  if(s.present) l.push('<span class="doc-ok">Présence pointée</span>');
  const qr = i.qr ? `<div class="mi-qr"><div class="mi-qr-img" data-qr="${esc(`${location.origin}/?pointage=${encodeURIComponent(i.id)}&e=${encodeURIComponent(i.event.id)}`)}"></div><p>Ton QR code d'entrée : montre-le à l'accueil le jour J.</p></div>` : '';
  return (l.length ? `<p class="mi-suivi">${l.join('')}</p>` : '') + qr;
}
/* QR code de pointage (bibliothèque qrcode-generator, js/vendor/qrcode.js). */
function dessinerQr(el, texte){
  if(typeof qrcode !== 'function'){ setTimeout(()=> dessinerQr(el, texte), 300); return; }
  const q = qrcode(0, 'M'); q.addData(texte); q.make();
  el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  const svg = el.querySelector('svg'); if(svg){ svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'QR code de pointage'); }
}

/* =========================================================
   INSCRIPTION DEPUIS LA FICHE
   ========================================================= */
let inscEvenement = null;
function brancherInscriptionFiche(ev){
  const b = document.getElementById('btnInscEbok');
  if(!b) return;
  b.addEventListener('click', ()=> ouvrirInscription(ev));
  if(!currentUser || !D().etatInscriptions) return;
  D().etatInscriptions(ev.id).then(et=>{
    if(!document.body.contains(b)) return;
    const span = b.querySelector('span');
    if(et.moi && et.moi.statut !== 'annulee'){
      const lib = { en_attente: 'Demande envoyée', validee: 'Inscription validée', liste_attente: "Liste d'attente", refusee: 'Inscription refusée' }[et.moi.statut] || 'Mon inscription';
      span.textContent = lib;
      b.classList.add('is-done');
      const clone = b.cloneNode(true);
      b.replaceWith(clone);
      clone.addEventListener('click', ()=>{ window.mesOnglet = 'inscriptions'; showPage('mes'); });
    }else if(et.places && et.validees >= et.places){
      span.textContent = "Liste d'attente";
    }
  }).catch(()=>{});
}
async function ouvrirInscription(ev){
  if(!currentUser){ openAuth('signup'); return; }
  inscEvenement = ev;
  // Le formulaire vient du serveur (réglages nettoyés), jamais de la fiche brute.
  let etat = null;
  try{ etat = await D().etatInscriptions(ev.id); }catch(e){ /* formulaire de base */ }
  const zone = document.getElementById('inscSurMesure');
  zone.innerHTML = etat ? fmChamps(etat) : '';
  fmBrancherChamps(zone);
  const equipeEbok = !!(etat && etat.equipes && etat.equipes.active);
  document.getElementById('inscNbField').classList.toggle('hidden', equipeEbok);
  const reg = ev.inscription || {};
  document.getElementById('inscTitle').textContent = `S'inscrire · ${ev.title}`;
  const cons = document.getElementById('inscConsignes');
  cons.textContent = reg.consignes || '';
  cons.classList.toggle('hidden', !reg.consignes);
  document.getElementById('inscEquipeField').classList.toggle('hidden', reg.champEquipe === false || equipeEbok);
  const docs = document.getElementById('inscDocs');
  const liste = (reg.documents || []).map(d=> d.nom).filter(Boolean);
  docs.textContent = liste.length ? `Documents demandés, à déposer ensuite dans Mes événements : ${liste.join(', ')}.` : '';
  docs.classList.toggle('hidden', !liste.length);
  document.getElementById('inscError').classList.add('hidden');
  document.getElementById('inscForm').hidden = false;
  document.getElementById('inscSub').textContent = "Ta demande est envoyée à l'organisateur, qui la valide. Tu reçois un e-mail dès sa décision.";
  ouvrirModale('inscModal');
  setTimeout(()=> document.getElementById(reg.champEquipe === false ? 'in-nb' : 'in-equipe').focus(), 50);
}
(function initInscriptionModale(){
  const m = document.getElementById('inscModal');
  if(!m) return;
  m.querySelectorAll('[data-fermer]').forEach(b=> b.addEventListener('click', ()=> fermerModale('inscModal')));
  m.addEventListener('click', e=>{ if(e.target === m) fermerModale('inscModal'); });
  document.getElementById('inscForm').addEventListener('submit', async e=>{
    e.preventDefault();
    if(!inscEvenement) return;
    const btn = document.getElementById('inscSubmit'), err = document.getElementById('inscError');
    btn.disabled = true; btn.textContent = 'Envoi…'; err.classList.add('hidden');
    try{
      const surMesure = fmLire(document.getElementById('inscSurMesure'));
      const r = await D().sInscrire(inscEvenement.id, {
        equipe: document.getElementById('in-equipe').value,
        nb: document.getElementById('in-nb').value,
        tel: document.getElementById('in-tel').value,
        message: document.getElementById('in-message').value,
        ...surMesure,
      });
      document.getElementById('inscForm').hidden = true;
      document.getElementById('inscSub').innerHTML = r.statut === 'liste_attente'
        ? "C'est complet pour le moment : tu es en <b>liste d'attente</b>. L'organisateur te préviendra si une place se libère."
        : "Ta demande est envoyée. L'organisateur va l'étudier : tu reçois un e-mail dès sa décision. Tu la retrouves dans <b>Mes événements › Mes inscriptions</b>.";
      const b = document.getElementById('btnInscEbok');
      if(b){ b.querySelector('span').textContent = 'Demande envoyée'; b.classList.add('is-done'); }
    }catch(e2){
      err.textContent = messageErreur(e2); err.classList.remove('hidden');
    }finally{
      btn.disabled = false; btn.textContent = 'Envoyer ma demande';
    }
  });
})();

/* =========================================================
   J'ORGANISE — liste et tableau de bord
   ========================================================= */
const orga = { liste: [], sel: null, data: null, sous: 'inscrits', filtre: { statut: '', cat: '', q: '' }, choix: new Set(), tri: { col: 'date', sens: 1 }, msgIds: null };

async function renderOrga(){
  const box = document.getElementById('orgaZone');
  if(!box) return;
  if(!currentUser){ videConnexion(box, 'Gère tes événements avec les outils EBOK', 'Inscriptions à valider, liste des participants, documents, messages aux inscrits et co-organisateurs.'); return; }
  if(!D().mesEvenementsOrganises){ box.innerHTML = chargement('Connexion au service…'); return; }
  box.innerHTML = chargement();
  try{ orga.liste = await D().mesEvenementsOrganises(); }
  catch(e){ box.innerHTML = `<div class="empty-state"><p>${esc(messageErreur(e))}</p></div>`; return; }
  const n = document.getElementById('mesNOrga');
  if(n) n.textContent = orga.liste.length ? String(orga.liste.length) : '';
  if(!orga.liste.length){
    box.innerHTML = `<div class="empty-state">${ICO_OUTILS}<h4>Tu n'organises encore aucun événement</h4>
      <p>Publie ton événement : tu pourras ensuite ouvrir les inscriptions, valider les participants, collecter les documents et leur écrire.</p>
      <button class="btn btn-primary" data-go-create>${ico('plus')}Publier un événement</button></div>`;
    box.querySelector('[data-go-create]').addEventListener('click', ()=> showPage('create'));
    return;
  }
  if(!orga.liste.some(e=> e.id === orga.sel)) orga.sel = orga.liste[0].id;
  box.innerHTML = `<aside class="orga-list" aria-label="Mes événements organisés">${orga.liste.map(ev=>{
    const attente = (ev.parStatut || {}).en_attente || 0;
    const etat = ev.status === 'approved' ? '<span class="st-pill st-ok"><i></i>En ligne</span>' : '<span class="st-pill st-wait"><i></i>En attente de validation</span>';
    return `<button type="button" class="orga-item" data-sel="${esc(ev.id)}" aria-pressed="${ev.id === orga.sel}">
      ${tableauDeMarque(ev)}
      <span class="orga-item-txt"><b>${esc(ev.title)}</b>${etat}${attente ? `<em>${attente} demande${attente > 1 ? 's' : ''} à traiter</em>` : ''}${ev.visibilite === 'prive' ? '<em class="is-coorg">Privé · accessible par lien</em>' : ''}${ev.role === 'coorg' ? '<em class="is-coorg">Co-organisateur</em>' : ''}</span>
    </button>`;
  }).join('')}
    <button type="button" class="orga-item orga-new" data-go-create>${ico('plus')}Publier un événement</button>
  </aside>
  <div class="orga-dash" id="orgaDash">${chargement()}</div>`;
  box.querySelectorAll('[data-sel]').forEach(b=> b.addEventListener('click', ()=>{
    orga.sel = b.dataset.sel; orga.sous = 'inscrits'; orga.filtre = { statut: '', cat: '', q: '' }; orga.choix = new Set(); orga.msgIds = null;
    box.querySelectorAll('[data-sel]').forEach(x=> x.setAttribute('aria-pressed', String(x === b)));
    chargerTableau();
  }));
  box.querySelector('[data-go-create]').addEventListener('click', ()=> showPage('create'));
  chargerTableau();
}

async function chargerTableau(){
  const dash = document.getElementById('orgaDash');
  if(!dash) return;
  dash.innerHTML = chargement();
  try{ orga.data = await D().tableauOrganisateur(orga.sel); }
  catch(e){ dash.innerHTML = `<div class="empty-state"><p>${esc(messageErreur(e))}</p></div>`; return; }
  dessinerTableau();
}

function compteParStatut(){
  const c = {}; for(const s of STATUTS_ORDRE) c[s] = 0;
  for(const i of orga.data.inscriptions) c[i.statut] = (c[i.statut] || 0) + 1;
  return c;
}

function dessinerTableau(){
  const dash = document.getElementById('orgaDash');
  const d = orga.data, ev = orga.liste.find(e=> e.id === orga.sel) || {};
  const reg = d.reglages, c = compteParStatut();
  const sous = [['inscrits', `Inscrits <span class="mes-n">${d.inscriptions.filter(i=> i.statut !== 'annulee').length || ''}</span>`], ...(reg.pointage && reg.pointage.active ? [['jourj', 'Jour J']] : []), ['messages', 'Messages'], ['reglages', 'Réglages'], ['equipe', 'Co-organisateurs']];
  if(orga.sous === 'jourj' && !(reg.pointage && reg.pointage.active)) orga.sous = 'inscrits';
  dash.innerHTML = `
    <div class="od-head">
      <div><span class="od-meta">${esc([ev.type, ev.lieu || ev.city].filter(Boolean).join(' · '))}</span><h3>${esc(d.event.title)}</h3></div>
      <div class="od-actions">
        <button type="button" class="btn btn-ghost" data-od="modifier">${ico('edit')}Modifier la fiche</button>
        <button type="button" class="btn btn-ghost" data-od="voir">Voir la fiche</button>
      </div>
    </div>
    <div class="od-vis" role="group" aria-label="Visibilité de l'événement">
      <div class="od-vis-seg">
        <button type="button" class="chip" data-vis="public" aria-pressed="${d.visibilite !== 'prive'}">${ico('globe')}Public</button>
        <button type="button" class="chip" data-vis="prive" aria-pressed="${d.visibilite === 'prive'}">${ico('lock')}Privé</button>
      </div>
      <p class="od-vis-txt">${d.visibilite === 'prive'
        ? "<b>Privé :</b> absent de la carte, de la recherche, de l'agenda et des alertes. Seules les personnes qui ont le lien voient la fiche et peuvent s'inscrire."
        : '<b>Public :</b> visible sur la carte, dans la recherche, l\'agenda et les alertes.'}</p>
      <button type="button" class="btn btn-ghost btn-sm" data-od="lien">${ico('link')}Copier le lien</button>
    </div>
    ${d.event.status !== 'approved' ? `<p class="od-note">Ton événement attend la validation de l'équipe EBOK. Tu peux déjà préparer les inscriptions : elles s'ouvriront sur la fiche dès sa mise en ligne.</p>` : ''}
    ${!reg.active ? `<div class="od-banner">${ICO_OUTILS}<span>Les inscriptions ne sont pas ouvertes sur ta fiche.</span><button type="button" class="btn btn-primary btn-sm" data-od="ouvrir">Ouvrir les inscriptions</button></div>` : ''}
    <div class="od-stats">
      <div class="od-stat"><small>Vues de la fiche</small><b>${(ev.vues || 0).toLocaleString('fr-FR')}</b></div>
      <div class="od-stat"><small>Favoris</small><b>${(ev.favoris || 0).toLocaleString('fr-FR')}</b></div>
      <div class="od-stat"><small>Inscriptions validées</small><b>${c.validee}${reg.places ? ` / ${reg.places}` : ''}</b>${reg.places ? `<div class="od-bar"><i style="width:${Math.min(100, Math.round(c.validee / reg.places * 100))}%"></i></div>` : ''}</div>
      <div class="od-stat ${c.en_attente ? 'is-todo' : ''}"><small>À traiter</small><b>${c.en_attente}</b><span>${c.liste_attente ? `${c.liste_attente} en liste d'attente` : ''}</span></div>
    </div>
    <div class="od-tabs" role="tablist">${sous.map(([k, l])=> `<button type="button" class="mes-tab" role="tab" data-sous="${k}" aria-selected="${orga.sous === k}">${l}</button>`).join('')}</div>
    <div class="od-body" id="odBody"></div>`;
  dash.querySelectorAll('[data-sous]').forEach(b=> b.addEventListener('click', ()=>{ orga.sous = b.dataset.sous; dessinerTableau(); }));
  dash.querySelector('[data-od="voir"]').addEventListener('click', ()=> openEvent(orga.sel));
  dash.querySelector('[data-od="modifier"]').addEventListener('click', modifierFiche);
  dash.querySelectorAll('[data-vis]').forEach(b=> b.addEventListener('click', ()=> changerVisibilite(b.dataset.vis)));
  dash.querySelector('[data-od="lien"]').addEventListener('click', async e=>{
    const lien = `${location.origin}/evenement/${orga.sel}`;
    const btn = e.currentTarget;
    try{ await navigator.clipboard.writeText(lien); btn.lastChild.textContent = 'Lien copié'; setTimeout(()=>{ btn.lastChild.textContent = 'Copier le lien'; }, 2000); }
    catch{ prompt('Lien de la fiche :', lien); }
  });
  const ouvrir = dash.querySelector('[data-od="ouvrir"]');
  if(ouvrir) ouvrir.addEventListener('click', ()=>{ orga.sous = 'reglages'; dessinerTableau(); });
  ({ inscrits: vueInscrits, jourj: vueJourJ, messages: vueMessages, reglages: vueReglages, equipe: vueEquipe })[orga.sous]();
}

async function changerVisibilite(vis){
  if((orga.data.visibilite || 'public') === vis) return;
  if(vis === 'prive' && !confirm("Rendre l'événement privé ? Il disparaît de la carte, de la recherche et de l'agenda ; il reste accessible par son lien.")) return;
  try{
    const r = await D().majReglagesInscription(orga.sel, { visibilite: vis });
    orga.data.visibilite = r.visibilite;
    const ev = orga.liste.find(x=> x.id === orga.sel); if(ev) ev.visibilite = r.visibilite;
    // La carte et l'agenda suivent tout de suite.
    if(r.visibilite === 'prive'){
      const i = events.findIndex(x=> x.id === orga.sel);
      if(i >= 0){ events.splice(i, 1); if(typeof renderAll === 'function') renderAll(); }
    }
    renderOrga();
  }catch(e){ alert(messageErreur(e)); }
}

async function modifierFiche(){
  const id = orga.sel;
  let ev = (typeof mineList !== 'undefined' && mineList.find(e=> e.id === id)) || events.find(e=> e.id === id);
  if(!ev && D().getEvent){ ev = await D().getEvent(id); if(ev && typeof mineList !== 'undefined') mineList.push(ev); }
  if(!ev){ alert('Fiche introuvable pour le moment.'); return; }
  if(orga.data && orga.data.role === 'coorg') ev.__coorg = true;
  openEditModal(id);
}

/* ---------- Inscrits ---------- */
function inscritsFiltres(){
  const f = orga.filtre, q = (f.q || '').toLowerCase();
  const liste = orga.data.inscriptions.filter(i=>
    (!f.statut ? i.statut !== 'annulee' : i.statut === f.statut) &&
    (!f.cat || (i.categories || []).includes(f.cat)) &&
    (!q || [i.nom, i.email, i.demande.equipe, i.demande.tel, (i.categories || []).join(' ')].join(' ').toLowerCase().includes(q)));
  return trier(liste);
}
/* Tri : clic sur l'en-tête d'une colonne (une seconde fois : ordre inverse). */
const CLES_TRI = {
  nom: i=> (i.nom || i.email || '').toLowerCase(),
  equipe: i=> (i.demande.equipe || '').toLowerCase(),
  date: i=> new Date(i.createdAt).getTime() || 0,
  statut: i=> STATUTS_ORDRE.indexOf(i.statut),
  personnes: i=> Number(i.demande.nb) || 1,
  categories: i=> (i.categories || []).join(', ').toLowerCase(),
  documents: i=> orga.data.reglages.documents.filter(d=> (i.documents[d.id] || {}).statut === 'valide').length,
};
function trier(liste){
  const { col, sens } = orga.tri, cle = CLES_TRI[col] || CLES_TRI.date;
  return liste.slice().sort((a, b)=>{ const x = cle(a), y = cle(b); return (x < y ? -1 : x > y ? 1 : 0) * sens; });
}
function docsResume(i){
  const demandes = orga.data.reglages.documents;
  if(!demandes.length) return '';
  const ok = demandes.filter(d=> (i.documents[d.id] || {}).statut === 'valide').length;
  const deposes = demandes.filter(d=> i.documents[d.id]).length;
  const cls = ok === demandes.length ? 'doc-ok' : deposes > ok ? 'doc-wait' : 'doc-miss';
  return `<span class="doc-etat ${cls}">${ok}/${demandes.length}${deposes > ok ? ` · ${deposes - ok} à vérifier` : ''}</span>`;
}
function menuExport(id, libelle){
  return `<div class="od-menu"><button type="button" class="btn btn-ghost" data-menu="${id}" aria-expanded="false">${ico('download')}${libelle}${ico('chevron')}</button>
    <div class="od-menu-list" id="${id}" hidden>
      <button type="button" data-export="xlsx">Excel (.xlsx)</button>
      <button type="button" data-export="pdf">PDF</button>
      <button type="button" data-export="csv">CSV</button>
    </div></div>`;
}
function vueInscrits(){
  const body = document.getElementById('odBody');
  const d = orga.data, c = compteParStatut(), f = orga.filtre;
  if(!d.inscriptions.length){
    body.innerHTML = `<div class="empty-state"><h4>Pas encore d'inscrit</h4><p>${d.reglages.active ? 'Les demandes arrivent ici dès qu\'un membre clique sur « S\'inscrire » sur ta fiche. Tu reçois aussi un e-mail.' : 'Ouvre les inscriptions dans l\'onglet Réglages : un bouton « S\'inscrire » apparaît sur ta fiche.'}</p></div>`;
    return;
  }
  // La sélection ne garde que des inscrits qui existent encore.
  const existants = new Set(d.inscriptions.map(i=> i.id));
  for(const id of [...orga.choix]) if(!existants.has(id)) orga.choix.delete(id);
  const liste = inscritsFiltres();
  const nSel = orga.choix.size;
  const tousCoches = liste.length && liste.every(i=> orga.choix.has(i.id));
  const th = (col, libelle, cls)=>{
    const actif = orga.tri.col === col;
    return `<th class="${cls || ''}" aria-sort="${actif ? (orga.tri.sens > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="od-sort" data-tri="${col}">${libelle}<span class="od-sort-ic">${actif ? (orga.tri.sens > 0 ? '↑' : '↓') : ''}</span></button></th>`;
  };
  const docs = d.reglages.documents.length;
  const lg = d.reglages.logistique;
  const avecSuivi = d.reglages.tarifs.length || lg.groupes.length || lg.chambres.length || d.reglages.pointage.active;
  const suivi = i=>{
    const g = i.gestion || {}, l = [];
    if(d.reglages.tarifs.length){ const s = (g.paiement && g.paiement.statut) || 'a_payer'; l.push(`<span class="st-pill ${s === 'paye' || s === 'offert' ? 'st-ok' : s === 'partiel' ? 'st-list' : 'st-wait'}"><i></i>${PAIEMENT[s]}</span>`); }
    if(g.groupe) l.push(`<span class="tag">${esc(g.groupe)}</span>`);
    if(g.chambre) l.push(`<span class="tag">${esc(g.chambre)}</span>`);
    if(g.present) l.push('<span class="doc-etat doc-ok">Présent</span>');
    return l.join(' ');
  };
  const optionsSel = (id, libelle, liste)=> liste.length ? `<select class="od-select od-select-sm" id="${id}" aria-label="${libelle}"><option value="">${libelle}…</option>${liste.map(x=> `<option value="${esc(x)}">${esc(x)}</option>`).join('')}<option value="__vide">Retirer</option></select>` : '';
  body.innerHTML = `
    <div class="od-tools">
      <div class="od-chips" role="group" aria-label="Filtrer par statut">
        <button type="button" class="chip" data-f-statut="" aria-pressed="${!f.statut}">Tous <b>${d.inscriptions.length - c.annulee}</b></button>
        ${STATUTS_ORDRE.filter(s=> c[s]).map(s=> `<button type="button" class="chip" data-f-statut="${s}" aria-pressed="${f.statut === s}">${STATUT_INSC[s].label} <b>${c[s]}</b></button>`).join('')}
      </div>
      <div class="od-tools-row">
        <label class="od-search">${ico('search')}<input type="search" id="odQ" placeholder="Rechercher un inscrit" value="${esc(f.q)}"></label>
        ${d.reglages.categories.length ? `<select id="odCat" class="od-select" aria-label="Filtrer par catégorie"><option value="">Toutes les catégories</option>${d.reglages.categories.map(x=> `<option ${f.cat === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : ''}
        ${menuExport('odExportMenu', 'Exporter')}
        <button type="button" class="btn btn-ink" id="odEcrire">${ico('send')}Écrire aux inscrits</button>
      </div>
    </div>
    <div class="od-bulk" id="odBulk" ${nSel ? '' : 'hidden'} role="region" aria-label="Actions sur la sélection">
      <span class="od-bulk-n"><b>${nSel}</b> sélectionné${nSel > 1 ? 's' : ''}</span>
      <button type="button" class="btn btn-sm btn-primary" data-lot="validee">${ico('check')}Valider</button>
      <button type="button" class="btn btn-sm btn-ghost" data-lot="liste_attente">Liste d'attente</button>
      <button type="button" class="btn btn-sm btn-ghost" data-lot="refusee">Refuser</button>
      ${d.reglages.categories.length ? `<select class="od-select od-select-sm" id="odLotCat" aria-label="Catégorie"><option value="">Catégorie…</option>${d.reglages.categories.map(x=> `<option value="+${esc(x)}">Ajouter « ${esc(x)} »</option>`).join('')}${d.reglages.categories.map(x=> `<option value="-${esc(x)}">Retirer « ${esc(x)} »</option>`).join('')}</select>` : ''}
      ${docs ? `<button type="button" class="btn btn-sm btn-ghost" data-lot-docs>Valider les documents déposés</button>` : ''}
      ${d.reglages.tarifs.length ? `<select class="od-select od-select-sm" id="odLotPaie" aria-label="Paiement"><option value="">Paiement…</option>${Object.entries(PAIEMENT).map(([k, l])=> `<option value="${k}">${l}</option>`).join('')}</select>` : ''}
      ${optionsSel('odLotGroupe', 'Groupe', lg.groupes)}${optionsSel('odLotChambre', 'Chambre', lg.chambres)}
      <button type="button" class="btn btn-sm btn-ghost" data-lot-ecrire>${ico('send')}Écrire</button>
      <button type="button" class="btn btn-sm btn-ghost" data-lot-mails>${ico('mail')}Copier les e-mails</button>
      ${menuExport('odExportSel', 'Exporter')}
      <button type="button" class="btn btn-sm btn-ghost od-danger" data-lot-suppr>${ico('trash')}Supprimer</button>
      <button type="button" class="od-bulk-clear" data-lot-vider>Tout désélectionner</button>
    </div>
    <div class="od-table-wrap"><table class="od-table">
      <thead><tr>
        <th class="od-check"><input type="checkbox" id="odTous" aria-label="Tout sélectionner" ${tousCoches ? 'checked' : ''}></th>
        ${th('nom', 'Inscrit')}${th('date', 'Demande le', 'hide-m')}${th('statut', 'Statut')}${th('categories', 'Catégories', 'hide-m')}${docs ? th('documents', 'Documents', 'hide-m') : ''}${avecSuivi ? '<th class="hide-m">Suivi</th>' : ''}
        <th class="od-th-act"><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${liste.map(i=> `<tr data-insc="${esc(i.id)}" tabindex="0" class="${orga.choix.has(i.id) ? 'is-sel' : ''}">
        <td class="od-check"><input type="checkbox" data-coche="${esc(i.id)}" aria-label="Sélectionner ${esc(i.nom || i.email || 'cet inscrit')}" ${orga.choix.has(i.id) ? 'checked' : ''}></td>
        <td><b>${esc(i.nom || i.email || 'Membre')}</b><span class="od-sub">${esc([i.demande.equipe, i.demande.nb > 1 ? `${i.demande.nb} personnes` : ''].filter(Boolean).join(' · ') || i.email)}</span>${i.commentaire ? `<span class="od-note-ic" title="Commentaire privé">${ico('message')}</span>` : ''}</td>
        <td class="num hide-m">${dateCourteFr(i.createdAt)}</td>
        <td>${pastille(i.statut)}</td>
        <td class="hide-m">${(i.categories || []).map(x=> `<span class="tag">${esc(x)}</span>`).join('')}</td>
        ${docs ? `<td class="hide-m">${docsResume(i)}</td>` : ''}
        ${avecSuivi ? `<td class="hide-m od-suivi">${suivi(i)}</td>` : ''}
        <td class="od-act">${i.statut === 'en_attente' || i.statut === 'liste_attente' ? `<button type="button" class="btn btn-sm btn-primary" data-vite="validee" data-id="${esc(i.id)}">Valider</button>` : ''}</td>
      </tr>`).join('') || `<tr><td colspan="7" class="od-vide">Aucun inscrit ne correspond.</td></tr>`}</tbody>
    </table></div>
    <p class="field-hint od-legende">Coche des inscrits pour agir sur plusieurs à la fois. Clique sur un titre de colonne pour trier.</p>`;

  body.querySelectorAll('[data-f-statut]').forEach(b=> b.addEventListener('click', ()=>{ f.statut = b.dataset.fStatut; vueInscrits(); }));
  const qIn = document.getElementById('odQ');
  qIn.addEventListener('input', ()=>{ f.q = qIn.value; const pos = qIn.selectionStart; vueInscrits(); const n = document.getElementById('odQ'); n.focus(); n.setSelectionRange(pos, pos); });
  const cat = document.getElementById('odCat'); if(cat) cat.addEventListener('change', ()=>{ f.cat = cat.value; vueInscrits(); });
  body.querySelectorAll('[data-tri]').forEach(b=> b.addEventListener('click', ()=>{
    orga.tri = { col: b.dataset.tri, sens: orga.tri.col === b.dataset.tri ? -orga.tri.sens : 1 };
    vueInscrits();
  }));
  document.getElementById('odEcrire').addEventListener('click', ()=>{ orga.msgIds = null; orga.sous = 'messages'; dessinerTableau(); });
  brancherMenus(body, format=> exporter(format, liste), format=> exporter(format, liste.filter(i=> orga.choix.has(i.id))));

  // Sélection
  document.getElementById('odTous').addEventListener('change', e=>{
    liste.forEach(i=> e.target.checked ? orga.choix.add(i.id) : orga.choix.delete(i.id));
    vueInscrits();
  });
  body.querySelectorAll('[data-coche]').forEach(cb=> cb.addEventListener('change', ()=>{
    cb.checked ? orga.choix.add(cb.dataset.coche) : orga.choix.delete(cb.dataset.coche);
    vueInscrits();
  }));
  body.querySelectorAll('tr[data-insc]').forEach(tr=>{
    const ouvrir = ()=> ouvrirInscrit(tr.dataset.insc);
    tr.addEventListener('click', e=>{ if(!e.target.closest('[data-vite], .od-check')) ouvrir(); });
    tr.addEventListener('keydown', e=>{ if(e.key === 'Enter' && !e.target.closest('input, button')) ouvrir(); });
  });
  body.querySelectorAll('[data-vite]').forEach(b=> b.addEventListener('click', async ()=>{
    b.disabled = true;
    await enregistrerInscrit(b.dataset.id, { statut: b.dataset.vite });
  }));

  // Actions groupées
  const ids = ()=> [...orga.choix];
  body.querySelectorAll('[data-lot]').forEach(b=> b.addEventListener('click', ()=>{
    const s = b.dataset.lot, n = orga.choix.size;
    if(s === 'refusee' && !confirm(`Refuser ${n} inscription${n > 1 ? 's' : ''} ? Chaque participant est prévenu par e-mail.`)) return;
    if(s === 'validee'){
      const places = d.reglages.places, apres = c.validee + ids().filter(id=> (d.inscriptions.find(i=> i.id === id) || {}).statut !== 'validee').length;
      if(places && apres > places && !confirm(`Tu dépasses les ${places} places (${apres} validées). Valider quand même ?`)) return;
    }
    actionLot({ statut: s });
  }));
  const lotCat = document.getElementById('odLotCat');
  if(lotCat) lotCat.addEventListener('change', ()=>{
    const v = lotCat.value; if(!v) return;
    actionLot(v[0] === '+' ? { ajouterCat: v.slice(1) } : { retirerCat: v.slice(1) });
  });
  [['odLotPaie', v=> ({ gestion: { paiement: { statut: v } } })], ['odLotGroupe', v=> ({ gestion: { groupe: v === '__vide' ? '' : v } })], ['odLotChambre', v=> ({ gestion: { chambre: v === '__vide' ? '' : v } })]].forEach(([id, f])=>{
    const s = document.getElementById(id); if(s) s.addEventListener('change', ()=>{ if(s.value) actionLot(f(s.value)); });
  });
  const lotDocs = body.querySelector('[data-lot-docs]');
  if(lotDocs) lotDocs.addEventListener('click', ()=> actionLot({ docsValides: true }));
  body.querySelector('[data-lot-ecrire]').addEventListener('click', ()=>{ orga.msgIds = ids(); orga.sous = 'messages'; dessinerTableau(); });
  body.querySelector('[data-lot-mails]').addEventListener('click', async e=>{
    const mails = d.inscriptions.filter(i=> orga.choix.has(i.id) && i.email).map(i=> i.email).join(', ');
    try{ await navigator.clipboard.writeText(mails); e.currentTarget.lastChild.textContent = 'E-mails copiés'; }
    catch{ prompt('E-mails des inscrits sélectionnés :', mails); }
  });
  body.querySelector('[data-lot-suppr]').addEventListener('click', async ()=>{
    const n = orga.choix.size;
    if(!confirm(`Supprimer définitivement ${n} inscription${n > 1 ? 's' : ''} ? Les participants ne sont pas prévenus. Cette action ne peut pas être annulée.`)) return;
    try{
      await D().supprimerInscrits(orga.sel, ids());
      orga.data.inscriptions = orga.data.inscriptions.filter(i=> !orga.choix.has(i.id));
      orga.choix.clear(); majCompteurs(); dessinerTableau();
    }catch(e){ alert(messageErreur(e)); }
  });
  body.querySelector('[data-lot-vider]').addEventListener('click', ()=>{ orga.choix.clear(); vueInscrits(); });
}

/* Menus déroulants d'export (liste filtrée, ou sélection). */
function brancherMenus(racine, surListe, surSelection){
  racine.querySelectorAll('[data-menu]').forEach(bouton=>{
    const menu = document.getElementById(bouton.dataset.menu);
    bouton.addEventListener('click', e=>{
      e.stopPropagation();
      const ouvrir = menu.hidden;
      racine.querySelectorAll('.od-menu-list').forEach(m=> m.hidden = true);
      menu.hidden = !ouvrir; bouton.setAttribute('aria-expanded', String(ouvrir));
    });
    menu.querySelectorAll('[data-export]').forEach(b=> b.addEventListener('click', ()=>{
      menu.hidden = true;
      (bouton.dataset.menu === 'odExportSel' ? surSelection : surListe)(b.dataset.export);
    }));
  });
}
document.addEventListener('click', ()=> document.querySelectorAll('.od-menu-list').forEach(m=> m.hidden = true));

async function actionLot(action){
  try{
    await D().actionLotInscrits(orga.sel, { ids: [...orga.choix], ...action });
    orga.data = await D().tableauOrganisateur(orga.sel);
    majCompteurs(); dessinerTableau();
  }catch(e){ alert(messageErreur(e)); }
}
function majCompteurs(){
  const ev = orga.liste.find(e=> e.id === orga.sel);
  if(ev) ev.parStatut = compteParStatut();
}


async function enregistrerInscrit(id, patch){
  // Places limitées : on prévient avant de dépasser, l'organisateur reste maître.
  const places = orga.data.reglages.places;
  const cur = orga.data.inscriptions.find(i=> i.id === id);
  if(patch.statut === 'validee' && places && cur && cur.statut !== 'validee' && compteParStatut().validee >= places
     && !confirm(`Les ${places} places sont déjà prises. Valider quand même cette inscription ?`)) return null;
  try{
    const maj = await D().majInscription(id, patch);
    const idx = orga.data.inscriptions.findIndex(i=> i.id === id);
    if(idx >= 0 && maj) orga.data.inscriptions[idx] = maj;
    const ev = orga.liste.find(e=> e.id === orga.sel);
    if(ev){ ev.parStatut = compteParStatut(); }
    dessinerTableau();
    return maj;
  }catch(e){ alert(messageErreur(e)); return null; }
}

function ouvrirInscrit(id){
  const i = orga.data.inscriptions.find(x=> x.id === id);
  if(!i) return;
  const reg = orga.data.reglages;
  const corps = document.getElementById('inscritCorps');
  corps.innerHTML = `
    <h3 id="inscritNom">${esc(i.nom || 'Membre')}</h3>
    <p class="edit-sub">${i.email ? `<a href="mailto:${esc(i.email)}">${esc(i.email)}</a>` : ''}${i.demande.tel ? ` · <a href="tel:${esc(String(i.demande.tel).replace(/\s/g, ''))}">${esc(i.demande.tel)}</a>` : ''}</p>
    <dl class="ins-dl">
      ${i.demande.equipe ? `<dt>Équipe / club</dt><dd>${esc(i.demande.equipe)}</dd>` : ''}
      <dt>Personnes</dt><dd>${esc(String(i.demande.nb || 1))}</dd>
      <dt>Demande le</dt><dd>${new Date(i.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
      ${i.demande.message ? `<dt>Message</dt><dd class="ins-msg">${esc(i.demande.message)}</dd>` : ''}
      ${fmReponsesHtml(reg, i.demande)}
    </dl>
    ${gestionHtml(reg, i)}
    <h4 class="ins-h">Décision</h4>
    <div class="ins-statuts" role="group" aria-label="Statut de l'inscription">
      ${['en_attente', 'validee', 'liste_attente', 'refusee'].map(s=> `<button type="button" class="chip" data-statut="${s}" aria-pressed="${i.statut === s}">${STATUT_INSC[s].label}</button>`).join('')}
    </div>
    <p class="field-hint">Le participant reçoit un e-mail quand tu valides, refuses ou le mets en liste d'attente.</p>
    <h4 class="ins-h">Catégories</h4>
    ${reg.categories.length
      ? `<div class="ins-cats" role="group" aria-label="Catégories">${reg.categories.map(x=> `<button type="button" class="chip" data-cat="${esc(x)}" aria-pressed="${(i.categories || []).includes(x)}">${esc(x)}</button>`).join('')}</div>`
      : `<p class="field-hint">Crée tes catégories (U15, Payé, Équipe A…) dans l'onglet Réglages.</p>`}
    ${reg.documents.length ? `<h4 class="ins-h">Documents</h4><div class="ins-docs">${reg.documents.map(dm=>{
      const dep = i.documents[dm.id];
      return `<div class="ins-doc"><span>${esc(dm.nom)}</span>${dep
        ? `<a href="${esc(dep.url)}" target="_blank" rel="noopener">${ico('external')}Ouvrir</a><span class="doc-etat ${dep.statut === 'valide' ? 'doc-ok' : dep.statut === 'a_refaire' ? 'doc-miss' : 'doc-wait'}">${esc(DOC_STATUT[dep.statut] || 'Déposé')}</span>
           <button type="button" class="btn btn-sm btn-ghost" data-docstat="valide" data-doc="${esc(dm.id)}">Valider</button><button type="button" class="btn btn-sm btn-ghost" data-docstat="a_refaire" data-doc="${esc(dm.id)}">À refaire</button>`
        : '<span class="doc-etat doc-miss">Pas encore déposé</span>'}</div>`;
    }).join('')}</div>` : ''}
    <h4 class="ins-h">Commentaire privé</h4>
    <textarea id="inscritCom" rows="3" maxlength="2000" placeholder="Visible seulement par toi et tes co-organisateurs">${esc(i.commentaire || '')}</textarea>
    <div class="edit-actions"><span class="ins-ok hidden" id="inscritOk">Enregistré</span><button type="button" class="btn btn-ghost" data-fermer>Fermer</button><button type="button" class="btn btn-primary" id="inscritSave">Enregistrer le commentaire</button></div>`;
  const ok = ()=>{ const s = document.getElementById('inscritOk'); s.classList.remove('hidden'); clearTimeout(ok.t); ok.t = setTimeout(()=> s.classList.add('hidden'), 1800); };
  corps.querySelectorAll('[data-statut]').forEach(b=> b.addEventListener('click', async ()=>{
    if(b.dataset.statut === 'refusee' && !confirm('Refuser cette inscription ? Le participant sera prévenu par e-mail.')) return;
    if(await enregistrerInscrit(i.id, { statut: b.dataset.statut })) ouvrirInscrit(i.id), ok();
  }));
  corps.querySelectorAll('[data-cat]').forEach(b=> b.addEventListener('click', async ()=>{
    const cur = new Set(i.categories || []);
    cur.has(b.dataset.cat) ? cur.delete(b.dataset.cat) : cur.add(b.dataset.cat);
    if(await enregistrerInscrit(i.id, { categories: [...cur] })) ouvrirInscrit(i.id), ok();
  }));
  corps.querySelectorAll('[data-docstat]').forEach(b=> b.addEventListener('click', async ()=>{
    if(await enregistrerInscrit(i.id, { docs: { [b.dataset.doc]: b.dataset.docstat } })) ouvrirInscrit(i.id), ok();
  }));
  const gSave = document.getElementById('gestSave');
  if(gSave) gSave.addEventListener('click', async ()=>{
    const v = id=> { const el = document.getElementById(id); return el ? el.value : undefined; };
    const gestion = {};
    if(document.getElementById('gPaie')) gestion.paiement = { statut: v('gPaie'), recu: v('gRecu') };
    if(document.getElementById('gGroupe')) gestion.groupe = v('gGroupe');
    if(document.getElementById('gChambre')) gestion.chambre = v('gChambre');
    if(document.getElementById('gPresent')) gestion.present = document.getElementById('gPresent').checked;
    if(await enregistrerInscrit(i.id, { gestion })) ouvrirInscrit(i.id), ok();
  });
  document.getElementById('inscritSave').addEventListener('click', async ()=>{
    if(await enregistrerInscrit(i.id, { commentaire: document.getElementById('inscritCom').value })) ouvrirInscrit(i.id), ok();
  });
  corps.querySelectorAll('[data-fermer]').forEach(b=> b.addEventListener('click', ()=> fermerModale('inscritModal')));
  ouvrirModale('inscritModal');
}
(function(){
  const m = document.getElementById('inscritModal');
  if(!m) return;
  m.addEventListener('click', e=>{ if(e.target === m) fermerModale('inscritModal'); });
  m.querySelectorAll(':scope > .edit-box > [data-fermer]').forEach(b=> b.addEventListener('click', ()=> fermerModale('inscritModal')));
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape'){ fermerModale('inscritModal'); fermerModale('inscModal'); } });
})();

/* Exports : la liste affichée (filtres et tri compris) ou la sélection. */
/* Bloc « Suivi » de la fiche d'un inscrit : paiement, groupe, chambre, présence. */
function gestionHtml(reg, i){
  const g = i.gestion || {}, du = fmDu(reg, i.demande), lg = reg.logistique, champs = [];
  if(du || reg.tarifs.length){
    const p = g.paiement || { statut: 'a_payer', recu: 0 };
    champs.push(`<div class="field"><label for="gPaie">Paiement <span class="field-hint">(dû : ${euros(du)})</span></label><select id="gPaie">${Object.entries(PAIEMENT).map(([k, l])=> `<option value="${k}" ${p.statut === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="gRecu">Reçu (€)</label><input type="number" id="gRecu" min="0" step="0.5" value="${p.recu || ''}"></div>`);
  }
  const choix = (id, label, liste, val)=> liste.length
    ? `<div class="field"><label for="${id}">${label}</label><select id="${id}"><option value="">—</option>${liste.map(x=> `<option ${val === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>`
    : `<div class="field"><label for="${id}">${label}</label><input type="text" id="${id}" maxlength="60" value="${esc(val || '')}"></div>`;
  if(lg.groupes.length || g.groupe) champs.push(choix('gGroupe', 'Groupe', lg.groupes, g.groupe));
  if(lg.hebergement || lg.chambres.length || g.chambre) champs.push(choix('gChambre', 'Chambre / dortoir', lg.chambres, g.chambre));
  if(reg.pointage.active) champs.push(`<label class="od-switch od-switch-flat"><input type="checkbox" id="gPresent" ${g.present ? 'checked' : ''}><span><b>Présent</b>${g.present && g.present.le ? `<em>Pointé le ${new Date(g.present.le).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</em>` : ''}</span></label>`);
  if(!champs.length) return '';
  return `<h4 class="ins-h">Suivi</h4><div class="form-grid gest-grid">${champs.join('')}</div><button type="button" class="btn btn-ghost btn-sm" id="gestSave">Enregistrer le suivi</button>`;
}

function exporter(format, liste){
  const d = orga.data, docs = d.reglages.documents;
  if(!liste.length){ alert('Aucun inscrit à exporter.'); return; }
  if(!window.EBOK_EXPORT){ alert('Export indisponible pour le moment.'); return; }
  const titre = d.event.title || 'Événement';
  const nom = `inscrits-${titre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`;
  const etatDoc = (i, x)=>{ const dep = i.documents[x.id]; return dep ? (DOC_STATUT[dep.statut] || 'Déposé') : 'Manquant'; };
  const date = v=> new Date(v).toLocaleDateString('fr-FR');
  if(format === 'pdf'){
    const entetes = ['Inscrit', 'E-mail', 'Téléphone', 'Équipe / club', 'Pers.', 'Statut', 'Catégories', ...(docs.length ? ['Documents'] : []), 'Demande'];
    const lignes = liste.map(i=> [i.nom || i.email || 'Membre', i.email || '', i.demande.tel || '', i.demande.equipe || '', String(i.demande.nb || 1), (STATUT_INSC[i.statut] || {}).label || '', (i.categories || []).join(', '),
      ...(docs.length ? [`${docs.filter(x=> (i.documents[x.id] || {}).statut === 'valide').length}/${docs.length} validé(s)`] : []), date(i.createdAt)]);
    const poids = [1.5, 1.9, 1.1, 1.4, 0.45, 1.15, 1.2, ...(docs.length ? [1.05] : []), 0.85];
    const sous = `Liste des inscrits · ${liste.length} inscrit${liste.length > 1 ? 's' : ''} · ${[d.event.city, d.event.dateStart ? fmtDateRange(d.event.dateStart, d.event.dateEnd) : ''].filter(Boolean).join(' · ')} · édité le ${new Date().toLocaleDateString('fr-FR')}`;
    window.EBOK_EXPORT.pdf(nom, titre, sous, entetes, lignes, poids);
    return;
  }
  const reg = d.reglages, qs = reg.questions;
  const g = i=> i.gestion || {};
  const entetes = ['Nom', 'E-mail', 'Téléphone', 'Équipe / club', 'Personnes', 'Joueurs', 'Statut', 'Catégories', ...qs.map(q=> q.label),
    ...(reg.tarifs.length ? ['Tarif', 'Options', 'Montant dû', 'Paiement', 'Reçu'] : []),
    ...(reg.logistique.repas ? ['Repas'] : []), ...(reg.logistique.hebergement ? ['Hébergement'] : []), 'Groupe', 'Chambre', ...(reg.pointage.active ? ['Présent'] : []),
    ...docs.map(x=> x.nom), 'Commentaire privé', 'Message du participant', 'Demandé le'];
  const lignes = liste.map(i=> [i.nom, i.email, i.demande.tel, i.demande.equipe, Number(i.demande.nb) || 1, (i.demande.membres || []).map(m=> m.nom).join(', '), (STATUT_INSC[i.statut] || {}).label, (i.categories || []).join(', '),
    ...qs.map(q=> fmValeur(q, (i.demande.reponses || {})[q.id])),
    ...(reg.tarifs.length ? [(reg.tarifs.find(t=> t.id === i.demande.tarif) || {}).nom || '', reg.options.filter(o=> (i.demande.options || []).includes(o.id)).map(o=> o.nom).join(', '), fmDu(reg, i.demande), PAIEMENT[(g(i).paiement || {}).statut || 'a_payer'], (g(i).paiement || {}).recu || 0] : []),
    ...(reg.logistique.repas ? [i.demande.repas || ''] : []), ...(reg.logistique.hebergement ? [i.demande.hebergement === 'pensionnaire' ? 'Pensionnaire' : i.demande.hebergement === 'externe' ? 'Externe' : ''] : []),
    g(i).groupe || '', g(i).chambre || '', ...(reg.pointage.active ? [g(i).present ? 'Oui' : 'Non'] : []),
    ...docs.map(x=> etatDoc(i, x)), i.commentaire, i.demande.message, date(i.createdAt)]);
  if(format === 'xlsx') window.EBOK_EXPORT.xlsx(nom, entetes, lignes, 'Inscrits');
  else window.EBOK_EXPORT.csv(nom, entetes, lignes);
}


/* ---------- Jour J : pointage ---------- */
function vueJourJ(){
  const body = document.getElementById('odBody'), d = orga.data;
  const valides = d.inscriptions.filter(i=> i.statut === 'validee');
  const presents = valides.filter(i=> i.gestion && i.gestion.present).length;
  const q = (orga.jourQ || '').toLowerCase();
  const liste = valides.filter(i=> !q || [i.nom, i.email, i.demande.equipe, (i.demande.membres || []).map(m=> m.nom).join(' ')].join(' ').toLowerCase().includes(q))
    .sort((a, b)=> (a.nom || a.email || '').localeCompare(b.nom || b.email || '', 'fr'));
  body.innerHTML = `
    <div class="jj-head"><p class="jj-compte"><b>${presents}</b> / ${valides.length} présent${presents > 1 ? 's' : ''}</p>
      ${d.reglages.pointage.qr ? `<p class="field-hint">Avec le QR code : scanne-le avec l'appareil photo de ton téléphone (connecté à ton compte EBOK) ; la page s'ouvre et pointe l'inscrit.</p>` : ''}</div>
    <label class="od-search">${ico('search')}<input type="search" id="jjQ" placeholder="Chercher un nom, une équipe" value="${esc(orga.jourQ || '')}"></label>
    <div class="jj-list">${liste.map(i=> `<label class="jj-row ${i.gestion && i.gestion.present ? 'is-on' : ''}">
        <input type="checkbox" data-pointer="${esc(i.id)}" ${i.gestion && i.gestion.present ? 'checked' : ''}>
        <span class="jj-nom"><b>${esc(i.nom || i.email || 'Membre')}</b><span>${esc([i.demande.equipe, (i.gestion || {}).groupe, (i.gestion || {}).chambre].filter(Boolean).join(' · '))}</span></span>
        ${i.gestion && i.gestion.paiement && i.gestion.paiement.statut !== 'paye' && i.gestion.paiement.statut !== 'offert' && fmDu(d.reglages, i.demande) ? `<span class="st-pill st-wait"><i></i>${esc(PAIEMENT[i.gestion.paiement.statut])}</span>` : ''}
      </label>`).join('') || '<p class="od-vide">Aucun inscrit validé.</p>'}</div>`;
  const qIn = document.getElementById('jjQ');
  qIn.addEventListener('input', ()=>{ orga.jourQ = qIn.value; const pos = qIn.selectionStart; vueJourJ(); const n = document.getElementById('jjQ'); n.focus(); n.setSelectionRange(pos, pos); });
  body.querySelectorAll('[data-pointer]').forEach(cb=> cb.addEventListener('change', async ()=>{
    cb.disabled = true;
    try{
      await D().pointerInscrit(orga.sel, cb.dataset.pointer, cb.checked);
      const i = d.inscriptions.find(x=> x.id === cb.dataset.pointer);
      if(i) i.gestion = { ...(i.gestion || {}), present: cb.checked ? { le: new Date().toISOString() } : null };
      vueJourJ();
    }catch(e){ cb.checked = !cb.checked; cb.disabled = false; alert(messageErreur(e)); }
  }));
}

/* ---------- Messages ---------- */
function vueMessages(){
  const body = document.getElementById('odBody'), d = orga.data, c = compteParStatut();
  body.innerHTML = `
    <form class="od-form" id="odMsgForm">
      <p class="od-form-intro">Un e-mail est envoyé à chaque inscrit choisi. Les réponses arrivent directement dans ta boîte mail.</p>
      <fieldset class="od-field"><legend>Destinataires</legend>
        ${orga.msgIds ? `<p class="od-sel-msg"><b>${orga.msgIds.length} inscrit${orga.msgIds.length > 1 ? 's' : ''} sélectionné${orga.msgIds.length > 1 ? 's' : ''}</b> <button type="button" class="od-bulk-clear" id="odMsgTous">Choisir par statut à la place</button></p>` : ''}
        <div class="od-chips" ${orga.msgIds ? 'hidden' : ''}>${['validee', 'en_attente', 'liste_attente'].map(s=> `<label class="chip chip-check"><input type="checkbox" name="statut" value="${s}" ${s === 'validee' ? 'checked' : ''}>${STATUT_INSC[s].label} <b>${c[s]}</b></label>`).join('')}</div>
        ${d.reglages.categories.length ? `<div class="od-chips od-chips-cats"><span class="field-hint">Seulement les catégories :</span>${d.reglages.categories.map(x=> `<label class="chip chip-check"><input type="checkbox" name="cat" value="${esc(x)}">${esc(x)}</label>`).join('')}</div>` : ''}
        <p class="od-count" id="odMsgCount"></p>
      </fieldset>
      <div class="field"><label for="odSujet">Objet</label><input type="text" id="odSujet" maxlength="140" required placeholder="Ex. Horaires de samedi"></div>
      <div class="field"><label for="odTexte">Message</label><textarea id="odTexte" rows="6" maxlength="5000" required placeholder="Bonjour à tous…"></textarea></div>
      <p class="form-error hidden" id="odMsgErr"></p>
      <div class="edit-actions"><span class="ins-ok hidden" id="odMsgOk"></span><button type="submit" class="btn btn-primary" id="odMsgBtn">${ico('send')}Envoyer</button></div>
    </form>
    <h4 class="ins-h">Messages envoyés</h4>
    ${d.messages.length ? `<div class="od-histo">${d.messages.map(m=> `<details class="od-histo-item"><summary><b>${esc(m.sujet)}</b><span>${new Date(m.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${m.envoyes}/${m.nb} envoyé${m.nb > 1 ? 's' : ''}</span></summary><p>${esc(m.texte).replace(/\n/g, '<br>')}</p></details>`).join('')}</div>` : '<p class="field-hint">Aucun message envoyé pour l\'instant.</p>'}`;
  const form = document.getElementById('odMsgForm');
  const choix = ()=> ({
    statuts: [...form.querySelectorAll('input[name=statut]:checked')].map(x=> x.value),
    categories: [...form.querySelectorAll('input[name=cat]:checked')].map(x=> x.value),
  });
  const tous = document.getElementById('odMsgTous');
  if(tous) tous.addEventListener('click', ()=>{ orga.msgIds = null; vueMessages(); });
  const compter = ()=>{
    if(orga.msgIds){ const n = orga.msgIds.length; document.getElementById('odMsgCount').textContent = `${n} destinataire${n > 1 ? 's' : ''}`; return n; }
    const { statuts, categories } = choix();
    const n = d.inscriptions.filter(i=> statuts.includes(i.statut) && (!categories.length || (i.categories || []).some(x=> categories.includes(x)))).length;
    document.getElementById('odMsgCount').textContent = `${n} destinataire${n > 1 ? 's' : ''}`;
    return n;
  };
  form.addEventListener('change', compter); compter();
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const err = document.getElementById('odMsgErr'), btn = document.getElementById('odMsgBtn');
    err.classList.add('hidden');
    const n = compter();
    if(!n){ err.textContent = messageErreur({ code: 'aucun_destinataire' }); err.classList.remove('hidden'); return; }
    if(!confirm(`Envoyer ce message à ${n} inscrit${n > 1 ? 's' : ''} ?`)) return;
    btn.disabled = true;
    try{
      const r = await D().envoyerMessageInscrits(orga.sel, { ...choix(), ...(orga.msgIds ? { ids: orga.msgIds } : {}), sujet: document.getElementById('odSujet').value, texte: document.getElementById('odTexte').value });
      orga.data = await D().tableauOrganisateur(orga.sel);
      orga.msgIds = null;
      vueMessages();
      const ok = document.getElementById('odMsgOk'); ok.textContent = `Message envoyé à ${r.envoyes} inscrit${r.envoyes > 1 ? 's' : ''}.`; ok.classList.remove('hidden');
    }catch(e2){ err.textContent = messageErreur(e2); err.classList.remove('hidden'); btn.disabled = false; }
  });
}

/* ---------- Réglages des inscriptions ---------- */
function vueReglages(){
  const body = document.getElementById('odBody'), reg = orga.data.reglages;
  const ligneDoc = (dm = {})=> `<div class="od-doc-row" data-docid="${esc(dm.id || '')}">
      <input type="text" class="od-doc-nom" maxlength="80" placeholder="Ex. Autorisation de droit à l'image" value="${esc(dm.nom || '')}" aria-label="Nom du document">
      <input type="text" class="od-doc-aide" maxlength="200" placeholder="Précision (facultatif)" value="${esc(dm.aide || '')}" aria-label="Précision">
      <button type="button" class="btn btn-ghost btn-sm" data-retirer aria-label="Retirer ce document">${ico('trash')}</button></div>`;
  body.innerHTML = `
    <form class="od-form" id="odRegForm">
      <label class="od-switch"><input type="checkbox" id="rgActive" ${reg.active ? 'checked' : ''}><span><b>Ouvrir les inscriptions sur ma fiche</b><em>Un bouton « S'inscrire » apparaît sur la fiche. Chaque demande arrive ici, et c'est toi qui la valides.</em></span></label>
      <div class="form-grid">
        <div class="field"><label for="rgPlaces">Nombre de places <span class="field-hint">(0 = sans limite)</span></label><input type="number" id="rgPlaces" min="0" max="100000" value="${reg.places}"></div>
        <label class="od-switch od-switch-sm"><input type="checkbox" id="rgEquipe" ${reg.champEquipe ? 'checked' : ''}><span><b>Demander le nom de l'équipe ou du club</b></span></label>
      </div>
      <div class="field"><label for="rgConsignes">Consignes affichées au moment de l'inscription <span class="field-hint">(facultatif)</span></label><textarea id="rgConsignes" rows="3" maxlength="1000" placeholder="Ex. Inscription validée après réception du paiement de 20 € par équipe.">${esc(reg.consignes)}</textarea></div>
      <div class="field"><label for="rgCats">Catégories pour classer tes inscrits <span class="field-hint">(séparées par des virgules)</span></label><input type="text" id="rgCats" value="${esc(reg.categories.join(', '))}" placeholder="Ex. U15, U17, Payé, Équipe A"></div>
      <fieldset class="od-field"><legend>Documents demandés aux inscrits</legend>
        <div id="rgDocs">${reg.documents.map(ligneDoc).join('')}</div>
        <button type="button" class="btn btn-ghost btn-sm" id="rgAddDoc">${ico('plus')}Ajouter un document</button>
        <p class="field-hint od-legal">Droit à l'image, autorisation parentale, règlement signé… Ne demande pas de certificat médical ni de donnée de santé : prévois plutôt une attestation, et vérifie le document original sur place.</p>
      </fieldset>
      ${fmEditeur(reg)}
      <p class="form-error hidden" id="rgErr"></p>
      <div class="edit-actions"><span class="ins-ok hidden" id="rgOk">Réglages enregistrés</span><button type="submit" class="btn btn-primary">Enregistrer</button></div>
    </form>`;
  fmBrancherEditeur(body);
  const docs = document.getElementById('rgDocs');
  const brancher = ()=> docs.querySelectorAll('[data-retirer]').forEach(b=> b.onclick = ()=> b.closest('.od-doc-row').remove());
  brancher();
  document.getElementById('rgAddDoc').addEventListener('click', ()=>{ docs.insertAdjacentHTML('beforeend', ligneDoc()); brancher(); docs.lastElementChild.querySelector('input').focus(); });
  document.getElementById('odRegForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const err = document.getElementById('rgErr'); err.classList.add('hidden');
    const inscription = {
      active: document.getElementById('rgActive').checked,
      places: document.getElementById('rgPlaces').value,
      champEquipe: document.getElementById('rgEquipe').checked,
      consignes: document.getElementById('rgConsignes').value,
      categories: document.getElementById('rgCats').value.split(',').map(x=> x.trim()).filter(Boolean),
      documents: [...docs.querySelectorAll('.od-doc-row')].map(r=> ({ id: r.dataset.docid || '', nom: r.querySelector('.od-doc-nom').value, aide: r.querySelector('.od-doc-aide').value })).filter(x=> x.nom.trim()),
      ...fmLireEditeur(body),
    };
    try{
      const r = await D().majReglagesInscription(orga.sel, { inscription });
      orga.data.reglages = r.reglages;
      const ev = orga.liste.find(x=> x.id === orga.sel); if(ev) ev.inscription = r.reglages;
      // La fiche publique suit tout de suite (bouton « S'inscrire »).
      const pub = events.find(x=> x.id === orga.sel); if(pub) pub.inscription = r.reglages;
      dessinerTableau();
      const ok = document.getElementById('rgOk'); if(ok) ok.classList.remove('hidden');
    }catch(e2){ err.textContent = messageErreur(e2); err.classList.remove('hidden'); }
  });
}

/* ---------- Co-organisateurs ---------- */
function vueEquipe(){
  const body = document.getElementById('odBody'), d = orga.data, proprio = d.role === 'proprietaire';
  body.innerHTML = `
    <p class="od-form-intro">Les co-organisateurs voient et gèrent les inscrits, les documents et les messages, et peuvent modifier la fiche. Seul toi peux gérer l'équipe et supprimer l'événement.</p>
    <div class="od-team">
      <div class="od-person"><span class="acct-avatar">${esc((proprio ? displayName() : 'P').slice(0, 2).toUpperCase())}</span><div><b>${proprio ? esc(displayName() || 'Toi') : 'Propriétaire'}</b><span>Propriétaire</span></div></div>
      ${d.coorgs.map(x=> `<div class="od-person"><span class="acct-avatar is-coorg">${esc(x.email.slice(0, 2).toUpperCase())}</span><div><b>${esc(x.email)}</b><span>Co-organisateur</span></div>${proprio ? `<button type="button" class="btn btn-ghost btn-sm" data-retirer="${esc(x.email)}" aria-label="Retirer ${esc(x.email)}">${ico('trash')}</button>` : ''}</div>`).join('')}
    </div>
    ${proprio ? `<form class="od-invite" id="odInvite">
        <div class="field"><label for="odMail">Inviter un co-organisateur</label><input type="email" id="odMail" required placeholder="adresse e-mail de son compte EBOK"></div>
        <button type="submit" class="btn btn-primary">${ico('plus')}Inviter</button>
      </form>
      <p class="field-hint">La personne reçoit un e-mail. Elle accède à l'événement en se connectant à EBOK avec cette adresse.</p>
      <p class="form-error hidden" id="odTeamErr"></p>` : '<p class="field-hint">Seul le propriétaire de l\'événement peut modifier l\'équipe.</p>'}`;
  if(!proprio) return;
  const err = document.getElementById('odTeamErr');
  const sauver = async liste=>{
    err.classList.add('hidden');
    try{ const r = await D().majReglagesInscription(orga.sel, { coorgs: liste }); orga.data.coorgs = r.coorgs; vueEquipe(); }
    catch(e){ err.textContent = messageErreur(e); err.classList.remove('hidden'); }
  };
  document.getElementById('odInvite').addEventListener('submit', e=>{
    e.preventDefault();
    const mail = document.getElementById('odMail').value.trim().toLowerCase();
    if(!mail || d.coorgs.some(x=> x.email === mail)) return;
    if(currentUser && mail === String(currentUser.email || '').toLowerCase()){ err.textContent = 'Tu es déjà le propriétaire de cet événement.'; err.classList.remove('hidden'); return; }
    sauver([...d.coorgs, { email: mail }]);
  });
  body.querySelectorAll('[data-retirer]').forEach(b=> b.addEventListener('click', ()=>{
    if(confirm(`Retirer ${b.dataset.retirer} de l'équipe ?`)) sauver(d.coorgs.filter(x=> x.email !== b.dataset.retirer));
  }));
}

/* =========================================================
   QUESTION APRÈS PUBLICATION
   ========================================================= */
function poserQuestionOutils(eventId){
  const q = document.getElementById('outilsQuestion');
  if(!q) return;
  q.hidden = !(eventId && currentUser);
  q.dataset.event = eventId || '';
  q.querySelector('.oq-actions').hidden = false;
  document.getElementById('outilsMerci').hidden = true;
}
(function(){
  const q = document.getElementById('outilsQuestion');
  if(!q) return;
  q.querySelectorAll('[data-outils]').forEach(b=> b.addEventListener('click', ()=>{
    const rep = b.dataset.outils, id = q.dataset.event;
    if(id && D().repondreInteretOutils) D().repondreInteretOutils(id, rep).catch(()=>{});
    q.querySelector('.oq-actions').hidden = true;
    const merci = document.getElementById('outilsMerci');
    merci.hidden = false;
    if(rep === 'oui'){
      merci.innerHTML = 'Ton tableau de bord t\'attend dans <b>Mes événements › J\'organise</b> : ouvre les inscriptions, valide les participants, collecte les documents. <button type="button" class="btn btn-primary btn-sm" id="oqGo">Ouvrir mon tableau de bord</button>';
      document.getElementById('oqGo').addEventListener('click', ()=>{ orga.sel = id; window.mesOnglet = 'organise'; showPage('mes'); });
    }else{
      merci.textContent = rep === 'plus_tard'
        ? 'D\'accord. Tu retrouveras les outils quand tu veux dans Mes événements › J\'organise.'
        : 'Noté. Ton événement reste visible comme d\'habitude.';
    }
  }));
})();

/* Pointage par QR code : l'organisateur scanne le code d'un inscrit avec
   l'appareil photo de son téléphone ; le lien /?pointage=ID&e=EVENT s'ouvre
   ici et pointe l'inscrit (le serveur vérifie que c'est bien l'organisateur). */
(function(){
  const p = new URLSearchParams(location.search);
  const id = p.get('pointage'), ev = p.get('e');
  if(!id || !ev) return;
  history.replaceState(null, '', '/');
  let essais = 0;
  const tenter = async ()=>{
    if((!currentUser || !D().pointerInscrit) && essais++ < 40){ setTimeout(tenter, 250); return; }
    if(!currentUser){ afficherBandeau('Connecte-toi avec ton compte organisateur pour pointer cet inscrit, puis scanne à nouveau le QR code.', 'Se connecter', ()=> openAuth('login')); return; }
    try{
      const r = await D().pointerInscrit(ev, id, true);
      const qui = r.nom || r.equipe || 'Inscrit';
      const alerte = r.statut !== 'validee' ? ` Attention : inscription « ${(STATUT_INSC[r.statut] || {}).label || r.statut} ».` : '';
      afficherBandeau(r.deja ? `${qui} était déjà pointé pour ${r.event}.${alerte}` : `${qui} est pointé présent pour ${r.event}.${alerte}`, 'Ouvrir le Jour J', ()=>{ orga.sel = ev; orga.sous = 'jourj'; window.mesOnglet = 'organise'; showPage('mes'); });
    }catch(e){
      afficherBandeau(e.code === 'prive' ? "Ce QR code concerne un événement que tu n'organises pas." : messageErreur(e));
    }
  };
  tenter();
})();

/* Lien direct depuis un e-mail : /?mes=inscriptions ou /?mes=organise */
(function(){
  const m = /[?&]mes=(favoris|alertes|inscriptions|organise)/.exec(location.search);
  if(!m) return;
  window.mesOnglet = m[1];
  history.replaceState(null, '', '/');
  showPage('mes');
})();
