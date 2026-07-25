/* =========================================================================
   EBOK Galaxy Footer — pied de page commun aux applications EBOK.
   -------------------------------------------------------------------------
   Fichier IDENTIQUE dans chaque repo de la galaxie (event, video, mercato,
   playbook…), comme ebok-galaxy.js. Pour modifier le pied de page partout :
   éditer ce fichier puis recopier la même version dans chaque repo (jusqu'à
   la mise en place d'un paquet partagé `ebok-ui`).

   Intégration : <script src="/ebok-footer.js" defer></script>
   Aucune dépendance. Le pied de page s'ajoute à la fin du <body>.

   Volontairement SANS fond : il hérite de celui du site hôte, pour rester
   lisible aussi bien sur Event (thème sombre) que sur Mercato (thème clair)
   sans imposer une couleur qui jurerait quelque part. Les couleurs de texte
   dérivent de `currentColor`.

   Ne s'affiche pas dans l'espace compte (/compte), où la sidebar occupe
   toute la hauteur : la règle `body:has(.dash)` s'en charge, y compris après
   une navigation côté client (Next.js).

   Pour l'exclure d'une page : <body data-no-ebok-footer>.

   Les logos sont servis depuis le site mère (une seule copie à maintenir).
   ========================================================================= */
(function () {
  'use strict';

  var LOGOS = 'https://ebok.fr/galaxy/';
  var CONTACT = 'contact@ebok.fr';

  /* Logos défilants. Miroir de src/data/tools.ts du site mère. */
  var APPS = [
    { file: 'ebokbasketball.png', name: 'EBOK Basketball' },
    { file: 'ebokevent.png', name: 'EBOK Event' },
    { file: 'ebokacademie.png', name: 'EBOK Académie' },
    { file: 'ebokmercato.png', name: 'EBOK Mercato' },
    { file: 'ebokscouting.png', name: 'EBOK Scouting' },
    { file: 'ebokstats.png', name: 'EBOK Stats' },
    { file: 'ebokplaybook.png', name: 'EBOK Playbook' },
    { file: 'eboknotebook.png', name: 'EBOK Notebook' },
    { file: 'ebokvideo.png', name: 'EBOK Vidéo' },
    { file: 'ebokblog.png', name: 'EBOK Blog' }
  ];

  /* Nom de l'app courante, déduit du sous-domaine (pour la phrase d'accroche). */
  var NAMES = {
    event: 'EBOK Event',
    video: 'EBOK Vidéo',
    mercato: 'EBOK Mercato',
    playbook: 'EBOK Playbook',
    stats: 'EBOK Stats',
    notebook: 'EBOK Notebook',
    academie: 'EBOK Académie',
    scouting: 'EBOK Scouting',
    blog: 'EBOK Blog',
    forum: 'EBOK Forum',
    medias: 'EBOK Médias',
    workout: 'EBOK Workout'
  };

  function currentAppName() {
    var host = String(location.hostname || '');
    var sub = host.split('.')[0];
    if (NAMES[sub]) return NAMES[sub];
    // Déploiements de préadmission (ebok-video.vercel.app…) : on cherche le nom.
    for (var key in NAMES) {
      if (Object.prototype.hasOwnProperty.call(NAMES, key) && host.indexOf(key) !== -1) {
        return NAMES[key];
      }
    }
    return null;
  }

  var CSS = [
    '.ebokf{margin-top:56px;padding:34px 16px 26px;border-top:1px solid currentColor;',
    'border-top-color:color-mix(in srgb, currentColor 16%, transparent);',
    'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-align:center;}',
    /* Repli si color-mix n'est pas supporté : bordure discrète neutre. */
    '@supports not (border-top-color: color-mix(in srgb, currentColor 16%, transparent)){',
    '.ebokf{border-top-color:rgba(128,128,128,.28);}}',
    '.ebokf-lead{font-size:12.5px;letter-spacing:.3px;margin:0 0 16px;opacity:.7;}',
    '.ebokf-home{display:flex;justify-content:center;margin:0 0 26px;opacity:.9;',
    'transition:opacity .2s, transform .2s;}',
    '.ebokf-home:hover{opacity:1;transform:scale(1.03);}',
    '.ebokf-home img{height:60px;width:auto;max-width:280px;object-fit:contain;display:block;}',
    '.ebokf-marquee{overflow:hidden;',
    '-webkit-mask-image:linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);',
    'mask-image:linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);}',
    '.ebokf-track{display:flex;align-items:center;gap:48px;width:max-content;',
    'animation:ebokf-scroll 34s linear infinite;}',
    '.ebokf:hover .ebokf-track{animation-play-state:paused;}',
    '.ebokf-item{display:flex;align-items:center;flex:none;opacity:.85;transition:opacity .2s;}',
    '.ebokf-item:hover{opacity:1;}',
    '.ebokf-item img{height:36px;width:auto;max-width:130px;object-fit:contain;display:block;flex:none;}',
    '@keyframes ebokf-scroll{from{transform:translateX(0);}to{transform:translateX(-50%);}}',
    '.ebokf-contact{margin:28px 0 0;padding-top:22px;border-top:1px solid currentColor;',
    'border-top-color:color-mix(in srgb, currentColor 12%, transparent);font-size:13px;opacity:.75;}',
    '@supports not (border-top-color: color-mix(in srgb, currentColor 12%, transparent)){',
    '.ebokf-contact{border-top-color:rgba(128,128,128,.22);}}',
    '.ebokf-contact a{color:inherit;text-decoration:underline;text-underline-offset:3px;}',
    '.ebokf-contact a:hover{opacity:.8;}',
    '@media(max-width:700px){',
    '.ebokf{margin-top:40px;padding-top:26px;}',
    '.ebokf-home img{height:46px;}',
    '.ebokf-item img{height:28px;max-width:100px;}',
    '.ebokf-track{gap:32px;animation-duration:26s;}}',
    '@media(prefers-reduced-motion: reduce){',
    '.ebokf-track{animation:none;}.ebokf-marquee{overflow-x:auto;}}',
    /* Espace compte : la sidebar occupe toute la hauteur, pas de pied de page.
       Fonctionne aussi après une navigation côté client. */
    'body:has(.dash) .ebokf,body:has(.dash-gate) .ebokf{display:none;}'
  ].join('');

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function build() {
    // Déjà présent (script chargé deux fois, ou pied de page maison) : on sort.
    if (document.querySelector('.ebokf')) return;
    if (document.body.hasAttribute('data-no-ebok-footer')) return;

    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var items = APPS.map(function (a) {
      return (
        '<div class="ebokf-item">' +
        '<img src="' + LOGOS + a.file + '" alt="' + esc(a.name) + '" loading="lazy">' +
        '</div>'
      );
    }).join('');

    var name = currentAppName();
    var lead = name
      ? esc(name) + " fait partie de la galaxie d'applications"
      : "Cette application fait partie de la galaxie d'applications";

    var el = document.createElement('footer');
    el.className = 'ebokf';
    el.innerHTML =
      '<p class="ebokf-lead">' + lead + '</p>' +
      '<a class="ebokf-home" href="https://ebok.fr/" aria-label="EBOK Basketball — site officiel">' +
      '<img src="' + LOGOS + 'ebokbasketball.png" alt="EBOK Basketball">' +
      '</a>' +
      '<div class="ebokf-marquee">' +
      // Contenu dupliqué : l'animation glisse de 0 à -50% puis boucle sans
      // coupure visible (défilement continu, effet « infini »).
      '<div class="ebokf-track">' + items + items + '</div>' +
      '</div>' +
      '<p class="ebokf-contact">Pour nous contacter — ' +
      '<a href="mailto:' + CONTACT + '">' + CONTACT + '</a></p>';

    document.body.appendChild(el);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
