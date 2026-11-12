/* =========================================================
   EBOK — ADMIN : SIGNALEMENTS
   ---------------------------------------------------------
   Les erreurs signalées par les visiteurs depuis la fiche d'un événement
   (api/signalement.js). Liste dans l'espace admin, avec de quoi corriger la
   fiche, marquer le signalement comme traité ou le supprimer. Leur nombre
   alimente la pastille du lien Admin (js/admin-page.js).

   S'appuie sur js/app.js (esc, libelleMotif, openEvent) et sur
   window.EBOK_DATA (getSignalements, majSignalement, supprimerSignalement),
   exposé par clerk-init.js.
   ========================================================= */
(function(){
  const $ = id => document.getElementById(id);
  const statut = msg => { const el = $('reportStatus'); if(el) el.textContent = msg || ''; };

  function quand(iso){
    const d = new Date(iso);
    if(isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
      + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function carte(s){
    const traite = s.statut === 'traite';
    return `
      <div class="rep-item${traite ? ' is-done' : ''}" data-id="${esc(s.id)}">
        <div class="rep-head">
          <span class="rep-motif">${esc(libelleMotif(s.motif))}</span>
          <span class="rep-meta">${esc(quand(s.createdAt))}, ${s.membre ? 'membre connecté' : 'visiteur'}${traite ? ', traité' : ''}</span>
        </div>
        <p class="rep-title">${esc(s.titre || 'Événement supprimé')}</p>
        ${s.message ? `<p class="rep-msg">${esc(s.message)}</p>` : ''}
        <div class="rep-actions">
          ${s.titre ? `<button class="btn btn-ghost btn-xs" data-rep="voir" data-event="${esc(s.eventId)}">Voir l'événement</button>
          <button class="btn btn-ghost btn-xs" data-edit="${esc(s.eventId)}">Modifier</button>` : ''}
          <button class="btn btn-ghost btn-xs" data-rep="${traite ? 'rouvrir' : 'traiter'}">${traite ? 'Rouvrir' : 'Marquer comme traité'}</button>
          <button class="btn btn-danger btn-xs" data-rep="supprimer">Supprimer</button>
        </div>
      </div>`;
  }

  async function rendre(){
    const box = $('reportList');
    if(!box) return;
    const data = window.EBOK_DATA;
    if(!data || typeof data.getSignalements !== 'function'){
      box.innerHTML = '<p class="maint-desc">Disponible une fois la base connectée.</p>';
      return;
    }
    let r;
    try{ r = await data.getSignalements(); }
    catch(e){ box.innerHTML = '<p class="maint-desc">Impossible de charger les signalements.</p>'; return; }
    const liste = r.signalements || [];
    const ouverts = r.ouverts || 0;
    if(typeof majTableauAdmin === 'function') majTableauAdmin({ signalements: ouverts });
    box.innerHTML = liste.length
      ? `<p class="det-summary"><b>${ouverts}</b> à traiter, ${liste.length - ouverts} traité${liste.length - ouverts > 1 ? 's' : ''}</p>${liste.map(carte).join('')}`
      : '<p class="maint-desc">Aucun signalement pour le moment.</p>';
  }

  async function agir(fn, enCours){
    statut(enCours);
    try{
      await fn();
      statut('');
      await rendre();
    }catch(e){
      statut('⚠️ Action impossible. Réessaie dans un instant.');
    }
  }

  function brancher(){
    const box = $('reportList');
    if(!box || box.dataset.ready) return;
    box.dataset.ready = '1';
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-rep]');
      if(!b) return;
      const action = b.dataset.rep;
      if(action === 'voir'){ openEvent(b.dataset.event); return; }
      const id = b.closest('.rep-item').dataset.id;
      const data = window.EBOK_DATA;
      if(action === 'traiter') agir(() => data.majSignalement(id, 'traite'), '⏳…');
      else if(action === 'rouvrir') agir(() => data.majSignalement(id, 'ouvert'), '⏳…');
      else if(action === 'supprimer'){
        if(!confirm('Supprimer ce signalement ? Cette action est définitive.')) return;
        agir(() => data.supprimerSignalement(id), '⏳…');
      }
    });
  }

  /* Appelée par js/app.js quand l'espace admin s'affiche. */
  window.renderAdminSignalements = function(){
    brancher();
    rendre();
  };
})();
