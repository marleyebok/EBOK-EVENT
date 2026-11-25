/* =========================================================
   EBOK — FORMULAIRE D'INSCRIPTION SUR MESURE (côté navigateur)
   ---------------------------------------------------------
   - fmEditeur()      : l'organisateur coche des questions types et ajoute
                        ses questions (texte, choix unique, choix multiples,
                        oui / non), règle équipes, tarifs, logistique, pointage.
   - fmChamps()       : le formulaire présenté au participant.
   - fmLire()         : lit les réponses du participant.
   - fmReponsesHtml() : les réponses d'un inscrit, côté organisateur.
   Le serveur (lib/formulaire.js) revérifie tout.
   ========================================================= */

const FM_TYPES = {
  naissance:   { label: 'Date de naissance', type: 'date' },
  categorie:   { label: 'Catégorie', type: 'choix' },
  taille:      { label: 'Taille (cm)', type: 'nombre' },
  poste:       { label: 'Poste', type: 'choix' },
  niveau:      { label: 'Niveau', type: 'choix' },
  club:        { label: 'Club actuel', type: 'texte' },
  licence:     { label: 'Numéro de licence', type: 'texte' },
  maillot:     { label: 'Taille de maillot', type: 'choix' },
  allergies:   { label: 'Allergies ou intolérances', type: 'texte', sensible: true },
  regime:      { label: 'Régime alimentaire', type: 'multi', sensible: true },
  responsable: { label: 'Responsable légal (pour un mineur)', type: 'contact' },
  urgence:     { label: "Contact en cas d'urgence", type: 'contact' },
};
const FM_LIBRES = { texte: 'Réponse libre', choix: 'Choix unique', multi: 'Choix multiples', ouinon: 'Oui / non' };
const PAIEMENT = { a_payer: 'À payer', partiel: 'Partiel', paye: 'Payé', offert: 'Offert' };
const euros = n=> (Number(n) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: (Number(n) % 1 ? 2 : 0) });
const fmId = ()=> 'q' + Math.random().toString(36).slice(2, 9);

/* ---------------- Éditeur (réglages de l'organisateur) ---------------- */
function fmLigneLibre(q = { id: fmId(), label: '', type: 'texte', options: [], obligatoire: false }){
  return `
    <div class="fm-q" data-qid="${esc(q.id)}">
      <div class="fm-q-top">
        <input type="text" class="fm-q-label" maxlength="140" placeholder="Ta question, ex. As-tu déjà participé au camp ?" value="${esc(q.label)}" aria-label="Question">
        <select class="fm-q-type od-select" aria-label="Type de réponse">${Object.entries(FM_LIBRES).map(([k, l])=> `<option value="${k}" ${q.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <textarea class="fm-q-options" rows="3" placeholder="Une réponse possible par ligne" aria-label="Réponses possibles" ${q.type === 'choix' || q.type === 'multi' ? '' : 'hidden'}>${esc((q.options || []).join('\n'))}</textarea>
      <div class="fm-q-bas">
        <label class="fm-oblig"><input type="checkbox" class="fm-q-oblig" ${q.obligatoire ? 'checked' : ''}>Obligatoire</label>
        <span class="fm-q-move"><button type="button" class="btn btn-ghost btn-sm" data-monter aria-label="Monter">↑</button><button type="button" class="btn btn-ghost btn-sm" data-descendre aria-label="Descendre">↓</button>
        <button type="button" class="btn btn-ghost btn-sm" data-retirer-q aria-label="Retirer la question">${ico('trash')}</button></span>
      </div>
    </div>`;
}

function fmEditeur(reg){
  const choisis = new Map(reg.questions.filter(q=> q.preset).map(q=> [q.preset, q]));
  const libres = reg.questions.filter(q=> !q.preset);
  const ligneTarif = (t = {}, cls)=> `<div class="fm-tarif ${cls}" data-tid="${esc(t.id || '')}"><input type="text" class="fm-t-nom" maxlength="80" placeholder="${cls === 'is-opt' ? 'Ex. Navette depuis la gare' : 'Ex. Semaine complète'}" value="${esc(t.nom || '')}" aria-label="Nom"><label class="fm-prix"><input type="number" class="fm-t-prix" min="0" step="0.5" value="${t.prix != null ? t.prix : ''}" placeholder="0" aria-label="Prix">€</label><button type="button" class="btn btn-ghost btn-sm" data-retirer-t aria-label="Retirer">${ico('trash')}</button></div>`;
  return `
    <fieldset class="od-field"><legend>Formulaire d'inscription</legend>
      <p class="field-hint">Coche les questions à poser. Le nom, l'e-mail, le téléphone et le message sont toujours demandés.</p>
      <div class="fm-presets">${Object.entries(FM_TYPES).map(([k, p])=> `
        <div class="fm-preset">
          <label><input type="checkbox" data-preset="${k}" ${choisis.has(k) ? 'checked' : ''}>${esc(p.label)}${p.sensible ? ' <span class="fm-sensible" title="Donnée sensible : le participant donne son accord explicite">sensible</span>' : ''}</label>
          <label class="fm-oblig"><input type="checkbox" data-preset-oblig="${k}" ${choisis.get(k) && choisis.get(k).obligatoire ? 'checked' : ''}>Obligatoire</label>
        </div>`).join('')}</div>
      <h4 class="ins-h">Tes questions</h4>
      <div id="fmLibres">${libres.map(q=> fmLigneLibre(q)).join('')}</div>
      <button type="button" class="btn btn-ghost btn-sm" id="fmAjoutQ">${ico('plus')}Ajouter une question</button>
    </fieldset>

    <fieldset class="od-field"><legend>Inscription d'équipe</legend>
      <label class="od-switch od-switch-flat"><input type="checkbox" id="fmEquipe" ${reg.equipes.active ? 'checked' : ''}><span><b>Un capitaine inscrit son équipe</b><em>Il donne le nom de l'équipe et la liste des joueurs.</em></span></label>
      <div class="form-grid"><div class="field"><label for="fmMin">Joueurs minimum</label><input type="number" id="fmMin" min="1" max="30" value="${reg.equipes.min}"></div>
      <div class="field"><label for="fmMax">Joueurs maximum</label><input type="number" id="fmMax" min="1" max="30" value="${reg.equipes.max}"></div></div>
    </fieldset>

    <fieldset class="od-field"><legend>Tarifs et options</legend>
      <p class="field-hint">À titre informatif : EBOK n'encaisse rien. Le participant voit le montant, et tu suis les paiements dans la liste.</p>
      <div id="fmTarifs">${reg.tarifs.map(t=> ligneTarif(t, 'is-tarif')).join('')}</div>
      <button type="button" class="btn btn-ghost btn-sm" id="fmAjoutTarif">${ico('plus')}Ajouter un tarif</button>
      <h4 class="ins-h">Options</h4>
      <div id="fmOptions">${reg.options.map(t=> ligneTarif(t, 'is-opt')).join('')}</div>
      <button type="button" class="btn btn-ghost btn-sm" id="fmAjoutOpt">${ico('plus')}Ajouter une option</button>
    </fieldset>

    <fieldset class="od-field"><legend>Camp : repas, hébergement, groupes</legend>
      <label class="od-switch od-switch-flat"><input type="checkbox" id="fmRepas" ${reg.logistique.repas ? 'checked' : ''}><span><b>Demander la formule de repas</b></span></label>
      <div class="field"><label for="fmFormules">Formules proposées <span class="field-hint">(séparées par des virgules)</span></label><input type="text" id="fmFormules" value="${esc(reg.logistique.formules.join(', '))}"></div>
      <label class="od-switch od-switch-flat"><input type="checkbox" id="fmHeberg" ${reg.logistique.hebergement ? 'checked' : ''}><span><b>Demander pensionnaire ou externe</b></span></label>
      <div class="field"><label for="fmChambres">Chambres, dortoirs ou étapes <span class="field-hint">(séparés par des virgules)</span></label><input type="text" id="fmChambres" value="${esc(reg.logistique.chambres.join(', '))}" placeholder="Ex. Chambre 1, Chambre 2, Dortoir A"></div>
      <div class="field"><label for="fmGroupes">Groupes <span class="field-hint">(séparés par des virgules)</span></label><input type="text" id="fmGroupes" value="${esc(reg.logistique.groupes.join(', '))}" placeholder="Ex. U13, U15, Groupe Élite"></div>
    </fieldset>

    <fieldset class="od-field"><legend>Jour J et rappels</legend>
      <label class="od-switch od-switch-flat"><input type="checkbox" id="fmPointage" ${reg.pointage.active ? 'checked' : ''}><span><b>Pointer les présences</b><em>Une liste à cocher à l'arrivée, dans l'onglet « Jour J ».</em></span></label>
      <label class="od-switch od-switch-flat"><input type="checkbox" id="fmQr" ${reg.pointage.qr ? 'checked' : ''}><span><b>Avec un QR code</b><em>Chaque inscrit validé reçoit un QR code dans « Mes inscriptions » ; tu le scannes avec l'appareil photo de ton téléphone.</em></span></label>
      <label class="od-switch od-switch-flat"><input type="checkbox" id="fmRappel" ${reg.rappelVeille ? 'checked' : ''}><span><b>Rappel automatique la veille</b><em>Un e-mail aux inscrits validés la veille de l'événement.</em></span></label>
    </fieldset>`;
}
function fmBrancherEditeur(racine){
  const libres = racine.querySelector('#fmLibres');
  const brancher = ()=>{
    libres.querySelectorAll('.fm-q').forEach(q=>{
      q.querySelector('.fm-q-type').onchange = e=>{ q.querySelector('.fm-q-options').hidden = !['choix', 'multi'].includes(e.target.value); };
      q.querySelector('[data-retirer-q]').onclick = ()=> q.remove();
      q.querySelector('[data-monter]').onclick = ()=>{ if(q.previousElementSibling) q.parentNode.insertBefore(q, q.previousElementSibling); };
      q.querySelector('[data-descendre]').onclick = ()=>{ if(q.nextElementSibling) q.parentNode.insertBefore(q.nextElementSibling, q); };
    });
    racine.querySelectorAll('[data-retirer-t]').forEach(b=> b.onclick = ()=> b.closest('.fm-tarif').remove());
  };
  brancher();
  racine.querySelector('#fmAjoutQ').addEventListener('click', ()=>{
    libres.insertAdjacentHTML('beforeend', fmLigneLibre());
    brancher(); libres.lastElementChild.querySelector('input').focus();
  });
  const ajoutTarif = (zone, cls)=>{
    racine.querySelector(zone).insertAdjacentHTML('beforeend', `<div class="fm-tarif ${cls}" data-tid=""><input type="text" class="fm-t-nom" maxlength="80" placeholder="${cls === 'is-opt' ? 'Ex. Navette depuis la gare' : 'Ex. Semaine complète'}" aria-label="Nom"><label class="fm-prix"><input type="number" class="fm-t-prix" min="0" step="0.5" placeholder="0" aria-label="Prix">€</label><button type="button" class="btn btn-ghost btn-sm" data-retirer-t aria-label="Retirer">${ico('trash')}</button></div>`);
    brancher(); racine.querySelector(zone).lastElementChild.querySelector('input').focus();
  };
  racine.querySelector('#fmAjoutTarif').addEventListener('click', ()=> ajoutTarif('#fmTarifs', 'is-tarif'));
  racine.querySelector('#fmAjoutOpt').addEventListener('click', ()=> ajoutTarif('#fmOptions', 'is-opt'));
}
function fmLireEditeur(racine){
  const virgules = id=> racine.querySelector(id).value.split(',').map(x=> x.trim()).filter(Boolean);
  const presets = [...racine.querySelectorAll('[data-preset]:checked')].map(c=> ({ preset: c.dataset.preset, obligatoire: racine.querySelector(`[data-preset-oblig="${c.dataset.preset}"]`).checked }));
  const libres = [...racine.querySelectorAll('#fmLibres .fm-q')].map(q=> ({
    id: q.dataset.qid, label: q.querySelector('.fm-q-label').value, type: q.querySelector('.fm-q-type').value,
    options: q.querySelector('.fm-q-options').value.split('\n').map(x=> x.trim()).filter(Boolean), obligatoire: q.querySelector('.fm-q-oblig').checked,
  })).filter(q=> q.label.trim());
  const tarifs = sel=> [...racine.querySelectorAll(sel)].map(r=> ({ id: r.dataset.tid, nom: r.querySelector('.fm-t-nom').value, prix: r.querySelector('.fm-t-prix').value })).filter(t=> t.nom.trim());
  return {
    questions: [...presets, ...libres],
    equipes: { active: racine.querySelector('#fmEquipe').checked, min: racine.querySelector('#fmMin').value, max: racine.querySelector('#fmMax').value },
    tarifs: tarifs('#fmTarifs .fm-tarif'), options: tarifs('#fmOptions .fm-tarif'),
    logistique: { repas: racine.querySelector('#fmRepas').checked, formules: virgules('#fmFormules'), hebergement: racine.querySelector('#fmHeberg').checked, chambres: virgules('#fmChambres'), groupes: virgules('#fmGroupes') },
    pointage: { active: racine.querySelector('#fmPointage').checked, qr: racine.querySelector('#fmQr').checked },
    rappelVeille: racine.querySelector('#fmRappel').checked,
  };
}

/* ---------------- Formulaire du participant ---------------- */
function fmChamp(q){
  const id = `fq-${q.id}`, oblig = q.obligatoire ? ' <span class="fm-req" aria-hidden="true">*</span>' : ' <span class="field-hint">(facultatif)</span>';
  const req = q.obligatoire ? 'required' : '';
  switch(q.type){
    case 'date': return `<div class="field"><label for="${id}">${esc(q.label)}${oblig}</label><input type="date" id="${id}" data-q="${esc(q.id)}" ${req}></div>`;
    case 'nombre': return `<div class="field"><label for="${id}">${esc(q.label)}${oblig}</label><input type="number" id="${id}" data-q="${esc(q.id)}" min="0" max="300" ${req}></div>`;
    case 'choix': return `<div class="field"><label for="${id}">${esc(q.label)}${oblig}</label><select id="${id}" data-q="${esc(q.id)}" ${req}><option value="">Choisis</option>${q.options.map(o=> `<option>${esc(o)}</option>`).join('')}</select></div>`;
    case 'multi': return `<fieldset class="field fm-multi" data-q="${esc(q.id)}" data-type="multi"><legend>${esc(q.label)}${oblig}</legend><div class="fm-cases">${q.options.map(o=> `<label class="chip chip-check"><input type="checkbox" value="${esc(o)}">${esc(o)}</label>`).join('')}</div></fieldset>`;
    case 'ouinon': return `<fieldset class="field" data-q="${esc(q.id)}" data-type="ouinon"><legend>${esc(q.label)}${oblig}</legend><div class="fm-cases"><label class="chip chip-check"><input type="radio" name="${id}" value="oui">Oui</label><label class="chip chip-check"><input type="radio" name="${id}" value="non">Non</label></div></fieldset>`;
    case 'contact': return `<fieldset class="field fm-contact" data-q="${esc(q.id)}" data-type="contact"><legend>${esc(q.label)}${oblig}</legend><div class="form-grid-3"><input type="text" data-c="nom" placeholder="Nom et prénom" aria-label="Nom et prénom"><input type="tel" data-c="tel" placeholder="Téléphone" aria-label="Téléphone"><input type="email" data-c="email" placeholder="E-mail" aria-label="E-mail"></div></fieldset>`;
    default: return `<div class="field"><label for="${id}">${esc(q.label)}${oblig}</label><input type="text" id="${id}" data-q="${esc(q.id)}" maxlength="500" ${req}></div>`;
  }
}
function fmChamps(etat){
  const parts = [];
  if(etat.equipes && etat.equipes.active){
    parts.push(`<fieldset class="field fm-equipe"><legend>Ton équipe <span class="fm-req">*</span></legend>
      <input type="text" id="fmNomEquipe" maxlength="120" placeholder="Nom de l'équipe" required aria-label="Nom de l'équipe">
      <p class="field-hint">Joueurs : ${etat.equipes.min === etat.equipes.max ? etat.equipes.min : `de ${etat.equipes.min} à ${etat.equipes.max}`}, toi compris si tu joues.</p>
      <div id="fmMembres">${Array.from({ length: etat.equipes.min }, (_, i)=> `<input type="text" class="fm-membre" maxlength="120" placeholder="Joueur ${i + 1} : prénom et nom" aria-label="Joueur ${i + 1}">`).join('')}</div>
      <button type="button" class="btn btn-ghost btn-sm" id="fmPlusMembre" data-max="${etat.equipes.max}">${ico('plus')}Ajouter un joueur</button></fieldset>`);
  }
  for(const q of etat.questions || []) parts.push(fmChamp(q));
  if((etat.tarifs || []).length){
    parts.push(`<fieldset class="field"><legend>Tarif <span class="fm-req">*</span></legend><div class="fm-cases">${etat.tarifs.map((t, i)=> `<label class="chip chip-check"><input type="radio" name="fmTarif" value="${esc(t.id)}" data-prix="${t.prix}" ${i === 0 ? 'checked' : ''}>${esc(t.nom)} · ${euros(t.prix)}</label>`).join('')}</div></fieldset>`);
  }
  if((etat.options || []).length){
    parts.push(`<fieldset class="field"><legend>Options <span class="field-hint">(facultatif)</span></legend><div class="fm-cases">${etat.options.map(o=> `<label class="chip chip-check"><input type="checkbox" name="fmOpt" value="${esc(o.id)}" data-prix="${o.prix}">${esc(o.nom)} · ${euros(o.prix)}</label>`).join('')}</div></fieldset>`);
  }
  if((etat.tarifs || []).length || (etat.options || []).length) parts.push(`<p class="fm-total">Total indicatif : <b id="fmTotal"></b> <span class="field-hint">— le paiement se règle directement avec l'organisateur.</span></p>`);
  const lg = etat.logistique || {};
  if(lg.repas) parts.push(`<div class="field"><label for="fmRepasChoix">Formule de repas</label><select id="fmRepasChoix"><option value="">Choisis</option>${lg.formules.map(f=> `<option>${esc(f)}</option>`).join('')}</select></div>`);
  if(lg.hebergement) parts.push(`<fieldset class="field"><legend>Hébergement</legend><div class="fm-cases"><label class="chip chip-check"><input type="radio" name="fmHeb" value="pensionnaire">Pensionnaire (dort sur place)</label><label class="chip chip-check"><input type="radio" name="fmHeb" value="externe">Externe</label></div></fieldset>`);
  if((etat.questions || []).some(q=> q.sensible)){
    parts.push(`<label class="fm-consent"><input type="checkbox" id="fmConsent"><span>J'accepte que mes réponses sur les <b>allergies</b> et le <b>régime alimentaire</b> soient transmises à l'organisateur, uniquement pour organiser les repas et la sécurité pendant l'événement. Elles sont supprimées au plus tard un an après. <a href="/confidentialite#inscriptions" target="_blank" rel="noopener">En savoir plus</a></span></label>`);
  }
  return parts.join('');
}
function fmBrancherChamps(racine){
  const plus = racine.querySelector('#fmPlusMembre');
  if(plus) plus.addEventListener('click', ()=>{
    const zone = racine.querySelector('#fmMembres'), n = zone.children.length;
    if(n >= +plus.dataset.max) return;
    zone.insertAdjacentHTML('beforeend', `<input type="text" class="fm-membre" maxlength="120" placeholder="Joueur ${n + 1} : prénom et nom" aria-label="Joueur ${n + 1}">`);
    zone.lastElementChild.focus();
    plus.hidden = zone.children.length >= +plus.dataset.max;
  });
  const total = racine.querySelector('#fmTotal');
  const calc = ()=>{ if(!total) return; let s = 0; racine.querySelectorAll('input[name=fmTarif]:checked, input[name=fmOpt]:checked').forEach(i=> s += Number(i.dataset.prix) || 0); total.textContent = euros(s); };
  racine.addEventListener('change', calc); calc();
}
function fmLire(racine){
  const reponses = {};
  racine.querySelectorAll('[data-q]').forEach(el=>{
    const t = el.dataset.type;
    if(t === 'multi'){ const v = [...el.querySelectorAll('input:checked')].map(i=> i.value); if(v.length) reponses[el.dataset.q] = v; }
    else if(t === 'ouinon'){ const v = el.querySelector('input:checked'); if(v) reponses[el.dataset.q] = v.value; }
    else if(t === 'contact'){ const c = {}; el.querySelectorAll('[data-c]').forEach(i=> c[i.dataset.c] = i.value.trim()); if(c.nom || c.tel || c.email) reponses[el.dataset.q] = c; }
    else if(el.value !== '') reponses[el.dataset.q] = el.value;
  });
  const out = { reponses };
  const nomEq = racine.querySelector('#fmNomEquipe');
  if(nomEq){ out.equipe = nomEq.value; out.membres = [...racine.querySelectorAll('.fm-membre')].map(i=> ({ nom: i.value.trim() })).filter(m=> m.nom); }
  const tarif = racine.querySelector('input[name=fmTarif]:checked'); if(tarif) out.tarif = tarif.value;
  out.options = [...racine.querySelectorAll('input[name=fmOpt]:checked')].map(i=> i.value);
  const repas = racine.querySelector('#fmRepasChoix'); if(repas && repas.value) out.repas = repas.value;
  const heb = racine.querySelector('input[name=fmHeb]:checked'); if(heb) out.hebergement = heb.value;
  const consent = racine.querySelector('#fmConsent'); if(consent) out.consentement = consent.checked;
  return out;
}

/* ---------------- Réponses d'un inscrit (organisateur) ---------------- */
function fmValeur(q, v){
  if(v == null || v === '') return '';
  if(q.type === 'multi') return (Array.isArray(v) ? v : [v]).join(', ');
  if(q.type === 'ouinon') return v === 'oui' ? 'Oui' : 'Non';
  if(q.type === 'date'){ const d = new Date(v + 'T00:00'); if(isNaN(d)) return v; const age = Math.floor((Date.now() - d) / 31557600000); return `${d.toLocaleDateString('fr-FR')} (${age} ans)`; }
  if(q.type === 'contact') return [v.nom, v.tel, v.email].filter(Boolean).join(' · ');
  return String(v);
}
function fmReponsesHtml(reg, demande){
  const r = demande.reponses || {}, l = [];
  for(const q of reg.questions){ const v = fmValeur(q, r[q.id]); if(v) l.push(`<dt>${esc(q.label)}</dt><dd>${esc(v)}</dd>`); }
  if(demande.membres && demande.membres.length) l.push(`<dt>Joueurs</dt><dd>${demande.membres.map(m=> esc(m.nom)).join('<br>')}</dd>`);
  const t = reg.tarifs.find(x=> x.id === demande.tarif);
  if(t) l.push(`<dt>Tarif</dt><dd>${esc(t.nom)} · ${euros(t.prix)}</dd>`);
  const opts = reg.options.filter(o=> (demande.options || []).includes(o.id));
  if(opts.length) l.push(`<dt>Options</dt><dd>${opts.map(o=> `${esc(o.nom)} · ${euros(o.prix)}`).join('<br>')}</dd>`);
  if(t || opts.length) l.push(`<dt>Total</dt><dd><b>${euros(fmDu(reg, demande))}</b></dd>`);
  if(demande.repas) l.push(`<dt>Repas</dt><dd>${esc(demande.repas)}</dd>`);
  if(demande.hebergement) l.push(`<dt>Hébergement</dt><dd>${demande.hebergement === 'pensionnaire' ? 'Pensionnaire' : 'Externe'}</dd>`);
  if(demande.consentement) l.push(`<dt>Accord données sensibles</dt><dd>Donné le ${new Date(demande.consentement.le).toLocaleDateString('fr-FR')}</dd>`);
  return l.join('');
}
function fmDu(reg, demande){
  const t = reg.tarifs.find(x=> x.id === demande.tarif);
  return Math.round(((t ? t.prix : 0) + reg.options.filter(o=> (demande.options || []).includes(o.id)).reduce((s, o)=> s + o.prix, 0)) * 100) / 100;
}
