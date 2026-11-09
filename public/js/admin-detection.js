/* =========================================================
   EBOK Event — ADMIN : DÉTECTION AUTOMATIQUE
   ---------------------------------------------------------
   Gère les pages surveillées par la détection (api/detection.js) : ajout,
   retrait, pause, analyse immédiate, et dernier résultat de chacune.
   Les événements détectés apparaissent dans la liste d'administration
   habituelle, en attente, avec le badge « 🤖 Détecté ».

   S'appuie sur js/app.js (esc, safeUrl, renderAdminEvents) et sur
   window.EBOK_DATA (getDetection, detectionAction), exposé par clerk-init.js.
   ========================================================= */
(function(){
  const $ = id => document.getElementById(id);
  const statut = msg => { const el = $('detStatus'); if(el) el.textContent = msg || ''; };

  function quand(iso){
    if(!iso) return 'jamais analysée';
    const d = new Date(iso);
    return 'analysée le ' + d.toLocaleDateString('fr-FR', { day:'numeric', month:'short' })
      + ' à ' + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
  }

  function ligne(s){
    return `
      <div class="det-src${s.actif ? '' : ' is-off'}" data-id="${esc(s.id)}">
        <div class="det-src-body">
          <b>${esc(s.nom || s.url)}</b>
          <a class="det-src-url" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(s.url)}</a>
          <div class="det-src-meta">${esc(quand(s.lastRun))}${s.lastStatus ? ' · ' + esc(s.lastStatus) : ''}${s.totalCrees ? ` · ${s.totalCrees} détecté${s.totalCrees > 1 ? 's' : ''} au total` : ''}</div>
        </div>
        <div class="det-src-actions">
          <button class="btn btn-ghost btn-xs" data-det="analyser">Analyser maintenant</button>
          <button class="btn btn-ghost btn-xs" data-det="activer">${s.actif ? 'Mettre en pause' : 'Réactiver'}</button>
          <button class="btn btn-danger btn-xs" data-det="retirer">Retirer</button>
        </div>
      </div>`;
  }

  async function rendre(){
    const box = $('detSources');
    if(!box) return;
    const data = window.EBOK_DATA;
    if(!data || typeof data.getDetection !== 'function'){
      box.innerHTML = '<p class="maint-desc">Disponible une fois la base connectée.</p>';
      return;
    }
    let r;
    try{ r = await data.getDetection(); }
    catch(e){ box.innerHTML = '<p class="maint-desc">Impossible de charger les sources.</p>'; return; }
    const sources = r.sources || [];
    box.dataset.sources = JSON.stringify(sources.map(s => ({ id: s.id, actif: s.actif })));
    box.innerHTML = `
      <p class="det-summary">${sources.length} page${sources.length > 1 ? 's' : ''} surveillée${sources.length > 1 ? 's' : ''}
        · <b>${r.enAttente || 0}</b> événement${r.enAttente > 1 ? 's' : ''} détecté${r.enAttente > 1 ? 's' : ''} en attente de validation</p>
      ${sources.length ? sources.map(ligne).join('') : '<p class="maint-desc">Aucune page surveillée pour l\'instant. Ajoute l\'agenda d\'une ligue, d\'un comité ou d\'un organisateur ci-dessus.</p>'}`;
  }

  async function agir(body, enCours){
    statut(enCours);
    try{
      const r = await window.EBOK_DATA.detectionAction(body);
      statut(r.resume ? '✅ ' + r.resume : '✅ C\'est fait.');
      await rendre();
      // De nouveaux événements en attente : la liste d'administration suit.
      if(r.crees && typeof renderAdminEvents === 'function') renderAdminEvents();
    }catch(e){
      statut('⚠️ ' + (e.message && !/^http_/.test(e.message) ? e.message : 'Action impossible.'));
    }
  }

  function brancher(){
    const form = $('detAddForm');
    if(!form || form.dataset.ready) return;
    form.dataset.ready = '1';
    form.addEventListener('submit', e => {
      e.preventDefault();
      const url = $('detUrl').value.trim();
      if(!url) return;
      agir({ action: 'ajouter', url, nom: $('detNom').value.trim() }, '⏳ Ajout de la page…')
        .then(() => { $('detUrl').value = ''; $('detNom').value = ''; });
    });
    $('detSources').addEventListener('click', e => {
      const b = e.target.closest('[data-det]');
      if(!b) return;
      const id = b.closest('.det-src').dataset.id;
      const action = b.dataset.det;
      if(action === 'retirer' && !confirm('Ne plus surveiller cette page ? Les événements déjà détectés restent.')) return;
      if(action === 'analyser'){
        b.disabled = true;
        agir({ action, id }, '⏳ Lecture de la page et analyse par l\'IA (20 à 40 s)…').finally(() => { b.disabled = false; });
        return;
      }
      if(action === 'activer'){
        const actif = b.closest('.det-src').classList.contains('is-off');
        agir({ action, id, actif }, '⏳…');
        return;
      }
      agir({ action, id }, '⏳…');
    });
  }

  /* Appelée par js/app.js quand l'espace admin s'affiche. */
  window.renderAdminDetection = function(){
    brancher();
    rendre();
  };
})();
