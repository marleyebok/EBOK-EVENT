/* =========================================================
   EBOK — ADMIN : PRÉVENIR L'ORGANISATEUR ET AFFILIER SON ÉVÉNEMENT
   ---------------------------------------------------------
   Le cas : l'admin publie un événement pour un organisateur. Il lui écrit
   pour le prévenir ; l'organisateur crée un compte ; l'admin rattache alors
   l'événement à ce compte, et l'organisateur le gère lui-même (Mes événements,
   bouton Modifier).

   La fenêtre « Organisateur » de la liste admin fait les deux temps :
     1. un message prêt à copier (ou à envoyer, si l'événement a un e-mail de
        contact), modifiable avant l'envoi ;
     2. le choix du membre à qui rattacher l'événement. Côté serveur, seul
        l'admin peut changer le propriétaire d'un événement (api/events.js).

   S'appuie sur js/app.js (adminList, loadAdminUsers, adminUsersByUid, esc,
   fmtDateRange, afficherAdminEvenements, rafraichirVues) et sur
   window.EBOK_DATA.updateEvent.
   ========================================================= */
(function(){
  const $ = id => document.getElementById(id);
  let evenement = null;       // fiche en cours
  let choisi = null;          // uid du membre sélectionné
  let ouvreur = null;         // bouton qui a ouvert la fenêtre (le focus y revient)

  function nomMembre(u){ return (u && (u.pseudo || u.name || u.email)) || 'Membre'; }

  /* Message à l'organisateur : vouvoiement, court, avec le lien de la fiche.
     « [lien personnel] » est remplacé à l'envoi (ou à la copie) par son lien
     de récupération : il l'ouvre, crée son compte, et la fiche passe à son
     nom. L'admin peut retoucher le texte avant l'envoi. */
  const MARQUE = '[lien personnel]';
  function message(ev){
    const quand = fmtDateRange(ev.dateStart, ev.dateEnd);
    const lieu = [ev.city, ev.region].filter(Boolean).join(', ');
    return `Bonjour,

Nous avons ajouté votre événement « ${ev.title} »${quand ? ` (${quand}${lieu ? ', ' + lieu : ''})` : ''} sur EBOK, l'agenda collaboratif du basket francophone :
${location.origin}${urlEvenement(ev)}

C'est gratuit, et vous pouvez gérer la fiche vous-même : affiche, horaires, tarifs, liens d'inscription et de billetterie, et même les inscriptions de vos participants.

Pour la récupérer, ouvrez votre lien personnel (valable 30 jours), puis connectez-vous ou créez votre compte :
${MARQUE}

Une question, une correction ? Répondez simplement à ce message.

Bien sportivement,
L'équipe EBOK`;
  }
  window.messageOrganisateur = message;

  const mailDe = ev => { const m = String((ev && ev.org && ev.org.email) || '').trim(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m) ? m : ''; };
  const jour = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const RAISONS = {
    sans_email: "pas d'e-mail sur la fiche", deja_gere: 'déjà gérée par un organisateur', desabonne: 'a demandé à ne plus recevoir de message',
    quota: "limite d'envoi du jour atteinte (80) : réessaie demain", echec: "l'envoi a échoué", introuvable: 'fiche introuvable', vide: 'message vide',
  };

  function majEtat(){
    const ev = evenement, el = $('affilEtat');
    const txt = ev.recupere && ev.recupere.le ? `Fiche récupérée par son organisateur le ${jour(ev.recupere.le)}.`
      : ev.prevenu && ev.prevenu.le ? `Organisateur déjà prévenu le ${jour(ev.prevenu.le)}${ev.prevenu.n > 1 ? ` (${ev.prevenu.n} fois)` : ''}. Un nouvel envoi remplace son lien personnel.` : '';
    el.textContent = txt;
    el.classList.toggle('hidden', !txt);
    const mail = mailDe(ev);
    $('affilSend').textContent = mail ? `Envoyer à ${mail}` : 'Envoyer';
    $('affilSend').classList.toggle('hidden', !mail);
    $('affilSend').disabled = false;
    $('affilSansMail').classList.toggle('hidden', !!mail);
  }

  async function envoyerUn(){
    const ev = evenement;
    const etat = $('affilCopied');
    $('affilSend').disabled = true;
    etat.textContent = 'Envoi…';
    try{
      const r = await window.EBOK_DATA.envoyerAuxOrganisateurs([{ id: ev.id, texte: $('affilMessage').value }]);
      if(r.envoyes && r.envoyes.includes(ev.id)){
        ev.prevenu = { le: new Date().toISOString(), n: ((ev.prevenu && ev.prevenu.n) || 0) + 1 };
        etat.textContent = `Message envoyé à ${mailDe(ev)}.`;
        majEtat();
        afficherAdminEvenements();
      }else{
        const raison = (r.ignores && r.ignores[0] && r.ignores[0].raison) || 'echec';
        etat.textContent = `Pas envoyé : ${RAISONS[raison] || raison}.`;
        $('affilSend').disabled = false;
      }
    }catch(e){
      etat.textContent = 'Pas envoyé : réessaie dans un instant.';
      $('affilSend').disabled = false;
    }
  }

  function proprietaireActuel(){
    const ev = evenement;
    if(!ev.userId) return "Cet événement n'est rattaché à aucun compte.";
    if(currentUser && ev.userId === currentUser.uid) return 'Cet événement est géré par ton compte. Tu peux le confier à son organisateur.';
    return `Cet événement est affilié à <b>${esc(nomMembre(adminUsersByUid[ev.userId]))}</b>.`;
  }

  function dessinerMembres(){
    const q = ($('affilSearch').value || '').trim().toLowerCase();
    // Sans recherche : les derniers inscrits d'abord (l'organisateur vient
    // sûrement de créer son compte). Avec : tout le monde.
    let liste = adminUsers.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if(q) liste = liste.filter(u => [u.pseudo, u.name, u.email, u.favClub, u.practice].join(' ').toLowerCase().includes(q));
    else liste = liste.slice(0, 8);
    const boite = $('affilList');
    boite.innerHTML = liste.length
      ? liste.map(u => `<button type="button" class="affil-item${u.uid === choisi ? ' is-selected' : ''}" role="option" aria-selected="${u.uid === choisi}" data-uid="${esc(u.uid)}">
          <b>${esc(nomMembre(u))}</b><span>${esc(u.email || '')}</span></button>`).join('')
      : '<p class="affil-vide">Aucun membre ne correspond. Il n\'a peut-être pas encore créé son compte.</p>';
    if(!q && adminUsers.length > 8) boite.insertAdjacentHTML('beforeend', '<p class="affil-vide">Tape un nom ou une adresse pour chercher parmi les autres membres.</p>');
  }

  function erreur(msg){
    const el = $('affilError');
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
  }

  window.ouvrirAffiliation = async function(id, bouton){
    const ev = adminList.find(e => e.id === id);
    const modale = $('affilModal');
    if(!ev || !modale) return;
    evenement = ev;
    choisi = null;
    ouvreur = bouton || document.activeElement;
    if(!adminUsers.length) await loadAdminUsers();
    $('affilEvent').textContent = ev.title;
    $('affilMessage').value = message(ev);
    $('affilCopied').textContent = '';
    $('affilCurrent').innerHTML = proprietaireActuel();
    $('affilSearch').value = '';
    $('affilSave').disabled = true;
    $('affilDetach').disabled = false;
    $('affilDetach').classList.toggle('hidden', !ev.userId || (currentUser && ev.userId === currentUser.uid));
    erreur('');
    majEtat();
    dessinerMembres();
    modale.classList.add('open');
    modale.setAttribute('aria-hidden', 'false');
    // Le curseur au début du message : sinon le texte s'ouvre défilé jusqu'en bas.
    const champ = $('affilMessage');
    champ.focus();
    champ.setSelectionRange(0, 0);
    champ.scrollTop = 0;
  };

  function fermer(){
    const modale = $('affilModal');
    if(!modale || !modale.classList.contains('open')) return;
    modale.classList.remove('open');
    modale.setAttribute('aria-hidden', 'true');
    if(ouvreur && document.contains(ouvreur)) ouvreur.focus();
    evenement = null;
  }

  async function rattacher(uid){
    erreur('');
    const boutons = [$('affilSave'), $('affilDetach')];
    boutons.forEach(b => { b.disabled = true; });
    const id = evenement.id;
    try{
      await window.EBOK_DATA.updateEvent(id, { userId: uid });
      evenement.userId = uid;
      const local = events.find(e => e.id === id);
      if(local) local.userId = uid;
      ouvreur = null;                 // la liste va être redessinée : l'ancien bouton disparaît
      fermer();
      afficherAdminEvenements();
      // Le focus revient sur le bouton « Organisateur » de la même ligne.
      const bouton = document.querySelector(`[data-affil="${id.replace(/"/g, '')}"]`);
      if(bouton) bouton.focus();
    }catch(e){
      erreur("Impossible d'enregistrer. Réessaie dans un instant.");
      $('affilSave').disabled = !choisi;
      $('affilDetach').disabled = false;
    }
  }

  function brancher(){
    const modale = $('affilModal');
    if(!modale || modale.dataset.ready) return;
    modale.dataset.ready = '1';
    $('affilClose').addEventListener('click', fermer);
    bindBackdropClose(modale, fermer);
    modale.addEventListener('keydown', e => {
      if(e.key === 'Escape'){ fermer(); return; }
      if(e.key !== 'Tab') return;
      const f = Array.from(modale.querySelectorAll('input, textarea, button, a[href]')).filter(x => !x.disabled && x.offsetParent !== null);
      if(!f.length) return;
      const premier = f[0], dernier = f[f.length - 1];
      if(e.shiftKey && document.activeElement === premier){ e.preventDefault(); dernier.focus(); }
      else if(!e.shiftKey && document.activeElement === dernier){ e.preventDefault(); premier.focus(); }
    });
    $('affilSend').addEventListener('click', envoyerUn);
    $('affilCopy').addEventListener('click', async () => {
      let texte = $('affilMessage').value;
      const etat = $('affilCopied');
      if(texte.includes(MARQUE)){
        try{
          const { url } = await window.EBOK_DATA.lienRecuperation(evenement.id);
          texte = texte.split(MARQUE).join(url);
        }catch(e){
          etat.textContent = e && e.code === 'deja_gere'
            ? 'Cette fiche est déjà gérée par un organisateur : pas de lien de récupération.'
            : 'Impossible de créer son lien personnel. Réessaie dans un instant.';
          return;
        }
      }
      try{
        await navigator.clipboard.writeText(texte);
        etat.textContent = 'Message copié, avec son lien personnel.';
      }catch(e){
        // Sans accès au presse-papiers : on affiche le texte final, à copier à la main.
        $('affilMessage').value = texte;
        $('affilMessage').select();
        etat.textContent = 'Sélectionne le texte et copie-le (Ctrl + C).';
      }
    });
    $('affilSearch').addEventListener('input', dessinerMembres);
    $('affilList').addEventListener('click', e => {
      const b = e.target.closest('[data-uid]');
      if(!b) return;
      choisi = b.dataset.uid;
      $('affilSave').disabled = false;
      erreur('');
      dessinerMembres();
    });
    $('affilSave').addEventListener('click', () => { if(choisi) rattacher(choisi); });
    $('affilDetach').addEventListener('click', () => {
      if(confirm("Détacher cet événement de son compte ? L'organisateur ne pourra plus le modifier.")) rattacher(null);
    });
  }
  /* ---- Envoi groupé : filtre « À prévenir » de la liste admin ---- */
  function cochees(){ return [...new Set([...document.querySelectorAll('#adminGrid .prevenir-coche:checked')].map(c => c.dataset.prevenir))]; }
  function majBarre(){
    const n = cochees().length;
    const bouton = $('prevenirEnvoyer');
    bouton.disabled = !n;
    bouton.textContent = n ? `Envoyer à ${n} organisateur${n > 1 ? 's' : ''}` : 'Envoyer';
    const toutes = document.querySelectorAll('#adminGrid .prevenir-coche');
    $('prevenirTout').checked = toutes.length > 0 && [...toutes].every(c => c.checked);
  }
  function brancherGroupe(){
    const filtre = $('adminAPrevenir');
    if(!filtre || filtre.dataset.ready) return;
    filtre.dataset.ready = '1';
    filtre.addEventListener('change', () => {
      adminModePrevenir = filtre.checked;
      $('prevenirBar').classList.toggle('hidden', !filtre.checked);
      $('prevenirInfo').textContent = '';
      afficherAdminEvenements();
      majBarre();
    });
    $('prevenirTout').addEventListener('change', e => {
      document.querySelectorAll('#adminGrid .prevenir-coche').forEach(c => { c.checked = e.target.checked; });
      majBarre();
    });
    document.addEventListener('change', e => { if(e.target.classList && e.target.classList.contains('prevenir-coche')) majBarre(); });
    $('prevenirEnvoyer').addEventListener('click', async () => {
      const ids = cochees();
      if(!ids.length) return;
      if(!confirm(`Envoyer le message de présentation à ${ids.length} organisateur${ids.length > 1 ? 's' : ''} ? Chacun reçoit son message personnalisé, avec son lien personnel, depuis contact@ebok.fr.`)) return;
      const info = $('prevenirInfo');
      $('prevenirEnvoyer').disabled = true;
      info.textContent = 'Envoi en cours…';
      const envois = ids.map(id => adminList.find(e => e.id === id)).filter(Boolean).map(ev => ({ id: ev.id, texte: message(ev) }));
      try{
        const r = await window.EBOK_DATA.envoyerAuxOrganisateurs(envois);
        const le = new Date().toISOString();
        for(const id of r.envoyes || []){ const ev = adminList.find(e => e.id === id); if(ev) ev.prevenu = { le, n: ((ev.prevenu && ev.prevenu.n) || 0) + 1 }; }
        const nb = (r.envoyes || []).length;
        const parRaison = {};
        for(const i of r.ignores || []) parRaison[i.raison] = (parRaison[i.raison] || 0) + 1;
        const details = Object.entries(parRaison).map(([k, v]) => `${v} non envoyé${v > 1 ? 's' : ''} (${RAISONS[k] || k})`);
        info.textContent = `${nb} message${nb > 1 ? 's' : ''} envoyé${nb > 1 ? 's' : ''}.${details.length ? ' ' + details.join(', ') + '.' : ''}`;
      }catch(e){
        info.textContent = "L'envoi a échoué. Réessaie dans un instant.";
      }
      afficherAdminEvenements();
      majBarre();
    });
  }

  brancher();
  brancherGroupe();
})();

