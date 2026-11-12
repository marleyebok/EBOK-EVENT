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

  /* Message à l'organisateur : vouvoiement, court, avec le lien de la fiche et
     la marche à suivre. L'admin peut le retoucher avant de l'envoyer. */
  function message(ev){
    const quand = fmtDateRange(ev.dateStart, ev.dateEnd);
    const lieu = [ev.city, ev.region].filter(Boolean).join(', ');
    return `Bonjour,

Nous avons ajouté votre événement « ${ev.title} »${quand ? ` (${quand}${lieu ? ', ' + lieu : ''})` : ''} sur EBOK, l'agenda collaboratif du basket francophone :
${location.origin}/evenement/${ev.id}

Vous pouvez le modifier et le compléter vous-même (affiche, horaires, tarifs, liens d'inscription et de billetterie) :
1. créez un compte gratuit sur ${location.origin}
2. répondez-moi avec l'adresse e-mail de votre compte : je rattache l'événement à ce compte.

Bien sportivement,
L'équipe EBOK`;
  }

  function lienMail(){
    const mail = evenement && evenement.org && evenement.org.email;
    const a = $('affilMail');
    if(!mail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)){ a.classList.add('hidden'); return; }
    const sujet = `Votre événement « ${evenement.title} » est sur EBOK`;
    a.href = `mailto:${encodeURIComponent(mail)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent($('affilMessage').value)}`;
    a.classList.remove('hidden');
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
    lienMail();
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
    $('affilMessage').addEventListener('input', lienMail);
    $('affilCopy').addEventListener('click', async () => {
      const texte = $('affilMessage').value;
      try{
        await navigator.clipboard.writeText(texte);
        $('affilCopied').textContent = 'Message copié.';
      }catch(e){
        // Sans accès au presse-papiers : on sélectionne le texte, il reste à copier.
        $('affilMessage').select();
        $('affilCopied').textContent = 'Sélectionne le texte et copie-le (Ctrl + C).';
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
  brancher();
})();
