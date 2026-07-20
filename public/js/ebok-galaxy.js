/* =========================================================================
   EBOK Galaxy Bar — barre de navigation commune à toutes les apps EBOK.
   -------------------------------------------------------------------------
   Fichier IDENTIQUE dans chaque repo de la galaxie (basketball, event,
   video, mercato…). Pour modifier la barre partout : éditer ce fichier
   puis recopier la même version dans chaque repo (jusqu'à la mise en
   place d'un paquet partagé `ebok-ui`).

   Intégration : <script src="…/ebok-galaxy.js" defer></script>
   Aucune dépendance. La barre s'insère tout en haut du <body>.
   ========================================================================= */
(function () {
  'use strict';

  /* Source de vérité locale (miroir de src/data/tools.ts du site mère).
     `url: null` = pas encore en ligne (affiché grisé, non cliquable). */
  var HOME = { id: 'basketball', name: 'BASKETBALL', color: '#E8590C', url: 'https://ebok-basketball.vercel.app/' };
  var APPS = [
    { id: 'video',    name: 'VIDEO',    color: '#1FA98C', url: 'https://ebok-video.vercel.app/' },
    { id: 'event',    name: 'EVENT',    color: '#E23A3A', url: 'https://ebok-event.vercel.app/' },
    { id: 'mercato',  name: 'MERCATO',  color: '#4CA62E', url: 'https://ebok-mercato.vercel.app/' },
    { id: 'playbook', name: 'PLAYBOOK', color: '#E08A2B', url: null },
    { id: 'stats',    name: 'STATS',    color: '#2E6FD6', url: null },
    { id: 'notebook', name: 'NOTEBOOK', color: '#7A86A0', url: null },
    { id: 'academie', name: 'ACADÉMIE', color: '#8A4CE0', url: null },
    { id: 'scouting', name: 'SCOUTING', color: '#EA5A3C', url: null },
    { id: 'blog',     name: 'BLOG',     color: '#C8317E', url: null }
  ];

  /* Détecte l'app courante d'après le nom d'hôte (marche aussi en local). */
  function currentAppId() {
    var h = window.location.hostname;
    var all = APPS.concat([HOME]);
    for (var i = 0; i < all.length; i++) {
      if (h.indexOf('ebok-' + all[i].id) !== -1 || h.indexOf(all[i].id + '.ebok') !== -1) {
        return all[i].id;
      }
    }
    return HOME.id;
  }

  var CSS = [
    '.ebokg-bar{position:relative;z-index:9999;display:flex;align-items:center;justify-content:space-between;',
    'height:38px;padding:0 14px;background:#101114;color:#f5f5f5;',
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-size:13px;line-height:1;}',
    '.ebokg-brand{display:flex;align-items:center;gap:7px;color:#fff;text-decoration:none;font-weight:800;letter-spacing:.4px;}',
    '.ebokg-brand:hover{color:#ffb38a;}',
    '.ebokg-ball{font-size:15px;}',
    '.ebokg-toggle{display:flex;align-items:center;gap:6px;background:transparent;border:1px solid #3a3b40;',
    'border-radius:6px;color:#e8e8e8;padding:5px 10px;font:inherit;font-weight:600;cursor:pointer;}',
    '.ebokg-toggle:hover,.ebokg-toggle[aria-expanded="true"]{background:#1d1e23;border-color:#e8590c;}',
    '.ebokg-caret{font-size:9px;opacity:.8;}',
    '.ebokg-panel{position:absolute;top:100%;right:8px;margin-top:6px;min-width:230px;max-width:calc(100vw - 16px);',
    'background:#16171b;border:1px solid #33343a;border-radius:10px;padding:8px;box-shadow:0 12px 30px rgba(0,0,0,.45);}',
    '.ebokg-panel[hidden]{display:none;}',
    '.ebokg-title{padding:4px 8px 8px;font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#8b8d94;}',
    '.ebokg-item{display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:7px;color:#ececec;text-decoration:none;}',
    'a.ebokg-item:hover{background:#24252b;}',
    '.ebokg-item.ebokg-off{opacity:.45;cursor:default;}',
    '.ebokg-item.ebokg-now{background:#24252b;outline:1px solid #3c3d44;}',
    '.ebokg-dot{width:9px;height:9px;border-radius:50%;flex:none;}',
    '.ebokg-name{font-weight:700;letter-spacing:.3px;}',
    '.ebokg-tag{margin-left:auto;font-size:10px;color:#9a9ca3;}'
  ].join('');

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function itemFor(app, nowId) {
    var isNow = app.id === nowId;
    var node = el(app.url && !isNow ? 'a' : 'div',
      'ebokg-item' + (app.url ? '' : ' ebokg-off') + (isNow ? ' ebokg-now' : ''));
    if (app.url && !isNow) node.href = app.url;
    var dot = el('span', 'ebokg-dot');
    dot.style.background = app.color;
    node.appendChild(dot);
    node.appendChild(el('span', 'ebokg-name', 'EBOK ' + app.name));
    if (isNow) node.appendChild(el('span', 'ebokg-tag', 'vous êtes ici'));
    else if (!app.url) node.appendChild(el('span', 'ebokg-tag', 'bientôt'));
    return node;
  }

  function build() {
    var nowId = currentAppId();

    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var bar = el('nav', 'ebokg-bar');
    bar.setAttribute('aria-label', 'Galaxie EBOK Basketball');

    var brand = el('a', 'ebokg-brand');
    brand.href = HOME.url;
    brand.appendChild(el('span', 'ebokg-ball', '🏀'));
    brand.appendChild(el('span', null, 'EBOK Basketball'));
    bar.appendChild(brand);

    var toggle = el('button', 'ebokg-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.appendChild(el('span', null, 'Galaxie'));
    toggle.appendChild(el('span', 'ebokg-caret', '▼'));
    bar.appendChild(toggle);

    var panel = el('div', 'ebokg-panel');
    panel.hidden = true;
    panel.appendChild(el('div', 'ebokg-title', 'Les outils EBOK'));
    panel.appendChild(itemFor(HOME, nowId));
    APPS.forEach(function (app) { panel.appendChild(itemFor(app, nowId)); });
    bar.appendChild(panel);

    function close() { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (e) {
      if (!panel.hidden && !panel.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    document.body.insertBefore(bar, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
