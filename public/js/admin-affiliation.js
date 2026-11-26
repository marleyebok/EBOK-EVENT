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

  /* Message à l'organisateur : vouvoiement, court, avec le lien de chaque
     fiche. Un organisateur qui a plusieurs fiches reçoit UN seul e-mail qui
     les liste toutes. « [lien personnel] » (ou « [lien personnel ID] » dans un
     message groupé) est remplacé à l'envoi par le lien de récupération de la
     fiche : il l'ouvre, se connecte ou crée son compte, et la fiche passe à
     son nom. L'admin peut retoucher le texte avant l'envoi. */
  const MARQUE = '[lien personnel]';
  const marqueDe = id => `[lien personnel ${id}]`;
  function quandOu(ev){
    const quand = fmtDateRange(ev.dateStart, ev.dateEnd);
    const lieu = [ev.city, ev.region].filter(Boolean).join(', ');
    return quand ? `${quand}${lieu ? ', ' + lieu : ''}` : lieu;
  }
  function suite(pluriel){
    return `Votre compte vous donne aussi accès, gratuitement, aux outils de gestion d'événements d'EBOK :
- inscriptions en ligne, avec validation, liste d'attente et export ;
- formulaire d'inscription sur mesure (questions, catégories, tarifs, options) ;
- collecte et suivi des documents (autorisation parentale, certificat médical…) ;
- messages groupés à vos participants, pointage le jour J par QR code.

Suivez-nous aussi sur Instagram : https://www.instagram.com/ebok.fr/
Pour donner plus de visibilité à ${pluriel ? 'vos événements' : 'votre événement'}, invitez @ebok.fr en collaboration sur vos publications : elles apparaîtront aussi sur notre compte.

Une question, une correction ? Répondez simplement à ce message.

Bien sportivement,
L'équipe EBOK`;
  }
  function message(ev){
    const qo = quandOu(ev);
    return `Bonjour,

Nous avons ajouté votre événement « ${ev.title} »${qo ? ` (${qo})` : ''} sur EBOK, l'agenda collaboratif du basket francophone :
${location.origin}${urlEvenement(ev)}

C'est gratuit, et vous pouvez gérer la fiche vous-même : affiche, horaires, tarifs, liens d'inscription et de billetterie.

Pour la récupérer, ouvrez votre lien personnel (valable 30 jours), puis connectez-vous ou créez votre compte :
${MARQUE}

${suite(false)}`;
  }
  function messageGroupe(evs){
    if(evs.length === 1) return message(evs[0]);
    const liste = evs.map(ev => {
      const qo = quandOu(ev);
      return `• ${ev.title}${qo ? ` (${qo})` : ''}
  Fiche : ${location.origin}${urlEvenement(ev)}
  Pour la récupérer : ${marqueDe(ev.id)}`;
    }).join('\n\n');
    return `Bonjour,

Nous avons ajouté vos ${evs.length} événements sur EBOK, l'agenda collaboratif du basket francophone :

${liste}

C'est gratuit, et vous pouvez gérer chaque fiche vous-même : affiche, horaires, tarifs, liens d'inscription et de billetterie.

Chaque lien personnel est valable 30 jours : ouvrez-le, puis connectez-vous ou créez votre compte, et la fiche passe à votre nom. Utilisez le même compte pour toutes vos fiches.

${suite(true)}`;
  }
  window.messageOrganisateur = message;
  window.messageOrganisateurGroupe = messageGroupe;

  const mailDe = ev => { const m = String((ev && ev.org && ev.org.email) || '').trim(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m) ? m : ''; };
  const jour = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const RAISONS = {
    sans_email: "pas d'e-mail sur la fiche", deja_gere: 'une fiche est déjà gérée par un organisateur', desabonne: 'a demandé à ne plus recevoir de message',
    quota: "limite d'envoi du jour atteinte (80 mails) : réessaie demain", echec: "l'envoi a échoué", introuvable: 'fiche introuvable', vide: 'message vide',
    emails_differents: "les fiches n'ont pas la même adresse",
    organisateur_connu: 'organisateur déjà inscrit : rattache la fiche à son compte (bouton Organisateur)',
  };

  /* Autres fiches du même organisateur (même adresse), encore à prévenir. */
  function autresFiches(ev){
    const mail = mailDe(ev).toLowerCase();
    if(!mail) return [];
    return adminList.filter(x => x.id !== ev.id && mailDe(x).toLowerCase() === mail && aPrevenir(x));
  }
  /* Fiches couvertes par le message de la fenêtre (la fiche + ses sœurs si la case est cochée). */
  function fichesDuMessage(){
    const groupe = $('affilGroupe');
    return groupe && groupe.checked ? [evenement, ...autresFiches(evenement)] : [evenement];
  }
  function majGroupe(){
    const autres = autresFiches(evenement);
    const bloc = $('affilGroupeBloc');
    bloc.classList.toggle('hidden', !autres.length);
    if(autres.length){
      $('affilGroupeTxt').textContent = `Inclure ses ${autres.length} autre${autres.length > 1 ? 's' : ''} fiche${autres.length > 1 ? 's' : ''} à prévenir dans le même mail (${autres.map(x => x.title).join(', ')})`;
    }
    $('affilMessage').value = messageGroupe(fichesDuMessage());
  }

  /* Organisateur déjà rattaché à un compte (une autre de ses fiches) : pas de
     premier message, on rattache directement. Renvoie le compte à proposer. */
  function compteDeLOrganisateur(ev){
    const mail = mailDe(ev).toLowerCase();
    if(!mail || !organisateurConnu(mail)) return null;
    const soeur = adminList.find(x => x.id !== ev.id && mailDe(x).toLowerCase() === mail && x.userId && !(currentUser && x.userId === currentUser.uid));
    return { uid: soeur ? soeur.userId : null };
  }

  function majEtat(){
    const ev = evenement, el = $('affilEtat');
    const connu = !ev.recupere && compteDeLOrganisateur(ev);
    for(const id of ['affilMessage', 'affilCopy', 'affilAide']) $(id).classList.toggle('hidden', !!connu);
    if(connu){
      const u = connu.uid && adminUsersByUid[connu.uid];
      el.textContent = `Cet organisateur a déjà un compte EBOK${u ? ` (${nomMembre(u)})` : ''} : il ne reçoit plus le message de présentation. Rattache cette fiche directement à son compte ci-dessous.`;
      el.classList.remove('hidden');
      $('affilSend').classList.add('hidden');
      $('affilSansMail').classList.add('hidden');
      $('affilGroupeBloc').classList.add('hidden');
      return;
    }
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

  function notePrevenu(ids){
    const le = new Date().toISOString();
    for(const id of ids){ const ev = adminList.find(e => e.id === id); if(ev) ev.prevenu = { le, n: ((ev.prevenu && ev.prevenu.n) || 0) + 1 }; }
  }

  async function envoyerUn(){
    const ev = evenement;
    const etat = $('affilCopied');
    const fiches = fichesDuMessage();
    $('affilSend').disabled = true;
    etat.textContent = 'Envoi…';
    try{
      const envoi = fiches.length > 1 ? { ids: fiches.map(x => x.id), texte: $('affilMessage').value } : { id: ev.id, texte: $('affilMessage').value };
      const r = await window.EBOK_DATA.envoyerAuxOrganisateurs([envoi]);
      if(r.envoyes && r.envoyes.includes(ev.id)){
        notePrevenu(r.envoyes);
        if(!adminList.includes(ev)) ev.prevenu = { le: new Date().toISOString(), n: ((ev.prevenu && ev.prevenu.n) || 0) + 1 };
        etat.textContent = `Message envoyé à ${mailDe(ev)}${r.envoyes.length > 1 ? ` (${r.envoyes.length} fiches dans le même mail)` : ''}.`;
        majEtat();
        $('affilGroupeBloc').classList.add('hidden');
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
    // Le compte présélectionné (organisateur déjà inscrit) reste toujours visible.
    if(choisi && !liste.some(u => u.uid === choisi) && adminUsersByUid[choisi]) liste.unshift(adminUsersByUid[choisi]);
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
    $('affilCopied').textContent = '';
    $('affilCurrent').innerHTML = proprietaireActuel();
    $('affilSearch').value = '';
    $('affilSave').disabled = true;
    $('affilDetach').disabled = false;
    $('affilDetach').classList.toggle('hidden', !ev.userId || (currentUser && ev.userId === currentUser.uid));
    erreur('');
    $('affilGroupe').checked = true;
    majGroupe();
    majEtat();
    // Organisateur déjà inscrit : son compte est présélectionné à l'étape 2.
    const compte = !ev.recupere && compteDeLOrganisateur(ev);
    if(compte && compte.uid && compte.uid !== ev.userId){ choisi = compte.uid; $('affilSave').disabled = false; }
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
      // Confiée à un organisateur : son adresse ne recevra plus le premier message.
      if(uid && !(currentUser && uid === currentUser.uid) && mailDe(evenement)) emailsConnus.add(mailDe(evenement).toLowerCase());
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
    $('affilGroupe').addEventListener('change', majGroupe);
    $('affilCopy').addEventListener('click', async () => {
      let texte = $('affilMessage').value;
      const etat = $('affilCopied');
      const fiches = fichesDuMessage();
      const marques = fiches.map(f => [f.id, fiches.length > 1 ? marqueDe(f.id) : MARQUE]).filter(([, m]) => texte.includes(m));
      if(marques.length){
        try{
          for(const [id, m] of marques){
            const { url } = await window.EBOK_DATA.lienRecuperation(id);
            texte = texte.split(m).join(url);
          }
        }catch(e){
          etat.textContent = e && e.code === 'deja_gere'
            ? 'Cette fiche est déjà gérée par un organisateur : pas de lien de récupération.'
            : e && e.code === 'organisateur_connu' ? 'Cet organisateur a déjà un compte : rattache la fiche directement à son compte.'
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
    const nbMails = new Set(cochees().map(id => mailDe(adminList.find(e => e.id === id)).toLowerCase() || id)).size;
    bouton.textContent = n ? `Envoyer ${nbMails} mail${nbMails > 1 ? 's' : ''} (${n} fiche${n > 1 ? 's' : ''})` : 'Envoyer';
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
      const nbMails = new Set(ids.map(id => mailDe(adminList.find(e => e.id === id)).toLowerCase() || id)).size;
      if(!confirm(`Envoyer ${nbMails} mail${nbMails > 1 ? 's' : ''} pour ${ids.length} fiche${ids.length > 1 ? 's' : ''} ? Un seul mail par organisateur, qui liste toutes ses fiches avec un lien personnel pour chacune, depuis contact@ebok.fr.`)) return;
      const info = $('prevenirInfo');
      $('prevenirEnvoyer').disabled = true;
      info.textContent = 'Envoi en cours…';
      // Un seul mail par organisateur : les fiches sont regroupées par adresse.
      const parAdresse = new Map();
      for(const ev of ids.map(id => adminList.find(e => e.id === id)).filter(Boolean)){
        const k = mailDe(ev).toLowerCase() || ev.id;
        if(!parAdresse.has(k)) parAdresse.set(k, []);
        parAdresse.get(k).push(ev);
      }
      const envois = [...parAdresse.values()].map(evs => evs.length > 1
        ? { ids: evs.map(e => e.id), texte: messageGroupe(evs) }
        : { id: evs[0].id, texte: message(evs[0]) });
      try{
        const r = await window.EBOK_DATA.envoyerAuxOrganisateurs(envois);
        notePrevenu(r.envoyes || []);
        const nb = r.mails || 0, nf = (r.envoyes || []).length;
        const parRaison = {};
        for(const i of r.ignores || []) parRaison[i.raison] = (parRaison[i.raison] || 0) + 1;
        const details = Object.entries(parRaison).map(([k, v]) => `${v} fiche${v > 1 ? 's' : ''} non prévenue${v > 1 ? 's' : ''} (${RAISONS[k] || k})`);
        info.textContent = `${nb} mail${nb > 1 ? 's' : ''} envoyé${nb > 1 ? 's' : ''} (${nf} fiche${nf > 1 ? 's' : ''}).${details.length ? ' ' + details.join(', ') + '.' : ''}`;
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

