/* =========================================================
   EBOK — FICHE ORGANISATEUR + « JE SUIS… » (profil membre)
   ---------------------------------------------------------
   - « Je suis » en tête de « Mon profil » : Joueur, Organisateur ou Autre.
     Joueur → fiche joueur ; Organisateur → fiche organisateur ; Autre → les
     deux. Rangé dans profile.espace ; déduit du rôle choisi à l'inscription
     tant qu'il n'a pas été choisi ici.
   - Fiche organisateur : structure, téléphone, e-mail, site, réseaux, salle
     habituelle (nom, adresse, ville). Clés du profil : orgname, orgtel,
     orgemail, orgsite, orginsta, orglinkedin (déjà utilisées par la
     publication) + orgsalle, orgadresse, orgville.
   - Publication : case « Pré-remplir avec ma fiche organisateur », qui remplit
     les champs vides (contact + lieu) ; la décocher vide ce qu'elle a rempli.
   ========================================================= */

const FO_CHAMPS = [
  ['La structure', [
    ['orgname', 'Nom de la structure ou de l\'organisateur', 'texte', 'Ex. Ligue C by Courtcuts', true],
    ['orgtel', 'Téléphone', 'tel', '06 00 00 00 00'],
    ['orgemail', 'E-mail de contact', 'email', 'contact@…'],
    ['orgsite', 'Site web', 'url', 'https://…'],
    ['orginsta', 'Instagram', 'texte', '@moncompte'],
    ['orglinkedin', 'LinkedIn', 'url', 'https://linkedin.com/…'],
  ]],
  ['Ta salle habituelle', [
    ['orgsalle', 'Nom de la salle', 'texte', 'Ex. Gymnase Jean Bouin', true],
    ['orgadresse', 'Adresse', 'texte', 'Ex. 12 rue du Stade, 34000 Montpellier', true],
    ['orgville', 'Ville', 'texte', 'Ex. Montpellier'],
  ]],
];
const FO_TOUS = FO_CHAMPS.flatMap(([, l])=> l);
const FO_ESPACES = [['joueur', 'Joueur'], ['organisateur', 'Organisateur'], ['autre', 'Autre']];

function foProfil(){ return (typeof currentProfile !== 'undefined' && currentProfile) || {}; }
function foEspace(){
  const p = foProfil();
  if(['joueur', 'organisateur', 'autre'].includes(p.espace)) return p.espace;
  if(p.role === 'Joueur') return 'joueur';
  if(['Organisateur', 'Club', 'Ligue', 'Entreprise', 'Coach'].includes(p.role)) return 'organisateur';
  return 'autre';
}
function foARempli(){ const p = foProfil(); return FO_TOUS.some(([k])=> p[k]); }

/* ---------- Affichage dans « Mon profil » ---------- */
function renderFicheOrga(){
  const box = document.getElementById('ficheOrgaResume');
  if(!box) return;
  const p = foProfil();
  // « Je suis » et sections visibles
  const esp = foEspace();
  document.querySelectorAll('#jeSuis input').forEach(i=> i.checked = i.value === esp);
  const fj = document.getElementById('ficheJoueur'), fo = document.getElementById('ficheOrga');
  if(fj) fj.classList.toggle('hidden', esp === 'organisateur');
  if(fo) fo.classList.toggle('hidden', esp === 'joueur');
  // Résumé
  const rows = FO_TOUS.filter(([k])=> p[k]).map(([k, label])=> [label, String(p[k]), k]);
  document.getElementById('btnFicheOrga').textContent = rows.length ? 'Modifier ma fiche' : 'Remplir ma fiche';
  if(!rows.length){
    box.innerHTML = `<p class="about-empty">Remplis-la une fois : à chaque nouvel événement, coche « Pré-remplir avec ma fiche organisateur » et tes coordonnées et ta salle sont déjà là.</p>`;
    return;
  }
  box.innerHTML = rows.map(([k, v, cle])=> (cle === 'orgsite' || cle === 'orglinkedin') && /^https?:\/\//i.test(v)
    ? `<div class="about-item"><span class="about-k">${esc(k)}</span><a class="about-v" href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(v.replace(/^https?:\/\/(www\.)?/i, ''))}</a></div>`
    : `<div class="about-item"><span class="about-k">${esc(k)}</span><span class="about-v">${esc(v)}</span></div>`).join('');
}

(function initFicheOrga(){
  const about = document.getElementById('profileAbout');
  if(!about) return;
  // « Je suis » : juste sous l'en-tête du profil.
  const head = document.querySelector('#page-profile .profile-head');
  head.insertAdjacentHTML('afterend', `
    <div class="profile-section je-suis">
      <fieldset id="jeSuis"><legend>Je suis</legend>
        <div class="je-suis-choix">${FO_ESPACES.map(([v, l])=> `<label class="chip-check je-suis-opt"><input type="radio" name="jeSuis" value="${v}"><span>${l}</span></label>`).join('')}</div>
      </fieldset>
      <p class="section-hint" id="jeSuisAide">Ça décide de la fiche qu'on te propose : joueur (pré-remplit tes inscriptions), organisateur (pré-remplit tes événements), ou les deux.</p>
    </div>`);
  // Fiche organisateur : après la fiche joueur.
  const apres = document.getElementById('ficheJoueur') || about.closest('.profile-section');
  apres.insertAdjacentHTML('afterend', `
    <div class="profile-section" id="ficheOrga">
      <div class="profile-section-head">
        <h3>Ma fiche organisateur</h3>
        <button class="btn btn-ghost" id="btnFicheOrga">Remplir ma fiche</button>
      </div>
      <p class="section-hint">Elle pré-remplit tes événements : coordonnées, site, réseaux et ta salle habituelle. Le nom, les réseaux et le site s'affichent sur les fiches que tu publies.</p>
      <div class="about-grid" id="ficheOrgaResume"></div>
    </div>`);
  document.body.insertAdjacentHTML('beforeend', `
    <div class="edit-modal" id="ficheOrgaModal" role="dialog" aria-modal="true" aria-labelledby="foTitre" aria-hidden="true">
      <div class="edit-box">
        <button class="edit-close" data-fermer aria-label="Fermer">&times;</button>
        <h3 id="foTitre">Ma fiche organisateur</h3>
        <p class="edit-sub">Tout est facultatif. Tu pourras toujours modifier un champ au moment de publier.</p>
        <form id="ficheOrgaForm" novalidate>
          ${FO_CHAMPS.map(([titre, champs])=> `<fieldset class="fj-groupe"><legend>${esc(titre)}</legend><div class="form-grid fj-grille">${champs.map(([k, label, type, ph, large])=>
            `<div class="field${large ? ' fj-large' : ''}"><label for="fo-${k}">${esc(label)}</label><input type="${type === 'texte' ? 'text' : type}" id="fo-${k}" data-fo="${k}" maxlength="200" placeholder="${esc(ph || '')}"></div>`).join('')}</div></fieldset>`).join('')}
          <p class="form-error hidden" id="foErreur"></p>
          <div class="edit-actions"><button type="button" class="btn btn-ghost" data-fermer>Annuler</button><button type="submit" class="btn btn-primary" id="foValider">Enregistrer</button></div>
        </form>
      </div>
    </div>`);

  const modal = document.getElementById('ficheOrgaModal');
  const form = document.getElementById('ficheOrgaForm');
  const fermer = ()=> fermerModale('ficheOrgaModal');
  modal.querySelectorAll('[data-fermer]').forEach(b=> b.addEventListener('click', fermer));
  modal.addEventListener('click', e=>{ if(e.target === modal) fermer(); });
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && modal.classList.contains('open')) fermer(); });
  document.getElementById('btnFicheOrga').addEventListener('click', ()=>{
    if(!currentUser){ openAuth('login'); return; }
    const p = foProfil();
    form.querySelectorAll('[data-fo]').forEach(i=> i.value = p[i.dataset.fo] || '');
    if(!form.querySelector('#fo-orgemail').value && currentUser.email) form.querySelector('#fo-orgemail').placeholder = currentUser.email;
    document.getElementById('foErreur').classList.add('hidden');
    ouvrirModale('ficheOrgaModal');
    setTimeout(()=> document.getElementById('fo-orgname').focus(), 50);
  });
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const btn = document.getElementById('foValider'), err = document.getElementById('foErreur');
    const data = {};
    form.querySelectorAll('[data-fo]').forEach(i=> data[i.dataset.fo] = i.value.trim());
    data.orginsta = data.orginsta.replace(/^@/, '');
    for(const k of ['orgsite', 'orglinkedin']){
      if(data[k] && !/^https?:\/\//i.test(data[k])) data[k] = 'https://' + data[k];
    }
    btn.disabled = true; btn.textContent = 'Enregistrement…'; err.classList.add('hidden');
    try{
      await window.EBOK_DATA.updateUserProfile(currentUser.uid, data);
      currentProfile = Object.assign({}, currentProfile || {}, data);
      fermer(); renderFicheOrga(); foMajCasePublication();
    }catch(e2){ err.textContent = 'Enregistrement impossible. Réessaie.'; err.classList.remove('hidden'); }
    finally{ btn.disabled = false; btn.textContent = 'Enregistrer'; }
  });
  document.querySelectorAll('#jeSuis input').forEach(i=> i.addEventListener('change', async ()=>{
    if(!currentUser) return;
    currentProfile = Object.assign({}, currentProfile || {}, { espace: i.value });
    renderFicheOrga();
    try{ await window.EBOK_DATA.updateUserProfile(currentUser.uid, { espace: i.value }); }catch(e){ /* le choix reste affiché */ }
  }));

  // Case « Pré-remplir » dans le formulaire de publication (première étape).
  const depart = document.querySelector('#createForm [data-step="depart"]');
  if(depart){
    const aide = depart.querySelector('.wz-help');
    (aide || depart.lastElementChild).insertAdjacentHTML(aide ? 'afterend' : 'beforeend', `
      <div class="fo-prefill hidden" id="foPrefill">
        <label class="wz-check"><input type="checkbox" id="c-fiche-orga"><span><b>Pré-remplir avec ma fiche organisateur</b><br><span class="field-hint" id="foPrefillDetail"></span></span></label>
      </div>
      <p class="field-hint fo-prefill-vide hidden" id="foPrefillVide">Astuce : remplis ta <a href="/profil" data-nav="profile">fiche organisateur</a> une fois, tes prochains événements seront pré-remplis (coordonnées, salle).</p>`);
    document.getElementById('c-fiche-orga').addEventListener('change', e=> foAppliquer(e.target.checked));
  }
  renderFicheOrga();
})();

/* Champs de la publication remplis par la fiche (id du champ → valeur). */
function foValeurs(){
  const p = foProfil();
  const adresse = [p.orgsalle, p.orgadresse].filter(Boolean).join(', ');
  return {
    'c-orgname': p.orgname,
    'c-insta': (p.orginsta || (p.socials && p.socials.instagram) || '').replace(/^@/, ''),
    'c-site': p.orgsite,
    'c-tel': p.orgtel,
    'c-email': p.orgemail || (currentUser && currentUser.email) || '',
    'c-adresse': adresse,
    'c-ville': p.orgville,
  };
}
let foRemplis = {};
function foAppliquer(oui){
  const v = foValeurs();
  if(oui){
    for(const [id, val] of Object.entries(v)){
      const el = document.getElementById(id);
      if(el && !el.value && val){ el.value = val; foRemplis[id] = val; }
    }
    // Ville : même chemin qu'une saisie, pour retrouver la région.
    if(foRemplis['c-ville']) document.getElementById('c-ville').dispatchEvent(new Event('change'));
  }else{
    for(const [id, val] of Object.entries(foRemplis)){
      const el = document.getElementById(id);
      if(el && el.value === val) el.value = '';
    }
    foRemplis = {};
  }
}
/* Affiche la case selon la fiche, cochée d'office si elle est remplie. */
function foMajCasePublication(){
  const bloc = document.getElementById('foPrefill');
  if(!bloc) return;
  const connecte = typeof currentUser !== 'undefined' && !!currentUser;
  const rempli = connecte && foARempli();
  bloc.classList.toggle('hidden', !rempli);
  document.getElementById('foPrefillVide').classList.toggle('hidden', !connecte || rempli);
  if(!rempli) return;
  const p = foProfil();
  document.getElementById('foPrefillDetail').textContent = [p.orgname, p.orgtel, p.orgemail, [p.orgsalle, p.orgville].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  const c = document.getElementById('c-fiche-orga');
  if(!c.dataset.branche){ c.dataset.branche = '1'; c.addEventListener('change', ()=> c.dataset.touche = '1'); }
  if(!c.dataset.touche) c.checked = true;
  if(c.checked) foAppliquer(true);
}
