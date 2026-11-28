/* =========================================================
   EBOK — FICHE JOUEUR (profil membre)
   ---------------------------------------------------------
   Le joueur (ou son parent) remplit une fois sa fiche dans « Mon profil » :
   date de naissance, poste, taille, niveau, club, contacts… Ces infos
   pré-remplissent ensuite les formulaires d'inscription aux camps, stages,
   détections et tournois. Les clés sont celles des « questions types » du
   formulaire sur mesure (lib/formulaire.js, QUESTIONS_TYPES).

   Stockage : event.profiles.profile.joueur (via /api/account, saveProfile),
   nettoyé par le serveur (joueurPropre). Aucune donnée de santé : allergies,
   régime, traitement et blessures restent demandés à chaque inscription,
   avec l'accord explicite du participant.
   ========================================================= */

const FJ_CHAMPS = [
  ['Le joueur', [
    ['naissance', 'Date de naissance', 'date'],
    ['sexe', 'Sexe', 'choix', ['Fille', 'Garçon']],
    ['categorie', 'Catégorie', 'choix', ['U7', 'U9', 'U11', 'U13', 'U15', 'U17', 'U18', 'U20', 'U21', 'Senior', 'Vétéran']],
    ['taille', 'Taille (cm)', 'nombre'],
    ['poste', 'Poste', 'choix', ['Meneur', 'Arrière', 'Ailier', 'Ailier fort', 'Pivot']],
    ['niveau', 'Niveau', 'choix', ['Loisir', 'Départemental', 'Régional', 'National', 'Pro']],
    ['maillot', 'Taille de tenue', 'choix', ['8 ans', '10 ans', '12 ans', '14 ans', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']],
  ]],
  ['Club et parcours', [
    ['club', 'Club actuel', 'texte'],
    ['licence', 'Numéro de licence', 'texte'],
    ['clubPrecedent', 'Club(s) des saisons précédentes', 'texte'],
    ['selections', 'Déjà retenu(e) en sélection départementale ou régionale ?', 'ouinon'],
    ['video', 'Lien vers tes highlights (YouTube…)', 'url'],
  ]],
  ['Contacts', [
    ['tel', 'Ton téléphone', 'tel'],
    ['responsable', 'Responsable légal (si mineur)', 'contact'],
    ['urgence', "Contact en cas d'urgence", 'contact'],
  ]],
];
const FJ_TOUS = FJ_CHAMPS.flatMap(([, l])=> l);

function fjJoueur(){ return (typeof currentProfile !== 'undefined' && currentProfile && currentProfile.joueur) || {}; }
function fjAge(d){ const n = new Date(d + 'T00:00'); return isNaN(n) ? null : Math.floor((Date.now() - n) / 31557600000); }

/* ---------- Affichage dans « Mon profil » ---------- */
function fjValeur(c, v){
  const [k, , type] = c;
  if(type === 'contact') return [v.nom, v.tel, v.email].filter(Boolean).join(' · ');
  if(type === 'ouinon') return v === 'oui' ? 'Oui' : 'Non';
  if(type === 'date'){ const a = fjAge(v); return new Date(v + 'T00:00').toLocaleDateString('fr-FR') + (a != null ? ` (${a} ans)` : ''); }
  if(k === 'taille') return v + ' cm';
  return String(v);
}
function renderFicheJoueur(){
  const box = document.getElementById('ficheJoueurResume');
  if(!box) return;
  const j = fjJoueur();
  const rows = FJ_TOUS.filter(c=> j[c[0]] != null && j[c[0]] !== '').map(c=> [c[1], fjValeur(c, j[c[0]]), c[0]]);
  document.getElementById('btnFicheJoueur').textContent = rows.length ? 'Modifier ma fiche' : 'Remplir ma fiche';
  if(!rows.length){
    box.innerHTML = `<p class="about-empty">Remplis-la une fois : tes prochaines inscriptions à un camp, un stage ou une détection seront déjà complétées.</p>`;
    return;
  }
  box.innerHTML = rows.map(([k, v, cle])=> cle === 'video' && /^https?:\/\//i.test(v)
    ? `<div class="about-item"><span class="about-k">${esc(k)}</span><a class="about-v" href="${esc(v)}" target="_blank" rel="noopener noreferrer">Voir la vidéo</a></div>`
    : `<div class="about-item"><span class="about-k">${esc(k)}</span><span class="about-v">${esc(v)}</span></div>`).join('');
}

/* ---------- Fenêtre d'édition ---------- */
function fjChampHtml([k, label, type, options]){
  const id = 'fj-' + k;
  switch(type){
    case 'date': return `<div class="field"><label for="${id}">${esc(label)}</label><input type="date" id="${id}" data-fj="${k}" max="${new Date().toISOString().slice(0, 10)}"></div>`;
    case 'nombre': return `<div class="field"><label for="${id}">${esc(label)}</label><input type="number" id="${id}" data-fj="${k}" min="50" max="250" inputmode="numeric"></div>`;
    case 'choix': return `<div class="field"><label for="${id}">${esc(label)}</label><select id="${id}" data-fj="${k}"><option value="">—</option>${options.map(o=> `<option>${esc(o)}</option>`).join('')}</select></div>`;
    case 'ouinon': return `<div class="field"><label for="${id}">${esc(label)}</label><select id="${id}" data-fj="${k}"><option value="">—</option><option value="oui">Oui</option><option value="non">Non</option></select></div>`;
    case 'contact': return `<fieldset class="field fm-contact fj-large" data-fj="${k}" data-type="contact"><legend>${esc(label)}</legend><div class="form-grid-3"><input type="text" data-c="nom" maxlength="120" placeholder="Nom et prénom" aria-label="${esc(label)} : nom et prénom"><input type="tel" data-c="tel" maxlength="30" placeholder="Téléphone" aria-label="${esc(label)} : téléphone"><input type="email" data-c="email" maxlength="160" placeholder="E-mail" aria-label="${esc(label)} : e-mail"></div></fieldset>`;
    case 'url': return `<div class="field fj-large"><label for="${id}">${esc(label)}</label><input type="url" id="${id}" data-fj="${k}" maxlength="300" placeholder="https://youtube.com/…"></div>`;
    case 'tel': return `<div class="field"><label for="${id}">${esc(label)}</label><input type="tel" id="${id}" data-fj="${k}" maxlength="30"></div>`;
    default: return `<div class="field${k === 'clubPrecedent' ? ' fj-large' : ''}"><label for="${id}">${esc(label)}</label><input type="text" id="${id}" data-fj="${k}" maxlength="200"></div>`;
  }
}
function fjRemplir(form, j){
  form.querySelectorAll('[data-fj]').forEach(el=>{
    const v = j[el.dataset.fj];
    if(el.dataset.type === 'contact') el.querySelectorAll('[data-c]').forEach(i=> i.value = (v && v[i.dataset.c]) || '');
    else el.value = v == null ? '' : String(v);
  });
}
function fjLire(form){
  const j = {};
  form.querySelectorAll('[data-fj]').forEach(el=>{
    if(el.dataset.type === 'contact'){
      const c = {}; el.querySelectorAll('[data-c]').forEach(i=> c[i.dataset.c] = i.value.trim());
      if(c.nom || c.tel || c.email) j[el.dataset.fj] = c;
    }else{
      const v = el.value.trim();
      if(v !== '') j[el.dataset.fj] = el.type === 'number' ? Number(v) : v;
    }
  });
  return j;
}
async function fjEnregistrer(joueur){
  if(!currentUser || !window.EBOK_DATA || !window.EBOK_DATA.updateUserProfile) throw new Error('indispo');
  await window.EBOK_DATA.updateUserProfile(currentUser.uid, { joueur });
  currentProfile = Object.assign({}, currentProfile || {}, { joueur });
}

(function initFicheJoueur(){
  // Section dans « Mon profil », juste après « À propos de moi ».
  const about = document.getElementById('profileAbout');
  if(!about) return;
  about.closest('.profile-section').insertAdjacentHTML('afterend', `
    <div class="profile-section" id="ficheJoueur">
      <div class="profile-section-head">
        <h3>Ma fiche joueur</h3>
        <button class="btn btn-ghost" id="btnFicheJoueur">Remplir ma fiche</button>
      </div>
      <p class="section-hint">Elle pré-remplit tes inscriptions aux camps, stages, détections et tournois. Seul l'organisateur de l'événement auquel tu t'inscris la voit.</p>
      <div class="about-grid" id="ficheJoueurResume"></div>
    </div>`);
  document.body.insertAdjacentHTML('beforeend', `
    <div class="edit-modal" id="ficheJoueurModal" role="dialog" aria-modal="true" aria-labelledby="fjTitre" aria-hidden="true">
      <div class="edit-box">
        <button class="edit-close" data-fermer aria-label="Fermer">&times;</button>
        <h3 id="fjTitre">Ma fiche joueur</h3>
        <p class="edit-sub">Tout est facultatif. Si tu inscris ton enfant, remplis sa fiche avec ses infos et ajoute tes coordonnées en responsable légal.</p>
        <form id="ficheJoueurForm" novalidate>
          ${FJ_CHAMPS.map(([titre, champs])=> `<fieldset class="fj-groupe"><legend>${esc(titre)}</legend><div class="form-grid fj-grille">${champs.map(fjChampHtml).join('')}</div></fieldset>`).join('')}
          <p class="field-hint">Pas de données de santé ici : allergies, régime ou traitement te sont demandés à chaque inscription, seulement si l'organisateur en a besoin.</p>
          <p class="form-error hidden" id="fjErreur"></p>
          <div class="edit-actions"><button type="button" class="btn btn-ghost" data-fermer>Annuler</button><button type="submit" class="btn btn-primary" id="fjValider">Enregistrer</button></div>
        </form>
      </div>
    </div>`);
  const modal = document.getElementById('ficheJoueurModal');
  const form = document.getElementById('ficheJoueurForm');
  const fermer = ()=> fermerModale('ficheJoueurModal');
  modal.querySelectorAll('[data-fermer]').forEach(b=> b.addEventListener('click', fermer));
  modal.addEventListener('click', e=>{ if(e.target === modal) fermer(); });
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && modal.classList.contains('open')) fermer(); });
  document.getElementById('btnFicheJoueur').addEventListener('click', ()=>{
    if(!currentUser){ openAuth('login'); return; }
    fjRemplir(form, fjJoueur());
    document.getElementById('fjErreur').classList.add('hidden');
    ouvrirModale('ficheJoueurModal');
    setTimeout(()=> document.getElementById('fj-naissance').focus(), 50);
  });
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const btn = document.getElementById('fjValider'), err = document.getElementById('fjErreur');
    const v = form.querySelector('#fj-video').value.trim();
    if(v && !/^https?:\/\/\S+$/i.test(v)){ err.textContent = 'Le lien vidéo doit commencer par https://'; err.classList.remove('hidden'); return; }
    btn.disabled = true; btn.textContent = 'Enregistrement…'; err.classList.add('hidden');
    try{
      await fjEnregistrer(fjLire(form));
      fermer();
      renderFicheJoueur();
    }catch(e2){
      err.textContent = 'Enregistrement impossible. Réessaie.'; err.classList.remove('hidden');
    }finally{ btn.disabled = false; btn.textContent = 'Enregistrer'; }
  });
  renderFicheJoueur();
})();

/* ---------- Pré-remplissage du formulaire d'inscription ----------
   Appelé par ouvrirInscription (js/organisateur.js) une fois les questions
   de l'organisateur affichées. On ne remplit que les champs vides. */
function fjPreRemplir(zone){
  const j = fjJoueur();
  let n = 0;
  zone.querySelectorAll('[data-q]').forEach(el=>{
    const v = j[el.dataset.q];
    if(v == null || v === '') return;
    const t = el.dataset.type;
    if(t === 'contact'){
      el.querySelectorAll('[data-c]').forEach(i=>{ if(!i.value && v[i.dataset.c]) i.value = v[i.dataset.c]; });
      n++;
    }else if(t === 'ouinon'){
      const r = el.querySelector(`input[value="${v === 'oui' ? 'oui' : 'non'}"]`);
      if(r){ r.checked = true; n++; }
    }else if(t === 'multi' || t === 'accord'){
      // Rien : choix multiples (santé) et accords se donnent à chaque fois.
    }else if(el.tagName === 'SELECT'){
      if([...el.options].some(o=> o.value === String(v)) && !el.value){ el.value = String(v); n++; }
    }else if(!el.value){ el.value = String(v); n++; }
  });
  const tel = document.getElementById('in-tel'), eq = document.getElementById('in-equipe');
  if(tel && j.tel && !tel.value){ tel.value = j.tel; n++; }
  if(eq && j.club && !eq.value && !eq.closest('.hidden')){ eq.value = j.club; n++; }

  // Bandeau et case « mettre à jour ma fiche ».
  const form = document.getElementById('inscForm');
  let info = document.getElementById('inscFiche');
  if(!info){
    form.insertAdjacentHTML('afterbegin', `<p class="insc-fiche" id="inscFiche"></p>`);
    const docs = document.getElementById('inscDocs');
    docs.insertAdjacentHTML('beforebegin', `<label class="fm-consent insc-maj" id="inscMajFicheL"><input type="checkbox" id="inscMajFiche"><span id="inscMajFicheT"></span></label>`);
    info = document.getElementById('inscFiche');
  }
  const aFiche = Object.keys(j).length > 0;
  info.innerHTML = n ? `${ico('check')}<span>Pré-rempli avec ta <b>fiche joueur</b>. Vérifie avant d'envoyer.</span>` : '';
  info.classList.toggle('hidden', !n);
  const champsFiche = [...zone.querySelectorAll('[data-q]')].some(el=> FJ_TOUS.some(c=> c[0] === el.dataset.q));
  const lbl = document.getElementById('inscMajFicheL');
  lbl.classList.toggle('hidden', !champsFiche);
  document.getElementById('inscMajFiche').checked = !aFiche;
  document.getElementById('inscMajFicheT').textContent = aFiche ? 'Mettre à jour ma fiche joueur avec ces réponses' : 'Enregistrer ces réponses dans ma fiche joueur pour mes prochaines inscriptions';
}

/* Après une inscription réussie : si la case est cochée, on reporte les
   réponses aux questions types dans la fiche (sans données de santé). */
async function fjApresInscription(surMesure){
  const c = document.getElementById('inscMajFiche');
  if(!c || !c.checked || c.closest('.hidden')) return;
  const r = (surMesure && surMesure.reponses) || {};
  const j = Object.assign({}, fjJoueur());
  for(const [k, , type] of FJ_TOUS){
    if(r[k] == null || r[k] === '') continue;
    j[k] = type === 'nombre' ? Number(r[k]) : r[k];
  }
  const tel = document.getElementById('in-tel');
  if(tel && tel.value.trim()) j.tel = tel.value.trim();
  try{ await fjEnregistrer(j); renderFicheJoueur(); }catch(e){ /* l'inscription est passée : la fiche attendra */ }
}
