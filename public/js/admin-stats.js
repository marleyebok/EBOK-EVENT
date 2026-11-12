/* =========================================================
   EBOK — ADMIN : STATISTIQUES
   ---------------------------------------------------------
   Membres, événements, favoris, visiteurs et fiches consultées, avec leur
   évolution sur la semaine, le mois ou l'année. Les données viennent de
   GET /api/views?stats=1 (lib/stats.js).

   Cinq tuiles (chiffre, évolution par rapport à la période d'avant, petite
   courbe) ; un clic sur une tuile affiche son graphique détaillé, avec
   infobulle au survol et au clavier, et une version tableau. Dessous, trois
   classements : fiches les plus consultées, les plus enregistrées, répartition
   par type.

   Ce qui est mesuré au jour le jour (visiteurs, fiches consultées, favoris)
   commence à la mise en ligne de la mesure : l'écran le dit, et ne calcule pas
   d'évolution sur une période d'avant qu'il n'a pas pu mesurer.

   S'appuie sur window.EBOK_DATA.getStats et sur js/app.js (openEvent).
   ========================================================= */
(function(){
  const $ = id => document.getElementById(id);

  const MESURES = [
    { cle: 'membres', libelle: 'Membres', mode: 'total', graphique: 'Nouveaux membres', mesuree: false },
    { cle: 'evenements', libelle: 'Événements en ligne', mode: 'total', graphique: 'Événements ajoutés', mesuree: false },
    { cle: 'favoris', libelle: 'Favoris', mode: 'total', graphique: 'Favoris ajoutés', mesuree: true },
    { cle: 'visiteurs', libelle: 'Visiteurs', mode: 'periode', graphique: 'Visiteurs', mesuree: true,
      note: 'Un visiteur qui revient un autre jour est compté chaque jour.' },
    { cle: 'vues', libelle: 'Fiches consultées', mode: 'periode', graphique: 'Fiches consultées', mesuree: true,
      note: 'Une fiche compte une fois par visiteur et par jour.' },
  ];
  const PERIODES = {
    semaine: { libelle: 'Semaine', duree: '7 derniers jours', avant: 'semaine précédente', ici: 'cette semaine' },
    mois: { libelle: 'Mois', duree: '30 derniers jours', avant: '30 jours précédents', ici: 'ce mois' },
    annee: { libelle: 'Année', duree: '12 derniers mois', avant: '12 mois précédents', ici: 'cette année' },
  };

  const etat = { periode: 'semaine', mesure: 'membres', donnees: null, tableau: false, erreur: false };

  const somme = a => a.reduce((x, y) => x + y, 0);
  const nombre = n => Number(n).toLocaleString('fr-FR');
  /* Chiffres de tuile : en entier jusqu'à 9 999, puis compacts (12,9 k). */
  const compact = n => n >= 10000 ? (n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k' : nombre(n);
  const date = iso => new Date(iso + 'T12:00:00');
  const jourCourt = iso => date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

  /* Haut d'axe : un nombre pair « rond », pour que le milieu de l'axe soit entier. */
  function hautAxe(max){
    const bases = [2, 4, 6, 8, 10, 12, 16, 20, 24, 30, 40, 50, 60, 80];
    for(let p = 1; p <= 1e9; p *= 10){
      for(const b of bases) if(b * p >= max) return b * p;
    }
    return max;
  }

  function libellePoint(iso){
    const d = date(iso);
    if(etat.donnees.pas === 'mois') return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function libelleAxe(iso, i, n){
    const d = date(iso);
    if(etat.donnees.pas === 'mois') return d.toLocaleDateString('fr-FR', { month: 'short' });
    if(n <= 7) return d.toLocaleDateString('fr-FR', { weekday: 'short' }) + ' ' + d.getDate();
    return (i % 5 === (n - 1) % 5) ? jourCourt(iso) : '';
  }

  /* Évolution par rapport à la période d'avant. */
  function evolution(courant, avant){
    if(courant === 0 && avant === 0) return { sens: 'egal', texte: 'stable' };
    if(avant === 0) return { sens: 'hausse', texte: '+' + nombre(courant) };
    const p = Math.round((courant - avant) / avant * 100);
    if(p === 0) return { sens: 'egal', texte: 'stable' };
    return { sens: p > 0 ? 'hausse' : 'baisse', texte: (p > 0 ? '+' : '−') + Math.abs(p) + ' %' };
  }

  /* La période d'avant est-elle entièrement couverte par les mesures ? */
  function avantMesure(m){
    const d = etat.donnees;
    return !m.mesuree || (d.mesureDepuis && d.mesureDepuis <= d.debutPrecedent);
  }

  function enteteTuile(m){
    const d = etat.donnees, p = PERIODES[d.periode];
    const serie = d.serie[m.cle], dansPeriode = somme(serie), avant = d.precedent[m.cle];
    const valeur = m.mode === 'total'
      ? { membres: d.totaux.membres, evenements: d.totaux.enLigne, favoris: d.totaux.favoris }[m.cle]
      : dansPeriode;
    const sous = m.mode === 'total'
      ? `${dansPeriode > 0 ? '+' : ''}${nombre(dansPeriode)} ${p.ici}`
      : p.duree;
    let evo;
    if(avantMesure(m)){
      const e = evolution(dansPeriode, avant);
      const fleche = e.sens === 'hausse' ? '▲' : e.sens === 'baisse' ? '▼' : '＝';
      evo = `<span class="st-delta is-${e.sens}"><span aria-hidden="true">${fleche}</span> ${e.texte}<span class="st-vs"> vs ${p.avant}</span></span>`;
    }else{
      evo = `<span class="st-vs">${d.mesureDepuis ? 'Mesuré depuis le ' + jourCourt(d.mesureDepuis) : 'Mesure démarrée aujourd\'hui'}</span>`;
    }
    const max = Math.max(...serie, 1);
    const barres = serie.map((v, i) => `<i class="${i === serie.length - 1 ? 'is-now' : ''}" style="height:${Math.max(v / max * 100, v > 0 ? 6 : 0)}%"></i>`).join('');
    return `<button type="button" class="st-tuile${etat.mesure === m.cle ? ' is-actif' : ''}" data-mesure="${m.cle}" aria-pressed="${etat.mesure === m.cle}">
      <span class="st-tuile-libelle">${m.libelle}</span>
      <span class="st-tuile-valeur">${compact(valeur)}</span>
      <span class="st-tuile-sous">${sous}</span>
      <span class="st-tuile-evo">${evo}</span>
      <span class="st-spark" aria-hidden="true" style="--n:${serie.length}">${barres}</span>
    </button>`;
  }

  function graphiqueHtml(){
    const d = etat.donnees, m = MESURES.find(x => x.cle === etat.mesure);
    const serie = d.serie[m.cle], n = serie.length;
    const haut = hautAxe(Math.max(...serie));
    const vide = somme(serie) === 0;
    const titre = `${m.graphique}, ${PERIODES[d.periode].duree}`;
    const fentes = serie.map((v, i) => {
      const lib = libellePoint(d.points[i]);
      return `<div class="st-fente" tabindex="0" role="img" data-i="${i}" aria-label="${lib} : ${nombre(v)}">
        <span class="st-barre" style="height:${v / haut * 100}%"></span></div>`;
    }).join('');
    const axeX = d.points.map((p, i) => `<span>${libelleAxe(p, i, n)}</span>`).join('');
    const lignes = d.points.map((p, i) => `<tr><th scope="row">${libellePoint(p)}</th><td>${nombre(serie[i])}</td></tr>`).join('');
    return `
      <div class="st-graphique">
        <div class="st-graphique-tete">
          <h4>${titre}</h4>
          <button type="button" class="btn btn-ghost btn-xs" id="stBasculer" aria-pressed="${etat.tableau}">${etat.tableau ? 'Voir le graphique' : 'Voir le tableau'}</button>
        </div>
        ${m.note ? `<p class="st-note-mesure">${m.note}</p>` : ''}
        ${etat.tableau
          ? `<table class="st-table"><caption class="sr-only">${titre}</caption><thead><tr><th scope="col">${d.pas === 'mois' ? 'Mois' : 'Jour'}</th><th scope="col">${m.graphique}</th></tr></thead><tbody>${lignes}</tbody></table>`
          : `<div class="st-plan" style="--n:${n}">
              <div class="st-axe-y" aria-hidden="true"><span>${nombre(haut)}</span><span>${nombre(haut / 2)}</span><span>0</span></div>
              <div class="st-zone">
                <div class="st-grille" aria-hidden="true"><i></i><i></i><i></i></div>
                <div class="st-barres" role="group" aria-label="${titre}">${fentes}</div>
                <div class="st-axe-x" aria-hidden="true">${axeX}</div>
                <div class="st-tip" role="status" hidden></div>
                ${vide ? `<p class="st-vide">Aucune donnée sur cette période.</p>` : ''}
              </div>
            </div>`}
      </div>`;
  }

  /* Classement en barres horizontales, une seule couleur : la longueur dit tout. */
  function classementHtml(titre, lignes, avecLien){
    const max = Math.max(...lignes.map(l => l.n), 1);
    const corps = lignes.length
      ? lignes.map(l => `<li>
          <span class="st-rang-nom">${avecLien && l.id ? `<button type="button" class="imp-lien" data-voir="${esc(l.id)}" title="${esc(l.titre)}">${esc(l.titre || 'Sans titre')}</button>` : `<span title="${esc(l.type || l.titre)}">${esc(l.type || l.titre)}</span>`}</span>
          <span class="st-rang-piste" aria-hidden="true"><i style="width:${l.n / max * 100}%"></i></span>
          <b class="st-rang-n">${nombre(l.n)}</b></li>`).join('')
      : '<li class="st-rang-vide">Rien à classer pour le moment.</li>';
    return `<section class="st-classement"><h4>${titre}</h4><ol>${corps}</ol></section>`;
  }

  function dessiner(){
    const racine = $('adminStats');
    const d = etat.donnees;
    const periodes = Object.entries(PERIODES).map(([cle, p]) =>
      `<button type="button" class="st-periode${cle === etat.periode ? ' is-actif' : ''}" data-periode="${cle}" aria-pressed="${cle === etat.periode}">${p.libelle}</button>`).join('');
    const mesureNote = d.mesureDepuis
      ? `Visiteurs, fiches consultées et favoris sont mesurés depuis le ${date(d.mesureDepuis).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}. Les membres et les événements remontent à leur création.`
      : 'La mesure des visiteurs, des fiches consultées et des favoris vient de démarrer. Les membres et les événements remontent à leur création.';
    racine.innerHTML = `
      <div class="st-filtre" role="group" aria-label="Période">${periodes}</div>
      ${etat.erreur ? `<p class="st-erreur" role="alert">Impossible d'actualiser les statistiques : les chiffres ci-dessous sont ceux de la ${PERIODES[d.periode].libelle.toLowerCase() === 'année' ? 'dernière année' : 'dernière ' + PERIODES[d.periode].libelle.toLowerCase()} déjà chargée. Réessaie dans un instant.</p>` : ''}
      <p class="st-note">${mesureNote}</p>
      <div class="st-cadre" id="stCadre">
        <div class="st-tuiles">${MESURES.map(enteteTuile).join('')}</div>
        ${graphiqueHtml()}
        <div class="st-classements">
          ${classementHtml('Fiches les plus consultées', d.classements.vues, true)}
          ${classementHtml('Fiches les plus enregistrées', d.classements.favoris, true)}
          ${classementHtml('Événements en ligne par type', d.classements.types.slice(0, 8), false)}
        </div>
      </div>`;
  }

  async function charger(){
    const racine = $('adminStats');
    if(!window.EBOK_DATA || typeof window.EBOK_DATA.getStats !== 'function'){
      racine.innerHTML = '<p class="maint-desc">Disponible une fois la base connectée.</p>';
      return;
    }
    // Pendant le rechargement, le cadre reste en place, un peu atténué.
    const cadre = $('stCadre'); if(cadre) cadre.classList.add('is-chargement');
    try{
      etat.donnees = await window.EBOK_DATA.getStats(etat.periode);
      etat.erreur = false;
      dessiner();
    }catch(e){
      if(etat.donnees){
        // On garde ce qui est affiché, on remet le sélecteur sur la période affichée et on le dit.
        etat.periode = etat.donnees.periode;
        etat.erreur = true;
        dessiner();
      }
      else racine.innerHTML = '<p class="maint-desc">Impossible de charger les statistiques.</p><div class="maint-actions"><button type="button" class="btn btn-ghost" id="stRessayer">Réessayer</button></div>';
    }
  }

  /* Infobulle : la valeur d'abord, la date ensuite. Texte inséré en textContent. */
  function montrerInfo(fente){
    const tip = document.querySelector('#adminStats .st-tip');
    const d = etat.donnees, i = Number(fente.dataset.i), m = MESURES.find(x => x.cle === etat.mesure);
    tip.replaceChildren();
    const valeur = document.createElement('strong'); valeur.textContent = nombre(d.serie[m.cle][i]);
    const nom = document.createElement('span'); nom.textContent = libellePoint(d.points[i]);
    tip.append(valeur, nom);
    tip.hidden = false;
    const zone = tip.parentElement.getBoundingClientRect(), f = fente.getBoundingClientRect();
    const largeur = tip.offsetWidth;
    let x = f.left - zone.left + f.width / 2 - largeur / 2;
    x = Math.max(0, Math.min(x, zone.width - largeur));
    tip.style.left = x + 'px';
    const hauteurBarre = fente.querySelector('.st-barre').getBoundingClientRect().height;
    tip.style.bottom = Math.min(hauteurBarre + 36, zone.height - tip.offsetHeight - 6) + 'px';
    fente.classList.add('is-survol');
  }
  function cacherInfo(){
    const tip = document.querySelector('#adminStats .st-tip');
    if(tip) tip.hidden = true;
    for(const f of document.querySelectorAll('#adminStats .st-fente.is-survol')) f.classList.remove('is-survol');
  }

  function brancher(){
    const racine = $('adminStats');
    racine.addEventListener('click', e => {
      const periode = e.target.closest('[data-periode]');
      if(periode){ etat.periode = periode.dataset.periode; charger(); return; }
      const tuile = e.target.closest('[data-mesure]');
      if(tuile){ etat.mesure = tuile.dataset.mesure; etat.tableau = false; dessiner(); return; }
      if(e.target.closest('#stBasculer')){ etat.tableau = !etat.tableau; dessiner(); return; }
      if(e.target.closest('#stRessayer')){ charger(); return; }
      const voir = e.target.closest('[data-voir]');
      if(voir) openEvent(voir.dataset.voir);
    });
    racine.addEventListener('pointerover', e => { const f = e.target.closest('.st-fente'); if(f){ cacherInfo(); montrerInfo(f); } });
    racine.addEventListener('pointerleave', cacherInfo);
    racine.addEventListener('focusin', e => { const f = e.target.closest('.st-fente'); if(f){ cacherInfo(); montrerInfo(f); } });
    racine.addEventListener('focusout', e => { if(e.target.closest('.st-fente')) cacherInfo(); });
    racine.addEventListener('keydown', e => { if(e.key === 'Escape') cacherInfo(); });
  }

  /* Appelée par js/admin-page.js quand l'onglet Statistiques s'ouvre. */
  let branche = false;
  window.renderAdminStats = function(){
    const racine = $('adminStats');
    if(!racine) return;
    if(!branche){ branche = true; brancher(); racine.innerHTML = '<p class="maint-desc">Chargement…</p>'; }
    charger();
  };
})();
