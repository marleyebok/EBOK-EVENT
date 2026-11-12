/* =========================================================
   EBOK — LOGIQUE APPLICATIVE
   Navigation, filtres, carte, calendrier, recherche, détail
   événement, carrousel. S'appuie sur les données de data.js.
   ========================================================= */
function isPast(ev){ return ev.dateEnd < TODAY; }

const sessionCounters = {};
let currentGallery = [];

// Libellés/couleurs de disponibilité des places.
const DISPO_META = {
  dispo:   { label: 'Places dispo',   cls: 'dispo-dispo'   },
  limite:  { label: 'Bientôt complet', cls: 'dispo-limite'  },
  complet: { label: 'Complet',         cls: 'dispo-complet' }
};

// Catégories d'âge. Un événement peut en viser plusieurs : `age` est une liste.
const AGE_OPTIONS = ['Tout public', 'U7', 'U9', 'U11', 'U13', 'U15', 'U17',
  'U18', 'U21', 'Adulte', 'Non renseigné'];

/* Les fiches publiées avant le passage au multi-choix portent une tranche
   unique ("Séniors (18-35 ans)"…). Plutôt que de réécrire la base, on traduit
   ces valeurs à la lecture : rien n'est perdu, et une fiche rouverte puis
   enregistrée repart naturellement au nouveau format. */
const LEGACY_AGES = {
  'Enfants':  ['U7', 'U9', 'U11'],
  'Ados':     ['U13', 'U15', 'U17'],
  'Séniors':  ['Adulte'],
  'Vétérans': ['Adulte']
};

/* Renvoie toujours une liste de tranches, quel que soit le format stocké. */
function ageList(age){
  if(Array.isArray(age)) return age.filter(Boolean);
  const raw = String(age == null ? '' : age).trim();
  if(!raw) return [];
  if(AGE_OPTIONS.includes(raw)) return [raw];
  for(const prefix in LEGACY_AGES){
    if(raw.startsWith(prefix)) return LEGACY_AGES[prefix];
  }
  return [raw];   // valeur inattendue : on l'affiche plutôt que de la perdre
}

function ageLabel(age){
  const list = ageList(age);
  return list.length ? list.join(', ') : 'Non renseigné';
}

/* Remplit un conteneur de cases à cocher (les 11 tranches) et coche `selected`. */
function renderAgeChoices(containerId, selected){
  const box = document.getElementById(containerId);
  if(!box) return;
  const on = new Set(ageList(selected));
  box.innerHTML = AGE_OPTIONS.map(opt=>`
    <label class="chip-choice">
      <input type="checkbox" value="${opt}"${on.has(opt) ? ' checked' : ''}>
      <span>${opt}</span>
    </label>`).join('');
}

/* Tranches cochées dans un conteneur. */
function readAgeChoices(containerId){
  const box = document.getElementById(containerId);
  if(!box) return [];
  return Array.from(box.querySelectorAll('input[type="checkbox"]:checked')).map(i=> i.value);
}

const DEFAULT_COUNTRY = 'France';

/* Un événement sans pays est en France : c'était le seul cas possible avant
   l'ouverture à l'international, et les fiches existantes n'ont pas ce champ. */
function eventCountry(ev){
  return (ev && ev.pays ? String(ev.pays) : DEFAULT_COUNTRY).trim() || DEFAULT_COUNTRY;
}
function isAbroad(ev){
  return eventCountry(ev) !== DEFAULT_COUNTRY;
}


/* Codes ISO 3166-1 des pays. Les libellés français sont dérivés au moment de
   l'affichage : embarquer la liste des noms coûterait plusieurs kilo-octets
   pour un champ ouvert une fois par publication. */
const COUNTRY_CODES = ('AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ ' +
  'CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE ' +
  'GH GM GN GQ GR GT GW GY HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB ' +
  'LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR ' +
  'NZ OM PA PE PG PH PK PL PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD ' +
  'TG TH TJ TL TM TN TO TR TT TV TZ UA UG US UY UZ VC VE VN VU WS YE ZA ZM ZW').split(' ');

let countryNamesCache = null;
function countryNames(){
  if(countryNamesCache) return countryNamesCache;
  let names;
  try{
    const dn = new Intl.DisplayNames(['fr'], { type: 'region' });
    names = COUNTRY_CODES.map(c => dn.of(c)).filter(n => n && n !== DEFAULT_COUNTRY);
  }catch(e){
    names = [];   // navigateur sans Intl.DisplayNames : le champ reste utilisable
  }
  countryNamesCache = [...new Set(names)].sort((a, b) => a.localeCompare(b, 'fr'));
  return countryNamesCache;
}

/* Pays francophones visés en priorité : affichés juste sous la France. Le
   Québec est au Canada (la province va dans le champ « région »). */
const PAYS_FRANCOPHONES = ['Belgique', 'Suisse', 'Canada', 'Luxembourg'];

/* Remplit un <select> avec la liste des pays : France, puis les pays
   francophones visés, puis tous les autres. */
function renderCountrySelect(id, selected){
  const el = document.getElementById(id);
  if(!el) return;
  const current = selected || DEFAULT_COUNTRY;
  const autres = countryNames().filter(n => !PAYS_FRANCOPHONES.includes(n));
  const opt = n => `<option value="${esc(n)}"${n === current ? ' selected' : ''}>${esc(n)}</option>`;
  el.innerHTML = opt(DEFAULT_COUNTRY)
    + `<optgroup label="Francophonie">${PAYS_FRANCOPHONES.map(opt).join('')}</optgroup>`
    + `<optgroup label="Autres pays">${autres.map(opt).join('')}</optgroup>`;
}

/* Les détails de voyage (départ, destination, logement) ne concernent que les
   événements de type « Voyage » : ailleurs le bloc reste masqué. */
function toggleVoyageBlock(blockId, type){
  const box = document.getElementById(blockId);
  if(box) box.classList.toggle('hidden', type !== 'Voyage');
}

const VOYAGE_FIELDS = ['dateDepart', 'dateRetour', 'lieuxDepart', 'lieuRetour', 'destination', 'logement'];
const VOYAGE_INPUT_SUFFIX = {
  dateDepart:  'voy-date-depart',
  dateRetour:  'voy-date-retour',
  lieuxDepart: 'voy-lieux-depart',
  lieuRetour:  'voy-lieu-retour',
  destination: 'voy-destination',
  logement:    'voy-logement'
};

/* Lit le bloc voyage d'un formulaire ("c" création / "e" édition).
   Renvoie null hors type Voyage, pour ne rien stocker d'inutile. */
function readVoyage(prefix, type){
  if(type !== 'Voyage') return null;
  const out = {};
  let filled = false;
  for(const key of VOYAGE_FIELDS){
    const el = document.getElementById(`${prefix}-${VOYAGE_INPUT_SUFFIX[key]}`);
    const v = (el && el.value || '').trim();
    out[key] = v;
    if(v) filled = true;
  }
  return filled ? out : null;
}

/* Remplit le bloc voyage d'un formulaire. */
function fillVoyage(prefix, voyage){
  const v = voyage || {};
  for(const key of VOYAGE_FIELDS){
    const el = document.getElementById(`${prefix}-${VOYAGE_INPUT_SUFFIX[key]}`);
    if(el) el.value = v[key] || '';
  }
}

function eventCardHtml(ev){
  return `
    <div class="event-card" data-id="${esc(ev.id)}">
      <div class="card-media">
        ${safeImg(ev.poster) ? `<img src="${esc(safeImg(ev.poster))}" alt="Affiche ${esc(ev.title)}">` : `<div style="width:100%;height:100%;background:linear-gradient(135deg, ${typeColor(ev.type)}33, var(--asphalt-3));display:flex;align-items:center;justify-content:center;font-family:var(--font-display);color:${typeColor(ev.type)};font-size:15px;">${esc(String(ev.type || '').toUpperCase())}</div>`}
        <span class="card-type-badge" style="background:${typeColor(ev.type)}">${esc(ev.type)}</span>
        ${isPast(ev) ? `<span class="card-past-badge">Terminé</span>` : ``}
        ${ev.dispo && DISPO_META[ev.dispo] ? `<span class="dispo-badge ${DISPO_META[ev.dispo].cls}">${DISPO_META[ev.dispo].label}</span>` : ``}
        <button class="fav-btn ${favorites.has(ev.id) ? 'active' : ''}" data-fav="${esc(ev.id)}" aria-label="Enregistrer en favori" title="Mettre de côté">♥</button>
        <span class="fav-count ${Number(ev.favCount) > 0 ? '' : 'hidden'}" data-fav-count="${esc(ev.id)}" title="Personnes intéressées">${Number(ev.favCount) || ''}</span>
        ${currentIsAdmin ? `<button class="edit-btn" data-edit="${esc(ev.id)}" aria-label="Modifier cet événement" title="Modifier">✏️</button>` : ``}
      </div>
      <div class="card-body">
        <h4>${esc(ev.title)}</h4>
        <div class="card-meta">
          <b>${esc(ev.city)}</b> · ${fmtDateRange(ev.dateStart, ev.dateEnd)}<br>
          ${esc(ev.sexe)} · ${esc(ageLabel(ev.age))} · ${esc(ev.niveau)}
        </div>
      </div>
    </div>`;
}


let selectedRegion = '';

/* Les régions se choisissent dans une liste, jamais au clavier : mêmes noms
   que sur la carte et dans la base de villes, donc aucune faute de frappe
   possible. Métropole par ordre alphabétique, puis outre-mer. */
function listeRegions(){
  const tri = (a, b)=> a.localeCompare(b, 'fr');
  const metro = FRANCE_REGIONS.map(r=> r.name).sort(tri);
  const outreMer = (typeof FRANCE_INSETS !== 'undefined' ? FRANCE_INSETS.map(r=> r.name) : []).sort(tri);
  return { metro, outreMer };
}
function fillRegionSelect(id, libelleVide){
  const sel = document.getElementById(id);
  if(!sel) return;
  const { metro, outreMer } = listeRegions();
  const opts = l=> l.map(n=> `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  sel.innerHTML = `<option value="">${esc(libelleVide)}</option>
    <optgroup label="Métropole">${opts(metro)}</optgroup>
    ${outreMer.length ? `<optgroup label="Outre-mer">${opts(outreMer)}</optgroup>` : ''}`;
}
/* Sélectionne une région. Une valeur hors liste (région d'un autre pays sur
   une fiche existante) est ajoutée plutôt que perdue. */
function setRegionValue(id, value){
  const sel = document.getElementById(id);
  if(!sel) return;
  const v = value || '';
  if(v && !Array.from(sel.options).some(o=> o.value === v)) sel.add(new Option(v, v));
  sel.value = v;
}

function buildMap(){
  const svg = document.getElementById('franceMap');
  svg.setAttribute('viewBox', MAP_VIEWBOX);
  positionAllEvents();

  // Socle sombre (décalé vers le bas) = épaisseur / relief de la carte.
  const base = FRANCE_REGIONS.map(r=> `<path class="region-base" d="${r.d}"/>`).join('');
  // Faces supérieures : une région cliquable / survolable par zone.
  const tops = FRANCE_REGIONS.map(r=>
    `<path class="region" data-region="${r.name}" tabindex="0" role="button" aria-label="Région ${r.name}" d="${r.d}"><title>${r.name}</title></path>`
  ).join('');

  // Encart « reste du monde » : même principe qu'un territoire d'outre-mer,
  // une vignette cliquable qui ouvre la recherche des événements hors France.
  // Volontairement schématique — il ne localise rien, il sert de raccourci.
  const abroadCount = events.filter(isAbroad).length;
  const worldInset = `
    <g class="world-inset" tabindex="0" role="button"
       aria-label="Voir les événements hors de France${abroadCount ? ` (${abroadCount})` : ''}">
      <title>Événements internationaux${abroadCount ? ` — ${abroadCount}` : ''}</title>
      <rect class="inset-frame" x="12" y="16" width="104" height="104" rx="8"/>
      <g class="globe" transform="translate(64 62)">
        <circle class="globe-disc" r="30"/>
        <ellipse class="globe-line" rx="12" ry="30"/>
        <ellipse class="globe-line" rx="24" ry="30"/>
        <line class="globe-line" x1="-30" y1="0" x2="30" y2="0"/>
        <line class="globe-line" x1="-26" y1="-15" x2="26" y2="-15"/>
        <line class="globe-line" x1="-26" y1="15" x2="26" y2="15"/>
        <line class="globe-line" x1="0" y1="-30" x2="0" y2="30"/>
      </g>
      ${abroadCount ? `<circle class="world-badge-bg" cx="102" cy="30" r="12"/>
      <text class="world-badge" x="102" y="34" text-anchor="middle">${abroadCount}</text>` : ''}
      <text class="inset-label" x="64" y="112" text-anchor="middle">MONDE</text>
    </g>`;

  // Encarts outre-mer (DROM) : cadre + territoire cliquable + libellé.
  const overseas = (typeof FRANCE_INSETS !== 'undefined') ? `
    <g class="overseas-layer">
      <line class="overseas-sep" x1="12" y1="${OVERSEAS_BAND_TOP-16}" x2="${MAP_W-12}" y2="${OVERSEAS_BAND_TOP-16}"/>
      <text class="overseas-caption" x="12" y="${OVERSEAS_BAND_TOP-6}">OUTRE-MER</text>
      ${FRANCE_INSETS.map(ins=> `<rect class="inset-frame" x="${ins.box.x}" y="${ins.box.y}" width="${ins.box.w}" height="${ins.box.h}" rx="8"/>`).join('')}
      <g id="insetLayer">
        ${FRANCE_INSETS.map(ins=> `<path class="region inset-region" data-region="${ins.name}" tabindex="0" role="button" aria-label="Territoire ${ins.name}" d="${ins.d}"><title>${ins.name}</title></path>`).join('')}
      </g>
      ${FRANCE_INSETS.map(ins=> `<text class="inset-label" x="${ins.cx}" y="${ins.labelY}" text-anchor="middle">${ins.name}</text>`).join('')}
    </g>` : '';

  // Marqueur de position de l'utilisateur + cercle de rayon (géolocalisation).
  let geoMarker = '';
  if(userLoc){
    const [ux, uy] = projGeo(userLoc.lat, userLoc.lng);
    const rpx = homeRadius < 200 ? (homeRadius * MAP_PROJ.scale / KM_PER_LAT) : 0;
    geoMarker = `
      ${rpx > 0 ? `<circle class="geo-radius" cx="${ux}" cy="${uy}" r="${rpx.toFixed(1)}"/>` : ''}
      <circle class="geo-user-halo" cx="${ux}" cy="${uy}" r="9"/>
      <circle class="geo-user" cx="${ux}" cy="${uy}" r="4.5"/>`;
  }

  // Le fond (régions, encarts) est dans un groupe qui se zoome ; les noms de
  // villes et les épingles sont dessinés par-dessus, à taille constante, et
  // recalculés à chaque changement de vue (renderMapOverlay).
  svg.innerHTML = `
    <g id="mapZoom">
      <g class="region-base-layer">${base}</g>
      <g class="region-layer" id="regionLayer">${tops}</g>
      ${overseas}
      ${worldInset}
      <g class="geo-layer">${geoMarker}</g>
    </g>
    <g class="city-layer" id="cityLayer"></g>
    <g class="pin-layer" id="pinLayer"></g>`;
  applyMapView();

  // Interactions régions : le relief au survol/focus est géré en CSS pur
  // (:hover / :focus) — pas de manipulation du DOM, donc plus d'effet
  // "bloqué en relief" quand la souris quitte la zone.
  // Clic = ouvre la recherche filtrée sur cette région.
  svg.querySelectorAll('.region').forEach(reg=>{
    reg.addEventListener('click', ()=> openRegionSearch(reg.dataset.region));
    reg.addEventListener('keydown', e=>{
      if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openRegionSearch(reg.dataset.region); }
    });
  });

  const world = svg.querySelector('.world-inset');
  if(world){
    world.addEventListener('click', openAbroadSearch);
    world.addEventListener('keydown', e=>{
      if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openAbroadSearch(); }
    });
  }

  // Épingles et bulles : elles sont redessinées à chaque zoom, on écoute donc
  // leur calque plutôt que chacune.
  const pinLayer = svg.querySelector('#pinLayer');
  const activer = pin=>{
    if(pin.dataset.cluster != null) zoomOnCluster(Number(pin.dataset.cluster));
    else openEvent(pin.dataset.id);
  };
  pinLayer.addEventListener('mouseover', e=>{ const pin = e.target.closest('.pin'); if(pin) showTooltip(pin); });
  pinLayer.addEventListener('mouseout', e=>{ if(e.target.closest('.pin')) hideTooltip(); });
  pinLayer.addEventListener('click', e=>{
    const pin = e.target.closest('.pin');
    if(pin){ e.stopPropagation(); activer(pin); }
  });
  pinLayer.addEventListener('keydown', e=>{
    const pin = e.target.closest('.pin');
    if(pin && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); activer(pin); }
  });
}

/* =========================================================
   CARTE : ZOOM ET REGROUPEMENT DES ÉPINGLES
   ---------------------------------------------------------
   Plusieurs événements proches à l'écran sont fondus en une bulle qui porte
   leur nombre. En zoomant, la bulle se défait en bulles plus petites, puis en
   épingles. Le calcul se fait en distance à l'écran : c'est donc le zoom qui
   décide de ce qui est regroupé, pas la ville.
   ========================================================= */
const MAP_MAX_ZOOM = 8;
const CLUSTER_DIST = 27;                 // en unités de la carte, à l'écran
const mapView = { k: 1, x: 0, y: 0 };    // échelle et décalage du fond
let mapVisibleIds = null;                // événements retenus par les filtres (null = tous)
let mapClusters = [];
let mapTween = null;
/* Sur téléphone la carte est affichée deux fois plus petite : épingles et
   bulles sont agrandies d'autant (jusqu'à ×1,7) pour rester visibles et
   touchables du doigt. */
let mapUnit = 1;
function updateMapUnit(){
  const svg = document.getElementById('franceMap');
  const w = svg ? svg.getBoundingClientRect().width : 0;
  mapUnit = w ? Math.min(1.7, Math.max(1, MAP_W / w)) : 1;
}

function mapPt(x, y){ return [x * mapView.k + mapView.x, y * mapView.k + mapView.y]; }

function clusterEvents(list){
  const groups = [];
  // Ordre stable : le même zoom donne toujours les mêmes bulles.
  const sorted = list.slice().sort((a, b)=> String(a.id).localeCompare(String(b.id)));
  for(const ev of sorted){
    const [px, py] = mapPt(ev.x, ev.y);
    const g = groups.find(g=> Math.hypot(g.x - px, g.y - py) < CLUSTER_DIST * mapUnit);
    if(g){
      g.items.push(ev);
      g.x += (px - g.x) / g.items.length;
      g.y += (py - g.y) / g.items.length;
    }else{
      groups.push({ x: px, y: py, items: [ev] });
    }
  }
  return groups;
}

function pinSvg(ev, x, y){
  const c = TYPE_COLORS[ev.type] || '#607D8B';
  return `<g class="pin" data-id="${esc(ev.id)}" data-type="${esc(ev.type)}" data-sx="${x.toFixed(1)}" data-sy="${y.toFixed(1)}"
      tabindex="0" role="button" aria-label="${esc(ev.title)}">
    <circle class="core" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(8 * mapUnit).toFixed(1)}" fill="${c}"></circle>
    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2.6 * mapUnit).toFixed(1)}" fill="#fff"></circle>
  </g>`;
}

function renderMapOverlay(){
  const pinLayer = document.getElementById('pinLayer');
  const cityLayer = document.getElementById('cityLayer');
  if(!pinLayer || !cityLayer) return;
  updateMapUnit();
  const visible = (x, y)=> x > -60 && x < MAP_W + 60 && y > -60 && y < MAP_H + 60;

  cityLayer.innerHTML = Object.entries(CITY_LABELS).map(([name, [cx, cy]])=>{
    const [x, y] = mapPt(cx, cy);
    if(!visible(x, y)) return '';
    return `<circle class="city-dot-halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6"></circle>
     <circle class="city-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"></circle>
     <text class="city-name" x="${(x + 8).toFixed(1)}" y="${(y + 3.5).toFixed(1)}">${name}</text>`;
  }).join('');

  // Les événements à l'étranger n'ont pas de place sur la carte des régions :
  // ils sont repris par la vignette mondiale.
  const shown = events.filter(ev=> !isAbroad(ev) && (!mapVisibleIds || mapVisibleIds.has(ev.id)));
  mapClusters = clusterEvents(shown);
  const auMax = mapView.k >= MAP_MAX_ZOOM - 0.01;

  pinLayer.innerHTML = mapClusters.map((g, i)=>{
    if(!visible(g.x, g.y)) return '';
    const n = g.items.length;
    if(n === 1) return pinSvg(g.items[0], g.x, g.y);
    if(auMax){
      // Zoom maximal et toujours au même endroit (même salle, même ville) :
      // on écarte les épingles en couronne pour que chacune reste cliquable.
      const rayon = Math.max(15, n * 19 / (2 * Math.PI)) * mapUnit;
      return g.items.map((ev, j)=>{
        const a = (j / n) * 2 * Math.PI - Math.PI / 2;
        return pinSvg(ev, g.x + rayon * Math.cos(a), g.y + rayon * Math.sin(a));
      }).join('');
    }
    const r = Math.min(12 + 3 * Math.sqrt(n), 30) * mapUnit;
    return `<g class="pin pin-cluster" data-cluster="${i}" data-sx="${g.x.toFixed(1)}" data-sy="${g.y.toFixed(1)}"
        tabindex="0" role="button" aria-label="${n} événements ici — zoomer">
      <circle class="cluster-halo" cx="${g.x.toFixed(1)}" cy="${g.y.toFixed(1)}" r="${(r + 6 * mapUnit).toFixed(1)}"></circle>
      <circle class="cluster-core" cx="${g.x.toFixed(1)}" cy="${g.y.toFixed(1)}" r="${r.toFixed(1)}"></circle>
      <text class="cluster-count" x="${g.x.toFixed(1)}" y="${(g.y + 4.6 * mapUnit).toFixed(1)}" font-size="${(13.5 * mapUnit).toFixed(1)}">${n}</text>
    </g>`;
  }).join('');
}

/* Applique la vue courante : déplace le fond, redessine épingles et libellés. */
function applyMapView(){
  const zoom = document.getElementById('mapZoom');
  if(zoom) zoom.setAttribute('transform', `translate(${mapView.x.toFixed(2)} ${mapView.y.toFixed(2)}) scale(${mapView.k.toFixed(4)})`);
  // Le relief du socle (7 px sous la carte) garde son épaisseur à l'écran.
  const socle = document.querySelector('#mapZoom .region-base-layer');
  if(socle) socle.style.transform = `translateY(${(7 / mapView.k).toFixed(3)}px)`;
  const wrap = document.getElementById('homeMapView');
  const zoomed = mapView.k > 1.001;
  if(wrap) wrap.classList.toggle('zoomed', zoomed);
  const out = document.getElementById('mapZoomOut'), inn = document.getElementById('mapZoomIn'), reset = document.getElementById('mapZoomReset');
  if(out) out.disabled = !zoomed;
  if(inn) inn.disabled = mapView.k >= MAP_MAX_ZOOM - 0.01;
  if(reset) reset.hidden = !zoomed;
  hideTooltip();
  renderMapOverlay();
}

/* Borne la vue : le fond ne peut pas sortir de son cadre. */
function clampMapView(k, x, y){
  k = Math.min(MAP_MAX_ZOOM, Math.max(1, k));
  x = Math.min(0, Math.max(MAP_W * (1 - k), x));
  y = Math.min(0, Math.max(MAP_H * (1 - k), y));
  return { k, x, y };
}
function setMapView(k, x, y, animate){
  const cible = clampMapView(k, x, y);
  if(mapTween){ cancelAnimationFrame(mapTween); mapTween = null; }
  const calme = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!animate || calme){ Object.assign(mapView, cible); applyMapView(); return; }
  const depart = { ...mapView }, t0 = performance.now(), duree = 320;
  const pas = now=>{
    const t = Math.min(1, (now - t0) / duree), e = 1 - Math.pow(1 - t, 3);
    mapView.k = depart.k + (cible.k - depart.k) * e;
    mapView.x = depart.x + (cible.x - depart.x) * e;
    mapView.y = depart.y + (cible.y - depart.y) * e;
    applyMapView();
    mapTween = t < 1 ? requestAnimationFrame(pas) : null;
  };
  mapTween = requestAnimationFrame(pas);
}
/* Zoome en gardant sous le doigt (ou le curseur) le point (sx, sy) de l'écran.
   (tx, ty) : où ce point doit se retrouver ; par défaut, là où il est. */
function zoomMapAt(k, sx, sy, animate, tx, ty){
  k = Math.min(MAP_MAX_ZOOM, Math.max(1, k));
  const mx = (sx - mapView.x) / mapView.k, my = (sy - mapView.y) / mapView.k;
  setMapView(k, (tx == null ? sx : tx) - mx * k, (ty == null ? sy : ty) - my * k, animate);
}
/* Clic sur une bulle : on zoome juste assez pour qu'elle se défasse, en la
   ramenant vers le centre. */
function zoomOnCluster(i){
  const g = mapClusters[i];
  if(!g) return;
  let ecart = 0;
  for(const a of g.items) for(const b of g.items) ecart = Math.max(ecart, Math.hypot(a.x - b.x, a.y - b.y));
  const pourSeparer = ecart > 0 ? (CLUSTER_DIST * mapUnit * 1.7) / ecart : MAP_MAX_ZOOM;
  const k = Math.min(MAP_MAX_ZOOM, Math.max(mapView.k * 1.8, pourSeparer));
  zoomMapAt(k, g.x, g.y, true, (g.x + MAP_W / 2) / 2, (g.y + 300) / 2);
}

/* Gestes : pincement à deux doigts, glisser quand on a zoomé, Ctrl + molette
   (ou pincement au pavé tactile), double-clic, boutons + / −. La molette
   seule continue de faire défiler la page. */
function initMapZoom(){
  const wrap = document.getElementById('homeMapView');
  const svg = document.getElementById('franceMap');
  if(!wrap || !svg) return;
  // Position d'un point de la fenêtre dans le repère de la carte à l'écran.
  const pos = (cx, cy)=>{
    const r = svg.getBoundingClientRect();
    const f = MAP_W / (r.width || MAP_W);
    return [(cx - r.left) * f, (cy - r.top) * f, f];
  };
  const doigts = new Map();
  let pince = null, glisse = null, aBouge = false;

  wrap.addEventListener('pointerdown', e=>{
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    aBouge = false;
    if(doigts.size === 2){
      const [a, b] = [...doigts.values()];
      pince = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: mapView.k };
      glisse = null;
    }else if(doigts.size === 1){
      glisse = { x: e.clientX, y: e.clientY, vx: mapView.x, vy: mapView.y };
    }
  });
  wrap.addEventListener('pointermove', e=>{
    if(!doigts.has(e.pointerId)) return;
    doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if(pince && doigts.size >= 2){
      const [a, b] = [...doigts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const [sx, sy] = pos((a.x + b.x) / 2, (a.y + b.y) / 2);
      aBouge = true;
      zoomMapAt(pince.k * d / pince.d, sx, sy, false);
    }else if(glisse && mapView.k > 1.001){
      const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y;
      if(!aBouge && Math.hypot(dx, dy) < 6) return;
      if(!aBouge){ aBouge = true; try{ wrap.setPointerCapture(e.pointerId); }catch(_){} wrap.classList.add('dragging'); }
      const f = pos(0, 0)[2];
      setMapView(mapView.k, glisse.vx + dx * f, glisse.vy + dy * f, false);
    }
  });
  const fin = e=>{
    doigts.delete(e.pointerId);
    if(doigts.size < 2) pince = null;
    if(doigts.size === 0){ glisse = null; wrap.classList.remove('dragging'); }
    else if(doigts.size === 1){
      // Un doigt reste après un pincement : il reprend le glisser d'ici.
      const p = [...doigts.values()][0];
      glisse = { x: p.x, y: p.y, vx: mapView.x, vy: mapView.y };
    }
  };
  wrap.addEventListener('pointerup', fin);
  wrap.addEventListener('pointercancel', fin);
  // Un glisser ne doit pas finir en clic sur la région ou l'épingle relâchée.
  wrap.addEventListener('click', e=>{
    if(aBouge){ e.stopPropagation(); e.preventDefault(); aBouge = false; }
  }, true);

  wrap.addEventListener('wheel', e=>{
    if(!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const [sx, sy] = pos(e.clientX, e.clientY);
    zoomMapAt(mapView.k * Math.exp(-e.deltaY * 0.012), sx, sy, false);
  }, { passive: false });

  wrap.addEventListener('dblclick', e=>{
    if(e.target.closest('.pin, .map-zoom-ctl')) return;
    e.preventDefault();
    const [sx, sy] = pos(e.clientX, e.clientY);
    zoomMapAt(mapView.k * 2, sx, sy, true);
  });

  const centre = ()=> [MAP_W / 2, 300];
  const bouton = (id, action)=>{ const b = document.getElementById(id); if(b) b.addEventListener('click', e=>{ e.stopPropagation(); action(); }); };
  bouton('mapZoomIn',  ()=> zoomMapAt(mapView.k * 1.8, ...centre(), true));
  bouton('mapZoomOut', ()=> zoomMapAt(mapView.k / 1.8, ...centre(), true));
  bouton('mapZoomReset', ()=> setMapView(1, 0, 0, true));
  // La taille des épingles dépend de la largeur affichée de la carte.
  window.addEventListener('resize', renderMapOverlay);
}


/* Positionne chaque événement sur la carte à partir de sa ville (mêmes
   coordonnées projetées que les régions), avec un léger décalage stable
   pour éviter que plusieurs événements d'une même ville se superposent. */
function positionAllEvents(){
  for(const ev of events) positionEvent(ev);
}
function positionEvent(ev){
  const c = CITY_COORDS[ev.city];
  if(c){
    const j = stableJitter(ev.id);
    ev.x = c[0] + j.dx;
    ev.y = c[1] + j.dy;
  }else if((typeof ev.x !== 'number' || typeof ev.y !== 'number') && typeof ev.lat === 'number' && typeof ev.lng === 'number'){
    // Ville absente de la liste locale mais géolocalisée par le serveur
    // (événement détecté automatiquement) : on la projette sur la carte.
    const [x, y] = projGeo(ev.lat, ev.lng);
    ev.x = Math.round(x); ev.y = Math.round(y);
  }else if(typeof ev.x !== 'number' || typeof ev.y !== 'number'){
    ev.x = MAP_W/2; ev.y = MAP_H/2;
  }
  // Coordonnées géographiques réelles (pour la distance "autour de moi").
  const ll = CITY_LATLON[ev.city];
  if(ll){ ev.lat = ll[0]; ev.lng = ll[1]; }
}
function stableJitter(id){
  let h = 0; const s = String(id);
  for(let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) >>> 0;
  return { dx: (h % 15) - 7, dy: ((h >> 4) % 15) - 7 };
}

/* Clic sur une région : ouvre la recherche filtrée sur cette région,
   avec les résultats triés par date de début (géré par renderResults). */
function openRegionSearch(name){
  const form = document.getElementById('searchForm');
  if(form) form.reset();
  searchAbroad = false;
  setRegionValue('f-region', name);
  showPage('search');
  renderResults();
}
/* Depuis la vignette « Monde » : la recherche ne porte plus sur un lieu mais
   sur tout ce qui se déroule hors de France. */
function openAbroadSearch(){
  const form = document.getElementById('searchForm');
  if(form) form.reset();
  searchAbroad = true;
  showPage('search');
  renderResults();
}
function applySelectedRegionStyle(){
  document.querySelectorAll('.region').forEach(r=>{
    r.classList.toggle('selected', r.dataset.region === selectedRegion);
  });
}
/* Aligne le surlignage de région sur le filtre ville/région courant
   (ex. recherche d'une ville → plus aucune région surlignée). */
function syncRegionSelection(){
  selectedRegion = homeRegion;
  applySelectedRegionStyle();
}

function showTooltip(pin){
  const tt = document.getElementById('mapTooltip');
  const wrap = document.querySelector('.map-wrap');
  const svg = document.getElementById('franceMap');
  const svgRect = svg.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const scale = svgRect.width/MAP_W;
  tt.style.left = ((svgRect.left - wrapRect.left) + Number(pin.dataset.sx)*scale)+"px";
  tt.style.top = ((svgRect.top - wrapRect.top) + Number(pin.dataset.sy)*scale)+"px";
  if(pin.dataset.cluster != null){
    const g = mapClusters[Number(pin.dataset.cluster)];
    if(!g) return;
    const villes = [...new Set(g.items.map(e=> e.city).filter(Boolean))];
    tt.innerHTML = `<div class="tt-title">${g.items.length} événements</div>
      <div class="tt-meta">${esc(villes.slice(0, 3).join(', '))}${villes.length > 3 ? '…' : ''}<br>Clique pour zoomer</div>`;
    tt.classList.add('show');
    return;
  }
  const ev = events.find(e=>e.id===pin.dataset.id);
  if(!ev) return;
  tt.innerHTML = `<div class="tt-type" style="color:${typeColor(ev.type)}">${esc(ev.type)}</div>
    <div class="tt-title">${esc(ev.title)}</div>
    <div class="tt-meta">${esc(ev.lieu)}<br>${fmtDateRange(ev.dateStart,ev.dateEnd)}<br>${esc(ev.sexe)} · ${esc(ageLabel(ev.age))} · ${esc(ev.niveau)}</div>`;
  tt.classList.add('show');
}
function hideTooltip(){ const tt = document.getElementById('mapTooltip'); if(tt) tt.classList.remove('show'); }

/* =========================================================
   FILTERS — home map
   ========================================================= */

function initHomeFilters(){

  // Barre de recherche ville/région avec autocomplétion
  // Suggestions : les villes seulement. La région se choisit dans sa liste.
  const cities = [...new Set(events.map(e=> e.city).filter(Boolean))].sort();
  fillRegionSelect('regionSelect', 'Toutes les régions');
  const regionSelect = document.getElementById('regionSelect');
  if(regionSelect) regionSelect.addEventListener('change', ()=>{
    homeRegion = regionSelect.value;
    syncRegionSelection();
    applyMapFilters();
  });
  const citySearch = document.getElementById('citySearch');
  const citySuggestions = document.getElementById('citySuggestions');
  
  function showSuggestions(value){
    if(!value.trim()){
      citySuggestions.classList.add('hidden');
      return;
    }
    const lower = value.toLowerCase();
    const filtered = cities.filter(c=> c.toLowerCase().includes(lower));
    if(filtered.length === 0){
      citySuggestions.classList.add('hidden');
      return;
    }
    citySuggestions.innerHTML = filtered.map(city=> `
      <div class="city-suggestion" data-city="${city}">${city}</div>`).join('');
    citySuggestions.classList.remove('hidden');
    citySuggestions.querySelectorAll('.city-suggestion').forEach(el=>{
      if(el.dataset.city === homeCity) el.classList.add('active');
      el.addEventListener('click', ()=>{
        homeCity = el.dataset.city;
        citySearch.value = homeCity;
        citySuggestions.classList.add('hidden');
        syncRegionSelection();
        applyMapFilters();
      });
    });
  }
  
  citySearch.addEventListener('input', (e)=>{
    // Filtre en temps réel dès la frappe (pas besoin de choisir une
    // suggestion) : recherche rapide et interactive, comme sur la carte.
    homeCity = e.target.value.trim();
    syncRegionSelection();
    applyMapFilters();
    showSuggestions(e.target.value);
  });
  citySearch.addEventListener('blur', ()=> setTimeout(()=> citySuggestions.classList.add('hidden'), 150));
  citySearch.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape'){
      citySearch.value = '';
      homeCity = '';
      citySuggestions.classList.add('hidden');
      syncRegionSelection();
      applyMapFilters();
    }
  });

  // Rayon slider (retiré de la recherche rapide — reste géré si présent ailleurs).
  const radiusSlider = document.getElementById('radiusFilter');
  if(radiusSlider){
    radiusSlider.addEventListener('input', (e)=>{
      homeRadius = parseInt(e.target.value, 10);
      updateRadiusLabel();
      updateGeoCircle();
      applyMapFilters();
    });
  }

  // Calendrier de période (date début / date fin). Il s'ouvrait sur juin 2026,
  // codé en dur : on part du mois courant.
  const today = new Date();
  let pickerMonth = new Date(today.getFullYear(), today.getMonth());
  let selectionMode = 'range'; // 'range' ou 'single'
  
  function formatDateDisplay(d){ return d ? new Date(d+'T00:00').toLocaleDateString('fr-FR', {day:'numeric', month:'short'}) : null; }
  function updatePeriodDisplay(){
    if(!periodStart && !periodEnd){
      document.getElementById('periodText').textContent = 'Indifférent';
    }else if(selectionMode === 'single'){
      // Mode jour unique : afficher juste la date
      document.getElementById('periodText').textContent = `${formatDateDisplay(periodStart) || 'Indifférent'}`;
    }else if(periodStart && !periodEnd){
      // Mode plage : une seule date sélectionnée
      document.getElementById('periodText').textContent = `À partir du ${formatDateDisplay(periodStart)}`;
    }else if(periodStart && periodEnd){
      // Mode plage : plage complète
      document.getElementById('periodText').textContent = `${formatDateDisplay(periodStart)} → ${formatDateDisplay(periodEnd)}`;
    }
  }
  
  function renderPicker(){
    const year = pickerMonth.getFullYear();
    const month = pickerMonth.getMonth();
    const monthName = pickerMonth.toLocaleDateString('fr-FR', {month:'long', year:'numeric'});
    document.getElementById('pickerMonth').textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();
    const daysGrid = document.getElementById('pickerDays');
    let html = '';
    
    // Jours du mois précédent (grisés)
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for(let i = (startingDayOfWeek || 7) - 1; i > 0; i--){
      html += `<button type="button" class="day-cell other" disabled>${prevMonthLastDay - i + 1}</button>`;
    }
    
    // Jours du mois courant
    for(let d = 1; d <= lastDay.getDate(); d++){
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      let cellClass = 'day-cell';
      
      if(selectionMode === 'range'){
        if(periodStart && periodEnd){
          const s = new Date(periodStart);
          const e = new Date(periodEnd);
          const cur = new Date(dateStr);
          if(cur >= s && cur <= e) cellClass += ' inrange';
          if(dateStr === periodStart || dateStr === periodEnd) cellClass += ' selected';
        }else if(periodStart && dateStr === periodStart){
          cellClass += ' selected';
        }
      }else if(selectionMode === 'single'){
        if(periodStart && dateStr === periodStart) cellClass += ' selected';
      }
      
      html += `<button type="button" class="${cellClass}" data-date="${dateStr}">${d}</button>`;
    }
    
    // Jours du mois suivant (grisés)
    const remainingDays = 42 - (html.match(/<button/g)||[]).length;
    for(let d = 1; d <= remainingDays; d++){
      html += `<button type="button" class="day-cell other" disabled>${d}</button>`;
    }
    
    daysGrid.innerHTML = html;
    daysGrid.querySelectorAll('[data-date]').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.preventDefault();
        // On stoppe la propagation : renderPicker() remplace les boutons de
        // jour, donc l'écouteur "clic dehors" verrait sinon une cible détachée
        // et fermerait le calendrier dès le 1er clic (bug période).
        e.stopPropagation();
        const date = btn.dataset.date;

        if(selectionMode === 'range'){
          if(!periodStart){
            periodStart = date;
            periodEnd = '';
          }else if(!periodEnd && date >= periodStart){
            periodEnd = date;
          }else if(date < periodStart){
            periodStart = date;
            periodEnd = '';
          }else{
            periodStart = '';
            periodEnd = '';
          }
        }else if(selectionMode === 'single'){
          if(periodStart === date){
            periodStart = ''; periodEnd = ''; // Déselectionner au 2e clic
          }else{
            periodStart = date;
            periodEnd = date; // Jour unique = même date de début et de fin (filtre live immédiat)
          }
        }
        
        updatePeriodDisplay();
        renderPicker();
        applyMapFilters();   // filtre en direct, sans attendre "Appliquer"
      });
    });
  }
  
  document.getElementById('periodDisplay').addEventListener('click', (e)=>{
    e.stopPropagation();
    document.getElementById('periodPicker').classList.toggle('hidden');
  });
  
  document.getElementById('prevMonth').addEventListener('click', (e)=>{
    e.preventDefault();
    pickerMonth = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1);
    renderPicker();
  });
  
  document.getElementById('nextMonth').addEventListener('click', (e)=>{
    e.preventDefault();
    pickerMonth = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1);
    renderPicker();
  });
  
  document.getElementById('pickerClear').addEventListener('click', (e)=>{
    e.preventDefault();
    periodStart = '';
    periodEnd = '';
    updatePeriodDisplay();
    renderPicker();
    applyMapFilters();
  });
  
  // Boutons de mode (Plage / Jour unique)
  document.querySelectorAll('.mode-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      const mode = btn.dataset.mode;
      selectionMode = mode;
      document.querySelectorAll('.mode-btn').forEach(b=> b.classList.toggle('active', b===btn));
      periodStart = '';
      periodEnd = '';
      updatePeriodDisplay();
      renderPicker();
      applyMapFilters();
    });
  });

  // Bouton Appliquer (ferme et valide)
  document.getElementById('pickerApply').addEventListener('click', (e)=>{
    e.preventDefault();
    if(selectionMode === 'single' && periodStart){
      periodEnd = periodStart; // En mode single, on met la même date pour les deux
    }
    updatePeriodDisplay();
    applyMapFilters();
    document.getElementById('periodPicker').classList.add('hidden');
  });
  
  // Fermer le picker au clic dehors
  document.addEventListener('click', (e)=>{
    if(!document.getElementById('periodSelector').contains(e.target)){
      document.getElementById('periodPicker').classList.add('hidden');
    }
  });
  
  renderPicker();
  updatePeriodDisplay();

  const typeWrap = document.getElementById('typeFilterHome');
  typeWrap.classList.add('type-list');
  Object.entries(TYPE_COLORS).forEach(([type,color])=>{
    typeWrap.insertAdjacentHTML('beforeend',
      `<button type="button" class="type-chip" data-type="${type}" style="--chip:${color}" aria-pressed="false"><span class="dot"></span>${type}</button>`);
  });
  typeWrap.querySelectorAll('.type-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const on = chip.classList.toggle('active');
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      updateTypeLabel();
      applyMapFilters();
    });
  });

  // Menu déroulant "Types" (ouverture/fermeture + tout sélectionner/retirer)
  const ddBtn = document.getElementById('typeDdBtn');
  const ddPanel = document.getElementById('typeDdPanel');
  ddBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    ddPanel.classList.toggle('hidden');
    ddBtn.classList.toggle('open', !ddPanel.classList.contains('hidden'));
  });
  document.addEventListener('click', (e)=>{
    if(!document.getElementById('typeDropdown').contains(e.target)){
      ddPanel.classList.add('hidden'); ddBtn.classList.remove('open');
    }
  });
  const setAllTypes = (on)=>{
    typeWrap.querySelectorAll('.type-chip').forEach(c=>{
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    updateTypeLabel();
    applyMapFilters();
  };
  document.getElementById('typeAll').addEventListener('click', ()=> setAllTypes(true));
  // "Réinitialiser" : aucune pastille cochée = aucune restriction (tous les types affichés).
  document.getElementById('typeNone').addEventListener('click', ()=> setAllTypes(false));

  updateTypeLabel();
  applyMapFilters();
}

/* Met à jour l'intitulé du bouton "Types" selon la sélection.
   Aucune pastille cochée = aucune restriction (comme "toutes cochées"). */
function updateTypeLabel(){
  const chips = document.querySelectorAll('#typeFilterHome .type-chip');
  const active = document.querySelectorAll('#typeFilterHome .type-chip.active');
  const label = document.getElementById('typeDdLabel');
  if(!label) return;
  if(active.length === 0 || active.length === chips.length) label.textContent = 'Tous les types';
  else if(active.length === 1) label.textContent = active[0].dataset.type;
  else label.textContent = `${active.length} types`;
}

let homeView = 'map';
let homeCity = '';
let homeRegion = '';       // région choisie dans la liste de la recherche rapide
let homeRadius = 200;

// Variables du calendrier de période
let periodStart = '';
let periodEnd = '';

// Centre approximatif de la France dans le repère de la carte (secours)
const FRANCE_CENTER = {x: 305, y: 300};

// Position de l'utilisateur (géolocalisation ou dernière position mémorisée).
let userLoc = null;

/* Point de référence pour le rayon : la position de l'utilisateur en
   priorité, sinon la ville sélectionnée dans les filtres. */
function currentRef(){
  if(userLoc) return userLoc;
  if(homeCity && CITY_LATLON[homeCity]) return { lat: CITY_LATLON[homeCity][0], lng: CITY_LATLON[homeCity][1] };
  return null;
}

// Distance réelle entre deux points géographiques (formule de Haversine), en km.
function haversine(aLat, aLng, bLat, bLng){
  const R = 6371, toRad = x => x * Math.PI / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat/2)**2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* Distance (km) entre le point de référence et un événement. Renvoie 0
   s'il n'y a pas de référence (le rayon ne filtre alors rien). */
function getEventDistance(ev){
  const ref = currentRef();
  if(!ref || typeof ev.lat !== 'number') return 0;
  return haversine(ref.lat, ref.lng, ev.lat, ev.lng);
}

// Projette une position lat/lon dans le repère de la carte métropole.
function projGeo(lat, lng){
  const P = MAP_PROJ;
  return [ P.pad + (lng * P.cosLat - P.minX) * P.scale, P.pad + (-lat - P.minY) * P.scale ];
}
const KM_PER_LAT = 110.574; // km par degré de latitude (pour le cercle de rayon)

/* ---- Géolocalisation "autour de moi" ---- */
function updateRadiusLabel(){
  const el = document.getElementById('radiusValue');
  if(el) el.textContent = homeRadius >= 200 ? 'Partout' : `${homeRadius} km`;
}
function updateGeoCircle(){
  if(!userLoc) return;
  const c = document.querySelector('.geo-radius');
  if(homeRadius >= 200){ if(c) c.setAttribute('r', 0); return; }
  const r = (homeRadius * MAP_PROJ.scale / KM_PER_LAT).toFixed(1);
  if(c) c.setAttribute('r', r);
  else buildMap();   // le cercle n'existait pas encore : on redessine
}
function setGeoUI(active){
  const btn = document.getElementById('geoBtn');
  if(!btn) return;
  btn.classList.toggle('active', active);
  btn.textContent = active ? '📍 Autour de moi — activé' : '📍 Me localiser';
}
function showGeoStatus(msg, isError){
  const status = document.getElementById('geoStatus');
  if(!status) return;
  status.textContent = msg;
  status.classList.toggle('geo-status-error', !!isError);
  status.classList.remove('hidden');
}
function initGeoloc(){
  const btn = document.getElementById('geoBtn');
  const status = document.getElementById('geoStatus');
  if(!btn) return;

  // Restaure la dernière position mémorisée.
  const saved = localStorage.getItem('ebok-userloc');
  if(saved){ try{ userLoc = JSON.parse(saved); }catch(e){ userLoc = null; } }
  if(userLoc) setGeoUI(true);

  btn.addEventListener('click', ()=>{
    if(userLoc){                       // désactiver
      userLoc = null;
      localStorage.removeItem('ebok-userloc');
      setGeoUI(false);
      status.classList.add('hidden');
      buildMap(); applyMapFilters();
      return;
    }
    if(!('geolocation' in navigator)){
      showGeoStatus("Géolocalisation non disponible sur ce navigateur.", true);
      return;
    }
    showGeoStatus("Localisation en cours…", false);
    btn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      pos=>{
        btn.disabled = false;
        userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        localStorage.setItem('ebok-userloc', JSON.stringify(userLoc));
        if(homeRadius >= 200){        // rayon "Partout" → on passe à 100 km pour que le filtre serve
          homeRadius = 100;
          const slider = document.getElementById('radiusFilter');
          if(slider) slider.value = 100;
          updateRadiusLabel();
        }
        setGeoUI(true);
        showGeoStatus(`Position trouvée — événements à moins de ${homeRadius} km.`, false);
        buildMap(); applyMapFilters();
      },
      err=>{
        btn.disabled = false;
        showGeoStatus(err.code === 1
          ? "Accès à la position refusé. Autorise la localisation dans ton navigateur."
          : "Localisation impossible. Réessaie.", true);
      },
      { enableHighAccuracy:false, timeout:10000, maximumAge:600000 }
    );
  });
}

/* Tri d'affichage commun aux listes d'événements : du plus récent au plus
   ancien. Les fiches passées gardent leur pastille « Terminé », elles restent
   donc reconnaissables au milieu des autres. */
function parDateRecente(a, b){
  return String(b.dateStart || '').localeCompare(String(a.dateStart || ''));
}

function computeHomeFilteredEvents(){
  const checkedTypes = Array.from(document.querySelectorAll('#typeFilterHome .type-chip.active')).map(c=>c.dataset.type);
  
  return events.filter(ev=>{
    // Aucune pastille cochée = aucune restriction de type (tout est affiché).
    if(checkedTypes.length && !checkedTypes.includes(ev.type)) return false;
    if(periodStart && ev.dateEnd < periodStart) return false;
    if(periodEnd && ev.dateStart > periodEnd) return false;
    if(homeCity){
      const q = homeCity.toLowerCase();
      const inCity = (ev.city || '').toLowerCase().includes(q);
      const inLieu = (ev.lieu || '').toLowerCase().includes(q);
      if(!inCity && !inLieu) return false;
    }
    if(homeRegion && ev.region !== homeRegion) return false;
    // "Partout" (curseur au max, >= 200) = aucune limite de distance.
    if(homeRadius < 200 && getEventDistance(ev) > homeRadius) return false;
    return true;
  });
}

function applyMapFilters(){
  const filtered = computeHomeFilteredEvents();
  const filteredIds = filtered.map(e=>e.id);
  // La carte ne montre que les événements retenus : les bulles comptent
  // donc ce qui correspond aux filtres.
  mapVisibleIds = new Set(filteredIds);
  renderMapOverlay();
  document.getElementById('homeCount').textContent = `${filtered.length} événement${filtered.length>1?'s':''}`;
  if(homeView === 'list') renderHomeList(filtered);
}

function renderHomeList(filtered){
  const grid = document.getElementById('homeListView');
  if(filtered.length === 0){
    grid.innerHTML = `<div class="empty-state"><h4>Aucun événement ne correspond</h4><p>Essaie d'élargir tes filtres — semaine ou type d'événement.</p></div>`;
    return;
  }
  grid.innerHTML = filtered.slice().sort(parDateRecente).map(ev=>`
${eventCardHtml(ev)}`).join('');
  grid.querySelectorAll('.event-card').forEach(card=>{
    card.addEventListener('click', ()=> openEvent(card.dataset.id));
  });
}

function setHomeView(view){
  homeView = view;
  document.getElementById('viewBtnMap').classList.toggle('active', view==='map');
  document.getElementById('viewBtnList').classList.toggle('active', view==='list');
  document.getElementById('homeMapView').classList.toggle('hidden', view!=='map');
  document.getElementById('homeListView').classList.toggle('hidden', view!=='list');
  if(view==='list') renderHomeList(computeHomeFilteredEvents());
}
document.getElementById('viewBtnMap').addEventListener('click', ()=> setHomeView('map'));
document.getElementById('viewBtnList').addEventListener('click', ()=> setHomeView('list'));

/* =========================================================
   SEARCH PAGE
   ========================================================= */
let searchAbroad = false;   // Recherche restreinte aux événements hors de France
function initSearchPage(){
  const typeSel = document.getElementById('f-type');
  Object.keys(TYPE_COLORS).forEach(t=>{
    const opt = document.createElement('option'); opt.value=t; opt.textContent=t;
    typeSel.appendChild(opt);
  });
  fillRegionSelect('f-region', 'Toutes les régions');
  document.getElementById('f-region').addEventListener('change', renderResults);
  document.getElementById('searchForm').addEventListener('submit',(e)=>{ e.preventDefault(); renderResults(); });
  document.getElementById('resetSearch').addEventListener('click', ()=>{
    document.getElementById('searchForm').reset();
    searchAbroad = false;
    renderResults();
  });
  renderResults();
}

function renderResults(){
  const lieu = document.getElementById('f-lieu').value.trim().toLowerCase();
  const regionChoisie = document.getElementById('f-region').value;
  const type = document.getElementById('f-type').value;
  const dStart = document.getElementById('f-date-start').value;
  const dEnd = document.getElementById('f-date-end').value;
  const sexe = document.getElementById('f-sexe').value;
  const age = document.getElementById('f-age').value;
  const niveau = document.getElementById('f-niveau').value;
  const afficheOnly = document.getElementById('f-affiche').checked;

  let results = events.filter(ev=>{
    if(searchAbroad && !isAbroad(ev)) return false;
    if(regionChoisie && ev.region !== regionChoisie) return false;
    if(lieu && !(String(ev.city || '').toLowerCase().includes(lieu)
      || String(ev.lieu || '').toLowerCase().includes(lieu) || eventCountry(ev).toLowerCase().includes(lieu))) return false;
    if(type !== 'all' && ev.type !== type) return false;
    if(dStart && ev.dateEnd < dStart) return false;
    if(dEnd && ev.dateStart > dEnd) return false;
    if(sexe !== 'all' && ev.sexe !== sexe && ev.sexe !== 'Mixte') return false;
    if(age !== 'all' && !ageList(ev.age).includes(age)) return false;
    if(niveau !== 'all' && ev.niveau !== niveau) return false;
    if(afficheOnly && !ev.poster) return false;
    return true;
  }).sort(parDateRecente);

  // Carte régionale quand une région est choisie.
  const region = (typeof FRANCE_REGIONS !== 'undefined')
    ? FRANCE_REGIONS.find(r=> r.name === regionChoisie) : null;
  if(region) renderRegionMap(region.name, results); else hideRegionMap();

  document.getElementById('resultsCount').textContent = `${results.length} résultat${results.length>1?'s':''}`;

  // Sans repère visible, une liste restreinte au monde passerait pour un bug.
  const abroadNote = searchAbroad
    ? `<div class="abroad-note">🌍 Événements <b>hors de France</b> uniquement
         <button type="button" id="abroadClear">Voir tout</button></div>`
    : '';

  const grid = document.getElementById('resultsGrid');
  if(results.length===0){
    grid.innerHTML = `${abroadNote}<div class="empty-state"><h4>Aucun événement ne correspond</h4><p>${searchAbroad ? 'Aucun événement à l’étranger n’est publié pour le moment.' : 'Essaie d’élargir tes filtres — lieu, dates ou niveau.'}</p></div>`;
    bindAbroadClear();
    return;
  }
  grid.innerHTML = abroadNote + results.map(ev=>`
${eventCardHtml(ev)}`).join('');
  bindAbroadClear();

  grid.querySelectorAll('.event-card').forEach(card=>{
    card.addEventListener('click', ()=> openEvent(card.dataset.id));
  });
}

function bindAbroadClear(){
  const btn = document.getElementById('abroadClear');
  if(btn) btn.addEventListener('click', ()=>{ searchAbroad = false; renderResults(); });
}

/* ---- Carte régionale (page recherche) ---- */
function hideRegionMap(){
  const wrap = document.getElementById('resultsMap');
  if(wrap){ wrap.classList.add('hidden'); wrap.innerHTML = ''; }
}

/* Boîte englobante d'un tracé SVG (coordonnées x y en paires). */
function pathBBox(d){
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for(let i = 0; i + 1 < nums.length; i += 2){
    const x = nums[i], y = nums[i + 1];
    if(x < minX) minX = x; if(x > maxX) maxX = x;
    if(y < minY) minY = y; if(y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/* Dessine la carte d'une région avec un point par événement affiché. */
function renderRegionMap(regionName, results){
  const wrap = document.getElementById('resultsMap');
  if(!wrap || typeof FRANCE_REGIONS === 'undefined') return;
  const region = FRANCE_REGIONS.find(r=> r.name === regionName);
  if(!region){ hideRegionMap(); return; }
  const bb = pathBBox(region.d);
  const pad = 20;
  const vbX = bb.minX - pad, vbY = bb.minY - pad;
  const vbW = (bb.maxX - bb.minX) + pad * 2, vbH = (bb.maxY - bb.minY) + pad * 2;

  // On ne pointe que les événements géographiquement dans le cadre de la région.
  const inView = results.filter(ev=> ev.x != null && ev.y != null
    && ev.x >= bb.minX && ev.x <= bb.maxX && ev.y >= bb.minY && ev.y <= bb.maxY);

  inView.sort((a, b)=> (a.dateStart || '').localeCompare(b.dateStart || ''));

  const pins = inView.map(ev=>{
    const c = TYPE_COLORS[ev.type] || '#607D8B';
    return `<g class="rmap-pin" data-id="${esc(ev.id)}" tabindex="0" role="button" aria-label="${esc(ev.title)}">
      <circle class="rmap-halo" cx="${ev.x}" cy="${ev.y}" r="9" fill="${c}"></circle>
      <circle class="rmap-core" cx="${ev.x}" cy="${ev.y}" r="4.6" fill="${c}"></circle>
      <circle cx="${ev.x}" cy="${ev.y}" r="1.7" fill="#fff"></circle>
      <title>${esc(ev.title)} · ${esc(ev.city || '')}</title>
    </g>`;
  }).join('');

  wrap.classList.remove('hidden');
  wrap.innerHTML = `
    <div class="rmap-title">🗺️ ${esc(regionName)} — ${inView.length} événement${inView.length > 1 ? 's' : ''}</div>
    <div class="region-panel">
      <div class="rmap-col">
        <svg class="rmap-svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" role="img" aria-label="Carte de ${esc(regionName)}">
          <path class="rmap-region" d="${region.d}"></path>
          ${pins}
        </svg>
      </div>
      <div class="rpreview-col" id="rpreviewCol">${regionDefaultPanel(inView)}</div>
    </div>`;

  const panel = document.getElementById('rpreviewCol');
  const byId = id=> inView.find(e=> e.id === id);
  wrap.querySelectorAll('.rmap-pin').forEach(g=>{
    const ev = byId(g.dataset.id);
    g.addEventListener('click', ()=> openEvent(g.dataset.id));
    g.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openEvent(g.dataset.id); } });
    g.addEventListener('mouseenter', ()=>{ if(ev){ panel.innerHTML = regionPreviewCard(ev); panel.classList.add('previewing'); } });
    g.addEventListener('focus', ()=>{ if(ev){ panel.innerHTML = regionPreviewCard(ev); panel.classList.add('previewing'); } });
    g.addEventListener('mouseleave', ()=>{ panel.innerHTML = regionDefaultPanel(inView); panel.classList.remove('previewing'); wireRegionPanel(panel); });
  });
  wireRegionPanel(panel);
}

/* Panneau par défaut : les 3 prochains événements de la région. */
function regionDefaultPanel(list){
  if(!list.length) return `<div class="rpv-empty">Aucun événement sur la carte pour cette recherche.</div>`;
  const cards = list.slice(0, 3).map(regionMiniCard).join('');
  const more = list.length > 3 ? `<div class="rpv-more">+${list.length - 3} autre${list.length - 3 > 1 ? 's' : ''} plus bas</div>` : '';
  return `<div class="rpv-head">À l’affiche</div>${cards}${more}
    <div class="rpv-hint">Survole un point pour voir l’affiche</div>`;
}

/* Grande fiche affichée au survol d'un point. */
function regionPreviewCard(ev){
  const c = TYPE_COLORS[ev.type] || '#607D8B';
  const poster = safeImg(ev.poster)
    ? `<img src="${esc(safeImg(ev.poster))}" alt="Affiche ${esc(ev.title)}">`
    : `<div class="rpv-ph" style="background:linear-gradient(160deg, ${c}55, var(--asphalt-3));color:${c}">${esc(ev.type || '')}</div>`;
  return `<div class="rpv-poster">${poster}</div>
    <div class="rpv-info">
      <span class="rpv-badge" style="background:${c}">${esc(ev.type || '')}</span>
      <b>${esc(ev.title)}</b>
      <span class="rpv-meta">${fmtDateRange(ev.dateStart, ev.dateEnd)}</span>
      <span class="rpv-meta">${esc(ev.city || '')}</span>
    </div>`;
}

/* Petite carte de la liste par défaut. */
function regionMiniCard(ev){
  const c = TYPE_COLORS[ev.type] || '#607D8B';
  const thumb = safeImg(ev.poster)
    ? `<img src="${esc(safeImg(ev.poster))}" alt="">`
    : `<div class="rmini-ph" style="background:${c}22;color:${c}">${esc((ev.type || '?').slice(0, 2))}</div>`;
  return `<button class="rmini" data-id="${esc(ev.id)}">
    <span class="rmini-thumb">${thumb}</span>
    <span class="rmini-txt"><b>${esc(ev.title)}</b><span>${fmtDateRange(ev.dateStart, ev.dateEnd)} · ${esc(ev.city || '')}</span></span>
  </button>`;
}

function wireRegionPanel(panel){
  panel.querySelectorAll('.rmini').forEach(b=> b.addEventListener('click', ()=> openEvent(b.dataset.id)));
}

/* =========================================================
   CREATE EVENT PAGE
   ========================================================= */
/* Valeur du profil diffuseur (renseigné sur /compte/profil), chaîne vide si absent. */
function org(key){
  return (currentProfile && currentProfile[key]) ? String(currentProfile[key]) : '';
}

/* Pré-remplit le bloc « organisateur » du formulaire de publication avec le
   profil diffuseur. On ne touche QU'AUX champs laissés vides : une saisie en
   cours n'est jamais écrasée. */
function prefillOrgFromProfile(){
  const p = currentProfile || {};
  const socials = p.socials || {};
  // Pour chaque champ : la valeur du profil diffuseur, sinon ce qu'on sait
  // déjà ailleurs (Instagram du questionnaire, e-mail du compte).
  const valeurs = {
    'c-orgname': p.orgname,
    'c-insta':   p.orginsta || socials.instagram,
    'c-site':    p.orgsite,
    'c-tel':     p.orgtel,
    'c-email':   p.orgemail || (currentUser && currentUser.email),
  };
  for(const [id, v] of Object.entries(valeurs)){
    const el = document.getElementById(id);
    if(el && !el.value && v) el.value = id === 'c-insta' ? String(v).replace(/^@/, '') : String(v);
  }
}

/* Enregistre le contact saisi dans le profil diffuseur, pour qu'il soit
   pré-rempli au prochain événement (case « Enregistrer ces coordonnées »,
   cochée par défaut). Les champs laissés vides n'effacent rien. */
async function memoriserContact(){
  const coche = document.getElementById('c-save-contact');
  if(!coche || !coche.checked || !currentUser) return;
  if(!window.EBOK_DATA || typeof window.EBOK_DATA.updateUserProfile !== 'function') return;
  const val = id => (document.getElementById(id)?.value || '').trim();
  const contact = {
    orgname: val('c-orgname'),
    orginsta: val('c-insta').replace(/^@/, ''),
    orgsite: val('c-site'),
    orgtel: val('c-tel'),
    orgemail: val('c-email'),
  };
  for(const k of Object.keys(contact)) if(!contact[k]) delete contact[k];
  if(!Object.keys(contact).length) return;
  try{
    await window.EBOK_DATA.updateUserProfile(currentUser.uid, contact);
    currentProfile = Object.assign({}, currentProfile || {}, contact);
  }catch(e){ console.warn('[EBOK] Contact non mémorisé dans le profil', e); }
}

function initCreatePage(){
  const dz = document.getElementById('dropzone');
  const input = document.getElementById('c-affiche');
  const preview = document.getElementById('dzPreview');
  const label = document.getElementById('dzLabel');

  renderAgeChoices('c-age', []);
  renderCountrySelect('c-pays', DEFAULT_COUNTRY);

  // Les détails de voyage n'ont de sens que pour ce type d'événement.
  const typeSel = document.getElementById('c-type');
  if(typeSel){
    const sync = ()=> toggleVoyageBlock('c-voyage', typeSel.value);
    typeSel.addEventListener('change', sync);
    sync();
  }

  // Autocomplétion de ville (fixe la localisation + la région).
  attachCityAutocomplete('c-ville', 'c-ville-ac', pick=>{
    createPickedLocation = pick;
    setRegionValue('c-region', pick.region);
    const hint = document.getElementById('c-ville-hint');
    if(hint){ hint.textContent = '📍 ' + pick.city + (pick.region ? ' · ' + pick.region : '') + ' — localisé sur la carte.'; hint.style.color = 'var(--green)'; }
  });

  input.addEventListener('change', async ()=>{
    const file = input.files[0];
    if(!file) return;
    try{
      preview.src = await compressImage(file, 1200, 0.8);   // réduit le poids avant hébergement
      preview.classList.remove('hidden');
      label.style.display = 'none';
    }catch(err){ console.warn('[EBOK] Compression affiche échouée', err); }
  });
  ['dragover'].forEach(evt=> dz.addEventListener(evt, e=>{ e.preventDefault(); dz.style.borderColor='var(--accent)'; }));
  dz.addEventListener('drop', e=>{
    e.preventDefault();
    if(e.dataTransfer.files.length){ input.files = e.dataTransfer.files; input.dispatchEvent(new Event('change')); }
  });

  /* --- galerie de photos (éditions précédentes), plusieurs fichiers --- */
  const galleryFiles = [];
  const galleryInput = document.getElementById('c-gallery');
  const galleryThumbs = document.getElementById('galleryThumbs');
  function renderGalleryThumbs(){
    galleryThumbs.innerHTML = galleryFiles.map((src,i)=>`
      <div class="gallery-thumb"><img src="${src}" alt="Photo ${i+1}"><button type="button" class="rm" data-i="${i}">&times;</button></div>`).join('');
    galleryThumbs.querySelectorAll('.rm').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        galleryFiles.splice(parseInt(btn.dataset.i,10),1);
        renderGalleryThumbs();
      });
    });
  }
  galleryInput.addEventListener('change', async ()=>{
    for(const file of Array.from(galleryInput.files)){
      try{ galleryFiles.push(await compressImage(file, 900, 0.72)); renderGalleryThumbs(); }
      catch(err){ console.warn('[EBOK] Compression photo échouée', err); }
    }
  });
  const galleryDz = document.getElementById('galleryDropzone');
  galleryDz.addEventListener('dragover', e=> e.preventDefault());
  galleryDz.addEventListener('drop', e=>{
    e.preventDefault();
    if(e.dataTransfer.files.length){ galleryInput.files = e.dataTransfer.files; galleryInput.dispatchEvent(new Event('change')); }
  });

  const form = document.getElementById('createForm');
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();

    // Publication réservée aux diffuseurs connectés (quand l'auth est active).
    if(window.EBOK_AUTH && !currentUser){ openAuth('login'); return; }

    const val = id => (document.getElementById(id)?.value || '').trim();

    const dateStart = val('c-date-debut');
    const dateEnd   = val('c-date-fin') || dateStart;
    const city      = val('c-ville');
    const type      = val('c-type') || 'Divers';

    // Localisation : si l'utilisateur a validé une ville dans la liste de
    // suggestions (et n'a pas retapé par-dessus), on utilise ses coordonnées
    // et sa région EXACTES. Sinon on géocode l'adresse/ville saisie.
    let region = val('c-region');
    let coords;
    if(createPickedLocation && city.toLowerCase().startsWith(createPickedLocation.city.toLowerCase())){
      coords = createPickedLocation;
      if(!region) region = createPickedLocation.region || '';
    }else{
      coords = await resolveCoords(val('c-adresse'), city, region);
    }
    const pays = val('c-pays') || DEFAULT_COUNTRY;
    const {x, y}    = coords;
    const posterSrc = (preview && !preview.classList.contains('hidden')) ? preview.src : null;

    // L'admin (ou le mode démo local) publie directement ; un diffuseur passe
    // en validation. On CRÉE toujours l'événement en "pending" côté serveur :
    // tout compte connecté a le droit de créer SON propre événement en attente,
    // ce qui évite un refus des règles. L'admin le publie ensuite via une mise
    // à jour "propriétaire" (autorisée sur ses propres événements) — pas besoin
    // que les règles reconnaissent déjà l'admin par email.
    const wantApproved = currentIsAdmin || !window.EBOK_AUTH;
    const status = 'pending';

    const newEvent = {
      id: 'evt-' + Date.now(),
      title: val('c-nom') || 'Événement sans nom',
      type,
      city, region, pays,
      lieu: val('c-adresse') || city,
      x, y,
      lat: coords.lat != null ? coords.lat : null,
      lng: coords.lng != null ? coords.lng : null,
      dateStart, dateEnd,
      sexe: val('c-sexe') || 'Mixte',
      age: readAgeChoices('c-age'),
      niveau: val('c-niveau') || 'Loisir',
      tarif: val('c-tarif'),
      lienInscription: lienPropre(val('c-inscription')),
      lienBilletterie: lienPropre(val('c-billetterie')),
      siteOfficiel: lienPropre(val('c-site-officiel')),
      voyage: readVoyage('c', type),
      poster: await hostPoster(posterSrc),
      description: val('c-desc'),
      infos: {
        adresse: val('c-adresse'),
        horaires: val('c-horaires'),
        buvette: val('c-buvette'),
        reservation: val('c-reservation')
      },
      gallery: await hostGallery(galleryFiles),
      placesTotal: val('c-places') ? parseInt(val('c-places'), 10) : null,
      dispo: val('c-dispo') || '',
      // La mise « à la une » est un choix éditorial de l'admin, jamais une option vendue.
      featured: false,
      visibility: 'standard',
      status,
      userId: currentUser ? currentUser.uid : null,
      org: {
        name: val('c-orgname') || org('orgname') || (currentProfile && currentProfile.name) || 'Organisateur',
        insta: (val('c-insta') || org('orginsta')).replace(/^@/, ''),
        site: val('c-site') || org('orgsite'),
        tel: val('c-tel') || org('orgtel'),
        email: val('c-email') || org('orgemail') || (currentUser ? currentUser.email : '')
      }
    };

    // Persistance : si la base est branchée, on enregistre.
    // Sinon l'événement reste en mémoire (visible jusqu'au rechargement).
    let persisted = false;
    let published = false;   // vrai si l'événement est visible publiquement tout de suite
    if(window.EBOK_DATA && typeof window.EBOK_DATA.createEvent === 'function'){
      try{
        newEvent.id = await window.EBOK_DATA.createEvent(newEvent) || newEvent.id;
        persisted = true;
        // Admin (ou démo) : on publie tout de suite via une mise à jour de SON
        // propre événement (autorisée par les règles, sans dépendre de isAdmin).
        // Si l'update est refusé, l'événement reste sagement en attente.
        if(wantApproved && typeof window.EBOK_DATA.approveEvent === 'function'){
          try{ await window.EBOK_DATA.approveEvent(newEvent.id); newEvent.status = 'approved'; published = true; }
          catch(e){ console.warn('[EBOK] Publication directe refusée — événement laissé en attente.', e); }
        }
      }catch(err){
        console.warn('[EBOK] Enregistrement en base échoué.', err);
        const code = String((err && err.code) || '').toLowerCase();
        const msg  = String((err && err.message) || '');
        const tooBig = /longer than|exceeds the maximum|invalid-argument|maximum allowed size/i.test(code + ' ' + msg);
        let banner;
        if(tooBig){
          banner = "⚠️ Enregistrement impossible : l'affiche ou les photos sont trop lourdes. Réessaie avec une image plus légère.";
        }else if(code.includes('permission-denied') || code.includes('unauthenticated')){
          // Le serveur refuse : le compte n'a pas le droit d'écrire cet événement.
          banner = "⚠️ Publication refusée par la base de données. Vérifie que tu es bien connecté à ton compte, puis réessaie. Si tu publies en tant qu'admin, il se peut que ton email ne soit pas encore reconnu comme administrateur.";
        }else if(code.includes('unavailable') || code.includes('network') || /network|offline/i.test(msg)){
          banner = "⚠️ Connexion à la base impossible. Vérifie ta connexion internet et réessaie.";
        }else{
          banner = "⚠️ Enregistrement impossible. Réessaie dans un instant." + (code ? " (code : " + code + ")" : "");
        }
        showCreateBanner(banner);
        return;
      }
    }else if(wantApproved){
      // Mode démo (sans base) : rien à enregistrer, on affiche directement.
      newEvent.status = 'approved';
      published = true;
    }

    // Le contact saisi est retenu pour les prochains événements (avant de
    // vider le formulaire, qui l'effacerait).
    await memoriserContact();

    // Réinitialise le formulaire pour une éventuelle nouvelle publication.
    form.reset();
    createPickedLocation = null;
    const villeHint = document.getElementById('c-ville-hint');
    if(villeHint){ villeHint.textContent = 'Choisis ta ville dans la liste pour la placer sur la carte.'; villeHint.style.color = ''; }
    galleryFiles.length = 0;
    renderGalleryThumbs();
    if(preview){ preview.src = ''; preview.classList.add('hidden'); }
    if(label) label.style.display = '';

    // Un événement publié apparaît tout de suite ; un événement en attente
    // n'est pas montré publiquement avant validation.
    if(published){
      window.EBOK.addEvent(newEvent);
      showConfirm('approved');
    }else{
      showConfirm('pending');
    }
  });
}

function showCreateBanner(msg){
  const banner = document.getElementById('createSuccess');
  banner.textContent = msg;
  banner.classList.remove('hidden');
  banner.scrollIntoView({behavior:'smooth', block:'center'});
}

/* Affiche la page de confirmation après une publication réussie.
   - 'pending'  : événement d'un diffuseur → étudié puis accepté sous 24h.
   - 'approved' : publié en ligne tout de suite (admin ou mode démo). */
function showConfirm(mode){
  const title = document.getElementById('confirmTitle');
  const text  = document.getElementById('confirmText');
  const sub   = document.getElementById('confirmSub');
  if(mode === 'approved'){
    if(title) title.textContent = 'Ton événement est publié ! 🎉';
    if(text)  text.innerHTML = 'Il est déjà visible sur la carte et dans la recherche.';
    if(sub)   sub.textContent = 'Merci de faire vivre le basket francophone 🏀';
  }else{
    if(title) title.textContent = 'Ton événement a bien été créé !';
    if(text)  text.innerHTML = 'Il va être étudié par notre équipe, puis accepté avant publication <b>sous 24h</b>. Tu le retrouveras ensuite sur la carte et dans la recherche, ainsi que dans « Mes événements ».';
    if(sub)   sub.textContent = 'Merci de faire vivre le basket francophone 🏀';
  }
  showPage('confirm');
}

/* Devine des coordonnées SVG à partir de la ville/région saisie, en
   s'appuyant sur les villes connues. À remplacer par une vraie
   géolocalisation (lat/lon + géocodage) à la phase géolocalisation. */
/* Réduit et compresse une image (affiche / photo) avant stockage.
   Une image brute en base64 pèse très lourd en base : la compression
   vite cette limite, d'où l'échec d'enregistrement. On redimensionne à
   `maxDim` px max et on ré-encode en JPEG. */
function compressImage(file, maxDim = 1200, quality = 0.8){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = e=>{
      const img = new Image();
      img.onload = ()=>{
        let { width, height } = img;
        if(width > maxDim || height > maxDim){
          if(width >= height){ height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Héberge l'affiche comme FICHIER (Vercel Blob) et renvoie son URL, au lieu de
 * stocker un data-URI dans la base. Deux raisons : la base restait alourdie par
 * l'image entière, et un data-URI ne peut pas servir d'image d'aperçu au
 * partage (og:image exige une vraie URL).
 *
 * Repli assumé sur le data-URI si l'hébergement échoue (stockage non branché,
 * réseau, fichier refusé) : mieux vaut publier avec une affiche lourde que
 * perdre la publication de l'utilisateur.
 */
async function hostImage(src, name = 'affiche.jpg'){
  if(!src || !/^data:/i.test(src)) return src || null;   // déjà une URL, ou rien
  if(!(window.EBOK_DATA && typeof window.EBOK_DATA.uploadImage === 'function')) return src;
  try{
    return await window.EBOK_DATA.uploadImage(src, name);
  }catch(err){
    console.warn("[EBOK] Hébergement de l'image impossible — conservée dans la fiche.", err);
    return src;
  }
}

/** Héberge l'affiche d'un événement. */
function hostPoster(src){ return hostImage(src, 'affiche.jpg'); }

/** Héberge les photos d'éditions précédentes, en ignorant celles qui échouent. */
async function hostGallery(list){
  if(!Array.isArray(list) || !list.length) return [];
  const out = [];
  for(let i = 0; i < list.length; i++){
    out.push(await hostImage(list[i], `galerie-${i + 1}.jpg`));
  }
  return out.filter(Boolean);
}

function guessCoords(city, region){
  const hay = ((city||'') + ' ' + (region||'')).toLowerCase();
  // 1) ville connue précisément
  for(const [name, xy] of Object.entries(CITY_COORDS)){
    if(hay.includes(name.toLowerCase())) return {x: xy[0], y: xy[1]};
  }
  // 2) sinon un point dans la région cliquée, sinon centre de la France.
  return {x: Math.round(FRANCE_CENTER.x + (Math.random()*50 - 25)),
          y: Math.round(FRANCE_CENTER.y + (Math.random()*50 - 25))};
}

/* Géocode une adresse/ville via l'API Adresse (Base Adresse Nationale,
   gratuite, sans clé, France). Renvoie {x, y, lat, lng} projetés sur la
   carte, ou null si rien trouvé / hors ligne. */
async function geocodeCoords(address, city, region){
  const q = [address, city, region].filter(Boolean).join(', ').trim();
  if(!q) return null;
  try{
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1`;
    const res = await fetch(url);
    if(!res.ok) return null;
    const data = await res.json();
    const f = data.features && data.features[0];
    if(!f || !f.geometry || !Array.isArray(f.geometry.coordinates)) return null;
    const [lng, lat] = f.geometry.coordinates;
    const [x, y] = projGeo(lat, lng);
    return { x: Math.round(x), y: Math.round(y), lat, lng };
  }catch(e){ return null; }
}

/* Cherche une ville dans la base LOCALE par nom exact (insensible aux
   accents/tirets). Renvoie { x, y, lat, lng, region } ou null. */
function cityCoordsLocal(cityName){
  const list = window.CITIES_FR;
  if(!Array.isArray(list) || !cityName) return null;
  const REG = window.CITIES_FR_REGIONS || {};
  const target = normalizeCity(cityName);
  if(!target) return null;
  const row = list.find(r => normalizeCity(r[0]) === target);
  if(!row) return null;
  const [name, postcode, lat, lng, rc] = row;
  const [x, y] = projGeo(lat, lng);
  return { x: Math.round(x), y: Math.round(y), lat, lng, region: REG[rc] || '' };
}

/* Résout les coordonnées : géocodage précis (adresse) d'abord, puis base
   locale des villes, puis repli approximatif sur guessCoords. */
async function resolveCoords(address, city, region){
  const geo = await geocodeCoords(address, city, region);
  if(geo) return geo;
  await ensureCitiesLoaded();
  const local = cityCoordsLocal(city);
  if(local) return local;
  return guessCoords(city, region);
}

/* =========================================================
   AUTOCOMPLÉTION DE VILLE
   ---------------------------------------------------------
   L'utilisateur tape le début d'une ville → liste de suggestions →
   il clique pour valider. On récupère alors les coordonnées EXACTES
   (donc un placement fiable sur la carte) et la RÉGION officielle
   (donc l'événement apparaît bien sur la carte régionale).

   Deux sources, dans l'ordre :
   1) une base LOCALE des villes de France (≈ 5 500 communes ≥ 2 000 hab.,
      pré-enregistrée dans js/cities-fr.js) → réponse instantanée, hors-ligne ;
   2) la Base Adresse Nationale (en ligne, gratuite) → prend le relais pour
      les plus petits villages absents de la base locale.
   ========================================================= */

// Dernière ville validée sur le formulaire de publication (coords + région).
let createPickedLocation = null;

/* Charge (une seule fois, à la demande) la base locale des villes.
   Chargement paresseux : n'alourdit pas la page d'accueil sur mobile. */
let _citiesPromise = null;
function ensureCitiesLoaded(){
  if(window.CITIES_FR) return Promise.resolve();
  if(_citiesPromise) return _citiesPromise;
  _citiesPromise = new Promise(resolve=>{
    const s = document.createElement('script');
    s.src = 'js/cities-fr.js';
    s.onload = ()=> resolve();
    s.onerror = ()=> resolve();   // pas grave : on basculera sur la recherche en ligne
    document.head.appendChild(s);
  });
  return _citiesPromise;
}

/* Normalise pour comparer : minuscules, sans accents, tirets/apostrophes → espaces. */
function normalizeCity(s){
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[-'’]/g, ' ').replace(/\s+/g, ' ').trim();
}

/* Recherche dans la base LOCALE (villes principales). */
function searchCitiesLocal(qStr){
  const list = window.CITIES_FR;
  if(!Array.isArray(list)) return [];
  const REG = window.CITIES_FR_REGIONS || {};
  const nq = normalizeCity(qStr);
  if(!nq) return [];
  const starts = [], contains = [];
  for(const row of list){
    const nn = normalizeCity(row[0]);
    if(nn.startsWith(nq)) starts.push(row);
    else if(contains.length < 12 && nn.includes(nq)) contains.push(row);
  }
  return starts.concat(contains).slice(0, 6).map(([name, postcode, lat, lng, rc])=>
    ({ city: name, region: REG[rc] || '', dept: '', postcode, lat, lng }));
}

/* Recherche en ligne (Base Adresse Nationale) — repli pour les communes
   absentes de la base locale. */
async function searchCitiesBAN(qStr){
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(qStr)}&type=municipality&autocomplete=1&limit=6`;
  const res = await fetch(url);
  if(!res.ok) return [];
  const data = await res.json();
  return (data.features || []).map(f=>{
    const p = f.properties || {};
    const [lng, lat] = (f.geometry && f.geometry.coordinates) || [];
    // context = "66, Pyrénées-Orientales, Occitanie" → on prend la région (dernier élément).
    const parts = String(p.context || '').split(',').map(s=> s.trim());
    const region = parts.length ? parts[parts.length - 1] : '';
    const dept = parts.length > 1 ? parts[1] : '';
    return { city: p.city || p.name || p.label, region, dept, postcode: p.postcode || '', lat, lng };
  }).filter(c=> c.city && typeof c.lat === 'number');
}

/* Recherche des communes : base locale d'abord, puis en ligne si rien. */
async function searchCities(qStr){
  const q = qStr.trim();
  if(q.length < 2) return [];
  await ensureCitiesLoaded();
  const local = searchCitiesLocal(q);
  if(local.length) return local;
  try{ return await searchCitiesBAN(q); }
  catch(e){ return []; }
}

/* Branche l'autocomplétion sur un champ texte. `onPick` reçoit
   { city, region, lat, lng, x, y } quand une ville est validée. */
function attachCityAutocomplete(inputId, listId, onPick){
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  if(!input || !list) return;
  let items = [];
  let active = -1;
  let timer = null;
  let seq = 0;

  const close = ()=>{ list.classList.add('hidden'); list.innerHTML = ''; active = -1; };

  const render = ()=>{
    if(!items.length){ list.innerHTML = `<div class="ac-empty">Aucune ville trouvée.</div>`; list.classList.remove('hidden'); return; }
    list.innerHTML = items.map((c, i)=>
      `<div class="ac-item ${i===active?'active':''}" data-i="${i}" role="option">
        <span class="ac-city">${esc(c.city)}</span>
        <span class="ac-ctx">${esc([c.postcode, c.dept, c.region].filter(Boolean).join(' · '))}</span>
      </div>`).join('');
    list.classList.remove('hidden');
    list.querySelectorAll('.ac-item').forEach(el=>{
      el.addEventListener('mousedown', e=>{ e.preventDefault(); choose(parseInt(el.dataset.i, 10)); });
    });
  };

  const choose = (i)=>{
    const c = items[i];
    if(!c) return;
    const [x, y] = projGeo(c.lat, c.lng);
    input.value = c.city;
    close();
    onPick({ city: c.city, region: c.region, lat: c.lat, lng: c.lng, x: Math.round(x), y: Math.round(y) });
  };

  input.addEventListener('input', ()=>{
    // Toute frappe invalide la ville précédemment validée sur ce champ.
    if(inputId === 'c-ville') createPickedLocation = null;
    if(inputId === 'e-city') editPickedLocation = null;
    clearTimeout(timer);
    const q = input.value;
    if(q.trim().length < 2){ close(); return; }
    const mySeq = ++seq;
    timer = setTimeout(async ()=>{
      try{
        const res = await searchCities(q);
        if(mySeq !== seq) return;               // réponse périmée : on ignore
        items = res; active = -1; render();
      }catch(e){ close(); }
    }, 220);
  });

  input.addEventListener('keydown', e=>{
    if(list.classList.contains('hidden')) return;
    if(e.key === 'ArrowDown'){ e.preventDefault(); active = Math.min(active + 1, items.length - 1); render(); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); active = Math.max(active - 1, 0); render(); }
    else if(e.key === 'Enter' && active >= 0){ e.preventDefault(); choose(active); }
    else if(e.key === 'Escape'){ close(); }
  });

  input.addEventListener('blur', ()=> setTimeout(close, 150));
}

/* =========================================================
   EVENT DETAIL PAGE
   ========================================================= */

/* Mini-carte de France (sous l'affiche) situant l'événement par un point.
   Réutilise les tracés des régions ; cadre limité à la métropole. */
function miniMapHtml(ev){
  if(ev.x == null || ev.y == null || typeof FRANCE_REGIONS === 'undefined') return '';
  const shapes = FRANCE_REGIONS.map(r=> `<path d="${r.d}"/>`).join('');
  const c = TYPE_COLORS[ev.type] || '#607D8B';
  return `<div class="event-mini-map">
    <div class="mini-map-title">📍 ${esc(ev.city || ev.region || 'France')}</div>
    <svg class="mini-france" viewBox="192 122 396 512" role="img" aria-label="Localisation de l'événement sur la carte de France">
      <g class="mini-regions">${shapes}</g>
      <circle class="mini-pin-halo" cx="${ev.x}" cy="${ev.y}" r="15" fill="${c}"></circle>
      <circle class="mini-pin" cx="${ev.x}" cy="${ev.y}" r="7" fill="${c}"></circle>
      <circle cx="${ev.x}" cy="${ev.y}" r="2.6" fill="#fff"></circle>
    </svg>
    <div class="mini-map-foot">${esc(ev.region || '')}</div>
  </div>`;
}

/* Icônes au trait (jeu Feather, licence MIT), dessinées en ligne : pas de
   police d'icônes ni de fichier en plus. Décoratives : le libellé du bouton
   ou son aria-label porte le sens. */
const ICONES = {
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  external: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  zoom: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
  mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mobile: '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  instagram: '<rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  coffee: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  card: '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="m9 14 2 2 4-4"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  chevron: '<polyline points="6 9 12 15 18 9"/>',
};
function ico(nom){
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONES[nom] || ''}</svg>`;
}

/* Lien saisi par un organisateur (inscription, site officiel). On accepte
   « monclub.fr/inscription » sans le https://, et on refuse tout ce qui
   n'est pas une adresse web : jamais de javascript: ni de texte libre dans
   un href. */
function lienPropre(u){
  const s = String(u == null ? '' : u).trim();
  if(!s || /\s/.test(s)) return '';
  if(/^https?:\/\/[^/]+\.[^/]+/i.test(s)) return s;
  if(/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(s)) return 'https://' + s;
  return '';
}

/* Signalement : pas de formulaire ni de table en plus, le courrier part vers
   l'adresse de contact du site (celle du pied de page, jamais écrite en clair
   dans le HTML). Le message arrive déjà rédigé : événement, lien, motif. */
function lienSignalement(ev, motif){
  const a = document.getElementById('footerContact');
  const adresse = a && a.dataset.u && a.dataset.d ? `${a.dataset.u}@${a.dataset.d}` : '';
  if(!adresse) return '';
  const corps = `Bonjour,\n\nJe signale un problème sur cet événement.\n\nÉvénement : ${ev.title}\nLien : ${location.origin}/evenement/${ev.id}\nMotif : ${motif}\n\nPrécisions :\n`;
  return `mailto:${adresse}?subject=${encodeURIComponent('Signalement : ' + ev.title)}&body=${encodeURIComponent(corps)}`;
}

/* Menus de la fiche (Partager, Signaler) : un seul ouvert à la fois, fermés
   par un clic ailleurs ou Échap. */
let menusFicheBranches = false;
function fermerMenusFiche(){
  for(const id of ['popShare', 'popReport']){
    const m = document.getElementById(id);
    if(m) m.classList.remove('open');
  }
  for(const id of ['btnShare', 'btnReport']){
    const b = document.getElementById(id);
    if(b) b.setAttribute('aria-expanded', 'false');
  }
}

/* Contenu du bouton « Enregistrer » de la fiche (étoile + libellé + total). */
function favLgHtml(on, total){
  return `${ico('star')}<span>${on ? 'Enregistré' : 'Enregistrer'}</span>${favBadge(total)}`;
}

async function openEvent(id, opts){
  const fromUrl = Boolean(opts && opts.fromUrl);
  let ev = events.find(e=>e.id===id);
  // Événement absent de la liste publique (ex. en attente de validation) :
  // on le récupère directement depuis la base si possible.
  if(!ev && window.EBOK_DATA && typeof window.EBOK_DATA.getEvent === 'function'){
    try{ ev = await window.EBOK_DATA.getEvent(id); }catch(e){ /* ignore */ }
  }
  if(!ev) return false;
  currentGallery = ev.gallery || [];
  const el = document.getElementById('eventDetail');
  const posterHtml = safeImg(ev.poster)
    ? `<button type="button" class="poster-zoom" id="posterZoom" title="Agrandir l'affiche" aria-label="Agrandir l'affiche">
         <img src="${esc(safeImg(ev.poster))}" alt="Affiche ${esc(ev.title)}">
         <span class="poster-zoom-ic">${ico('zoom')}</span>
       </button>`
    : `<div style="aspect-ratio:3/4;background:linear-gradient(160deg, ${typeColor(ev.type)}44, var(--asphalt-3));display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:var(--font-display);color:${typeColor(ev.type)};font-size:22px;text-align:center;padding:20px;">${esc(String(ev.type || '').toUpperCase())}<br><span style="font-size:13px;color:var(--chalk-dim);font-family:var(--font-body);margin-top:8px;">Affiche à venir</span></div>`;

  const org = ev.org || {};
  const infos = ev.infos || {};
  const voyage = ev.voyage || {};
  const termine = isPast(ev);
  const favOn = favorites.has(ev.id);
  const orgSite = safeUrl(org.site);
  const shareUrl = `${location.origin}/evenement/${ev.id}`;
  const shareText = encodeURIComponent(`${ev.title} — ${fmtDateRange(ev.dateStart,ev.dateEnd)} à ${ev.city}. Plus d'infos :`);

  /* ---- Bloc 2 : l'organisateur (s'inscrire, billetterie, contacter) ----
     Un lien absent ne fait pas disparaître le bouton : il reste en place,
     grisé, et une phrase dit pourquoi. Sur un événement terminé, il n'y a
     plus rien à réserver. */
  const lienInscription = termine ? '' : lienPropre(ev.lienInscription);
  const lienBilletterie = termine ? '' : lienPropre(ev.lienBilletterie);
  const lienSite = lienPropre(ev.siteOfficiel) || (/^https?:/i.test(orgSite) ? orgSite : '');
  const aDesCoordonnees = Boolean(org.tel || org.email || org.insta);
  const bouton = (libelle, lien, icone, raison)=> lien
    ? `<a class="ev-act" href="${esc(lien)}" target="_blank" rel="noopener noreferrer">${ico(icone)}<span>${libelle}</span></a>`
    : `<button type="button" class="ev-act is-off" aria-disabled="true" aria-describedby="evAide" title="${esc(raison)}">${ico(icone)}<span>${libelle}</span></button>`;
  const manques = [];
  if(!lienInscription) manques.push("d'inscription");
  if(!lienBilletterie) manques.push('de billetterie');
  const aide = [];
  if(termine) aide.push('Cet événement est terminé.');
  else if(manques.length) aide.push(`L'organisateur n'a pas encore ajouté de lien ${manques.join(' ni ')}.`);
  if(!aDesCoordonnees) aide.push('Aucune coordonnée renseignée.');
  const contactBtn = aDesCoordonnees
    ? `<button type="button" class="ev-act ev-act-line" id="btnContact" aria-expanded="false" aria-controls="evCoord">${ico('message')}<span>Contacter</span>${ico('chevron')}</button>`
    : `<button type="button" class="ev-act ev-act-line is-off" aria-disabled="true" aria-describedby="evAide" title="Aucune coordonnée renseignée">${ico('message')}<span>Contacter</span></button>`;
  // Les coordonnées ne sont écrites dans la page qu'au clic sur « Contacter ».
  const coordonneesHtml = ()=>{
    const l = [];
    if(org.tel){
      const t = String(org.tel).replace(/\s/g,'');
      l.push(`<a class="ev-coord-row" href="tel:${encodeURIComponent(t)}">${ico('phone')}<span>${esc(org.tel)}</span><em>Appeler</em></a>`);
    }
    if(org.email) l.push(`<a class="ev-coord-row" href="mailto:${encodeURIComponent(org.email)}">${ico('mail')}<span>${esc(org.email)}</span><em>Écrire</em></a>`);
    if(org.insta) l.push(`<a class="ev-coord-row" href="https://instagram.com/${encodeURIComponent(org.insta)}" target="_blank" rel="noopener noreferrer">${ico('instagram')}<span>@${esc(org.insta)}</span><em>Ouvrir</em></a>`);
    return `<div class="ev-coord-list">${l.join('')}</div>`;
  };

  /* ---- Bloc 3 : les infos pratiques, en feuille de match ---- */
  const placesValue = [
    ev.placesTotal ? `${ev.placesTotal} places` : null,
    ev.dispo && DISPO_META[ev.dispo] ? DISPO_META[ev.dispo].label : null
  ].filter(Boolean).join(', ');
  const lieuSous = [ev.region, isAbroad(ev) ? eventCountry(ev) : ''].filter(Boolean).join(', ');
  const lignes = [
    ['Dates', fmtDateRange(ev.dateStart, ev.dateEnd)],
    ['Horaires', infos.horaires],
    ['Lieu', infos.adresse || ev.lieu || ev.city, lieuSous],
    ['Public', [ev.sexe, ageLabel(ev.age)].filter(Boolean).join(', ')],
    ['Niveau', ev.niveau],
    ['Tarif', ev.tarif],
    ['Places', placesValue],
    ['Buvette', infos.buvette],
    ['Réservation', infos.reservation],
    ['Destination', voyage.destination],
    ['Départ', (voyage.dateDepart || voyage.lieuxDepart) ? fmtVoyageLeg(voyage.dateDepart, voyage.lieuxDepart) : ''],
    ['Retour', (voyage.dateRetour || voyage.lieuRetour) ? fmtVoyageLeg(voyage.dateRetour, voyage.lieuRetour) : ''],
    ['Logement', voyage.logement],
  ].filter(r=> r[1]);
  const feuilleHtml = lignes.map(([k, v, sous])=>
    `<div class="ev-row"><dt>${esc(k)}</dt><dd>${esc(v)}${sous ? `<small>${esc(sous)}</small>` : ''}</dd></div>`).join('');

  const gallery = ev.gallery || [];
  const galleryHtml = gallery.length
    ? `<div class="photo-wall">${gallery.map((g,i)=>`
        <div class="photo-card" data-photo="${i}"><div class="ph" style="background:${safeColor(g.color)}">${esc(g.caption)}</div><div class="cap">${esc(g.caption)}</div></div>`).join('')}</div>`
    : `<div class="gallery-empty">Aucune photo d'édition précédente pour le moment.</div>`;

  el.innerHTML = `
    <div class="event-side">
      <div class="ev-poster-card">
        <div class="event-poster">
          ${posterHtml}
          <button type="button" class="fav-btn fav-star ${favOn ? 'active' : ''}" data-fav="${esc(ev.id)}"
            aria-pressed="${favOn}" aria-label="Mettre de côté" title="Mettre de côté">${ico('star')}</button>
        </div>

        <!-- Bloc 1 : ce qu'on fait de l'événement sur EBOK -->
        <div class="ev-bar" role="group" aria-label="Actions sur l'événement">
          <button type="button" class="ev-bar-btn fav-btn fav-btn-lg ${favOn ? 'active' : ''}" data-fav="${esc(ev.id)}" aria-pressed="${favOn}">${favLgHtml(favOn, Number(ev.favCount) || 0)}</button>
          <button type="button" class="ev-bar-btn" id="btnShare" aria-haspopup="true" aria-expanded="false">${ico('share')}<span>Partager</span></button>
          <button type="button" class="ev-bar-btn ev-bar-quiet" id="btnReport" aria-haspopup="true" aria-expanded="false">${ico('flag')}<span>Signaler</span></button>
        </div>

        <div class="popover" id="popShare">
          <a class="popover-item" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=${shareText}%20${encodeURIComponent(shareUrl)}"><span class="ic">${ico('message')}</span>WhatsApp</a>
          <a class="popover-item" href="sms:?&body=${shareText}%20${encodeURIComponent(shareUrl)}"><span class="ic">${ico('mobile')}</span>SMS</a>
          <a class="popover-item" href="mailto:?subject=${encodeURIComponent(ev.title)}&body=${shareText}%20${encodeURIComponent(shareUrl)}"><span class="ic">${ico('mail')}</span>E-mail</a>
          <button type="button" class="popover-item" id="btnCopyLink"><span class="ic">${ico('link')}</span>Copier le lien</button>
          <div class="share-copied" id="shareCopied" role="status">Lien copié ✓</div>
        </div>
        <div class="popover" id="popReport">
          <p class="pop-title">Que veux-tu signaler ?</p>
          <button type="button" class="popover-item" data-motif="Informations erronées">Informations erronées</button>
          <button type="button" class="popover-item" data-motif="Événement annulé ou déjà passé">Événement annulé ou déjà passé</button>
          <button type="button" class="popover-item" data-motif="Doublon d'un autre événement">Doublon d'un autre événement</button>
          <button type="button" class="popover-item" data-motif="Contenu inapproprié ou trompeur">Contenu inapproprié ou trompeur</button>
          <p class="pop-note">Ton application e-mail s'ouvre avec le message prêt à envoyer.</p>
        </div>
      </div>
      ${miniMapHtml(ev)}
    </div>

    <div class="event-main">
      <div class="badges">
        <div class="badges-left">
          <span class="badge solid" style="background:${typeColor(ev.type)}">${esc(ev.type)}</span>
          ${termine ? `<span class="badge">Terminé</span>` : ''}
          ${!termine && ev.dispo && DISPO_META[ev.dispo] ? `<span class="badge badge-dispo ${DISPO_META[ev.dispo].cls}">${DISPO_META[ev.dispo].label}</span>` : ''}
        </div>
        <div class="viewer-counter">
          <span class="vc-icon">${ico('eye')}</span>
          <span class="vc-num" id="vcNum">···</span>
          <span class="vc-label">curieux</span>
        </div>
      </div>
      <h2>${esc(ev.title)}</h2>
      <p class="ev-when">
        <strong>${fmtDateRange(ev.dateStart, ev.dateEnd)}</strong>
        <span>${esc([ev.city, ev.region].filter(Boolean).join(', '))}</span>
        ${currentIsAdmin ? `<button class="edit-inline" data-edit="${esc(ev.id)}" title="Modifier cet événement">✏️ Modifier</button>` : ``}
      </p>

      <!-- Bloc 2 : ce qu'on fait avec l'organisateur -->
      <section class="ev-ticket" aria-label="Organisateur">
        <div class="ev-ticket-top">
          <p class="ev-ticket-kicker">${org.name ? 'Organisé par' : 'Organisateur'}</p>
          ${org.name ? `<h3 class="ev-ticket-name">${esc(org.name)}</h3>` : ''}
          ${lienSite ? `<a class="ev-ticket-site" href="${esc(lienSite)}" target="_blank" rel="noopener noreferrer">${ico('globe')}<span>Site officiel</span>${ico('external')}</a>` : ''}
        </div>
        <div class="ev-ticket-bottom">
          <div class="ev-acts">
            ${bouton("S'inscrire", lienInscription, 'clipboard', termine ? 'Événement terminé' : "Pas de lien d'inscription pour le moment")}
            ${bouton('Billetterie', lienBilletterie, 'ticket', termine ? 'Événement terminé' : 'Pas de billetterie pour le moment')}
          </div>
          ${contactBtn}
          <div class="ev-coord" id="evCoord"><div class="ev-coord-in" id="evCoordIn"></div></div>
          ${aide.length ? `<p class="ev-aide" id="evAide">${esc(aide.join(' '))}</p>` : ''}
        </div>
      </section>

      ${ev.description ? `<p class="event-desc">${esc(ev.description)}</p>` : ''}

      <!-- Bloc 3 : les infos pratiques -->
      <section class="ev-sheet" aria-labelledby="evSheetTitle">
        <h3 class="ev-h" id="evSheetTitle">Infos pratiques</h3>
        <dl class="ev-rows">${feuilleHtml}</dl>
      </section>

      <div class="gallery-block">
        <h3 class="ev-h">Photos d'éditions précédentes</h3>
        ${galleryHtml}
      </div>

      <div class="curieux-counter">
        <span class="cc-eye">${ico('eye')}</span>
        <div>
          <div class="cc-label">Nombre de curieux</div>
          <div class="cc-sub">personnes ont consulté cet événement</div>
        </div>
        <span class="cc-num" id="vcNumBottom">···</span>
      </div>
    </div>`;

  // Menus Partager / Signaler : un seul à la fois.
  const basculerMenu = (menuId, boutonId)=>{
    const menu = document.getElementById(menuId);
    const ouvrir = !menu.classList.contains('open');
    fermerMenusFiche();
    if(ouvrir){
      menu.classList.add('open');
      document.getElementById(boutonId).setAttribute('aria-expanded', 'true');
    }
  };
  document.getElementById('btnShare').addEventListener('click', (e)=>{
    e.stopPropagation();
    // Sur téléphone : la feuille de partage du système (toutes les applis de
    // la personne). Ailleurs, notre petit menu.
    const tactile = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if(tactile && navigator.share){
      fermerMenusFiche();
      navigator.share({ title: ev.title, text: decodeURIComponent(shareText), url: shareUrl }).catch(()=>{});
      return;
    }
    basculerMenu('popShare', 'btnShare');
  });
  document.getElementById('btnReport').addEventListener('click', (e)=>{
    e.stopPropagation();
    basculerMenu('popReport', 'btnReport');
  });
  document.getElementById('btnCopyLink').addEventListener('click', (e)=>{
    e.stopPropagation();
    const copie = ()=>{
      document.getElementById('shareCopied').style.display = 'block';
      setTimeout(()=>{ const m = document.getElementById('shareCopied'); if(m) m.style.display = 'none'; fermerMenusFiche(); }, 1500);
    };
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(shareUrl).then(copie, ()=> window.prompt('Copie ce lien :', shareUrl));
    else window.prompt('Copie ce lien :', shareUrl);
  });
  el.querySelectorAll('#popReport [data-motif]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const href = lienSignalement(ev, b.dataset.motif);
      if(href) window.location.href = href;
    });
  });
  const btnContact = document.getElementById('btnContact');
  if(btnContact){
    btnContact.addEventListener('click', ()=>{
      const zone = document.getElementById('evCoord');
      const dedans = document.getElementById('evCoordIn');
      const ouvrir = !zone.classList.contains('is-open');
      if(ouvrir && !dedans.firstChild) dedans.innerHTML = coordonneesHtml();
      zone.classList.toggle('is-open', ouvrir);
      btnContact.setAttribute('aria-expanded', String(ouvrir));
      btnContact.querySelector('span').textContent = ouvrir ? 'Masquer' : 'Contacter';
    });
  }
  el.querySelectorAll('.photo-card').forEach(card=>{
    card.addEventListener('click', ()=>{
      const item = currentGallery[parseInt(card.dataset.photo,10)];
      if(!item) return;
      openLightbox(item);
    });
  });
  // Clic sur l'affiche → agrandissement plein écran (lightbox).
  const posterZoom = document.getElementById('posterZoom');
  if(posterZoom && ev.poster){
    posterZoom.addEventListener('click', ()=> openLightbox({ img: ev.poster, caption: ev.title }));
  }
  if(!menusFicheBranches){
    menusFicheBranches = true;
    document.addEventListener('click', fermerMenusFiche);
    document.addEventListener('keydown', e=>{ if(e.key === 'Escape') fermerMenusFiche(); });
  }

  showPage('event');
  if(!fromUrl) setUrl('/evenement/' + encodeURIComponent(ev.id));
  loadAndAnimateViews(ev.id);
  return true;
}

/* ---- compteur de « curieux » ----
   Le chiffre vient UNIQUEMENT du serveur (/api/views), qui ne compte un même
   visiteur qu'une fois par jour et par événement. Autrefois, si la couche
   données n'était pas encore chargée (fiche ouverte directement depuis un
   lien) ou si l'appel échouait, la fiche affichait une valeur inventée
   (120 + 1, ou une valeur de démonstration) : d'où des chiffres incohérents
   d'une visite à l'autre. Désormais, sans réponse du serveur, le compteur est
   simplement masqué. Les valeurs de démonstration ne servent plus qu'au mode
   démo local, sans base (aucun module de données sur la page). */
async function attendreDonnees(ms){
  const t0 = Date.now();
  while(!window.EBOK_DATA && Date.now() - t0 < ms){
    await new Promise(r => setTimeout(r, 100));
  }
  return window.EBOK_DATA || null;
}

async function loadAndAnimateViews(id){
  const modeDemo = !document.querySelector('script[src$="clerk-init.js"]');
  let count = null;
  if(modeDemo){
    sessionCounters[id] = (sessionCounters[id] || VIEW_SEEDS[id] || 0) + 1;
    count = sessionCounters[id];
  }else{
    // La couche données est un module chargé après app.js : on l'attend un peu.
    const data = await attendreDonnees(8000);
    if(data && typeof data.incrementViews === 'function'){
      try{
        const c = await data.incrementViews(id);
        if(typeof c === 'number' && !isNaN(c)) count = c;
      }catch(e){ console.warn('[EBOK] Compteur de curieux indisponible', e); }
    }
  }
  // Pas de chiffre fiable : on masque le compteur plutôt que d'en inventer un.
  document.querySelectorAll('.viewer-counter, .curieux-counter').forEach(el=>{
    el.classList.toggle('hidden', count === null);
  });
  if(count === null) return;
  animateCount(document.getElementById('vcNum'), count);
  animateCount(document.getElementById('vcNumBottom'), count);
}
function animateCount(el, target){
  if(!el) return;
  const start = Math.max(0, target - Math.min(40, Math.round(target / 2)));
  const duration = 500;
  const t0 = performance.now();
  function step(t){
    const p = Math.min(1, (t - t0) / duration);
    const val = Math.round(start + (target - start) * p);
    el.textContent = val.toLocaleString('fr-FR');
    if(p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* =========================================================
   UTIL
   ========================================================= */
/* Ferme une modale au clic sur le fond — mais PAS quand ce clic est la fin
   d'une sélection de texte commencée à l'intérieur (sinon la fenêtre se
   ferme quand on surligne du texte dans un champ). On n'agit que si le
   mousedown ET le clic ont eu lieu sur le fond lui-même. */
function bindBackdropClose(modal, closeFn){
  let downOnBackdrop = false;
  modal.addEventListener('mousedown', e=>{ downOnBackdrop = (e.target === modal); });
  modal.addEventListener('click', e=>{ if(e.target === modal && downOnBackdrop) closeFn(); downOnBackdrop = false; });
}

const MONTHS = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
/* N'accepte qu'une date ISO « AAAA-MM-JJ ». Toute autre valeur renvoie null,
   sinon l'affichage produit « NaN undefined ». */
function parseDay(d){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(d == null ? '' : d))) return null;
  const dt = new Date(d + "T00:00:00");
  return isNaN(dt.getTime()) ? null : dt;
}
function fmtDate(d){
  const dt = parseDay(d);
  return dt ? `${dt.getDate()} ${MONTHS[dt.getMonth()]}` : '';
}
function fmtDay(dt){ return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`; }
/* Étape d'un voyage : « 12 juin — Paris, Lyon ». Chaque moitié est optionnelle. */
function fmtVoyageLeg(date, lieu){
  const parts = [];
  if(date && /^\d{4}-\d{2}-\d{2}$/.test(date)) parts.push(fmtDate(date));
  if(lieu) parts.push(lieu);
  return parts.join(' — ');
}
/* Plage lisible. L'année était codée en dur à 2026 : tout événement d'une
   autre année s'affichait avec la mauvaise. Elle est reprise des dates, et
   n'est répétée que si elle change d'un bout à l'autre de la plage. */
function fmtDateRange(s,e){
  const sd = parseDay(s), ed = parseDay(e);
  if(!sd && !ed) return '';
  if(!sd || !ed) return fmtDay(sd || ed);
  if(sd.getTime() === ed.getTime()) return fmtDay(sd);
  if(sd.getFullYear() !== ed.getFullYear()) return `${fmtDay(sd)} — ${fmtDay(ed)}`;
  if(sd.getMonth() === ed.getMonth()) return `${sd.getDate()} — ${fmtDay(ed)}`;
  return `${sd.getDate()} ${MONTHS[sd.getMonth()]} — ${fmtDay(ed)}`;
}

function openLightbox(item){
  const content = document.getElementById('lightboxContent');
  // `item` vient de la fiche d'un événement, donc d'un membre : tout est
  // échappé, et l'image ne peut être qu'une vraie adresse d'image.
  const img = safeImg(item.img);
  if(img){
    content.innerHTML = `<img src="${esc(img)}" alt="${esc(item.caption || 'Photo')}">`;
  }else{
    content.innerHTML = `<div class="lightbox-placeholder" style="background:${safeColor(item.color || '#28282D')}">${esc(item.caption || '')}</div>`;
  }
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox(){ document.getElementById('lightbox').classList.remove('open'); }
document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
document.getElementById('lightbox').addEventListener('click', (e)=>{
  if(e.target.id==='lightbox') closeLightbox();
});
document.addEventListener('keydown', (e)=>{
  if(e.key==='Escape' && document.getElementById('lightbox').classList.contains('open')) closeLightbox();
});
document.getElementById('adminRulesDismiss')?.addEventListener('click', ()=>{
  document.getElementById('adminRulesAlert')?.classList.add('hidden');
});

/* ---- Admin : hébergement des affiches encore stockées en base ----
   Le serveur travaille par petits lots (une fonction serverless a un temps
   d'exécution limité, et une image en base64 pèse lourd) : on relance tant
   qu'il reste des fiches, en affichant la progression. */
function initPostersMaintenance(){
  const runBtn = document.getElementById('postersRun');
  const dryBtn = document.getElementById('postersDry');
  const status = document.getElementById('postersStatus');
  if(!runBtn || !dryBtn || !status) return;

  const setBusy = on =>{ runBtn.disabled = on; dryBtn.disabled = on; };
  const say = (msg, cls='') =>{ status.className = 'maint-status' + (cls ? ' ' + cls : ''); status.textContent = msg; };

  async function call(dry){
    const fn = window.EBOK_DATA && window.EBOK_DATA.hostStoredPosters;
    if(!fn){ say('Base non branchée : action indisponible.', 'ko'); return null; }
    return fn({ dry });
  }

  dryBtn.addEventListener('click', async ()=>{
    setBusy(true); say('⏳ Analyse en cours…');
    try{
      const r = await call(true);
      if(!r) return;
      say(r.restant
        ? `${r.restant} fiche${r.restant > 1 ? 's' : ''} à héberger. Clique sur « Héberger les affiches » pour lancer.`
        : '✅ Rien à faire : toutes les affiches sont déjà hébergées.');
    }catch(err){
      say(messageForPosters(err), 'ko');
    }finally{ setBusy(false); }
  });

  runBtn.addEventListener('click', async ()=>{
    setBusy(true);
    let total = 0, ko = 0, libere = 0;
    try{
      // Boucle bornée : sans garde-fou, une fiche qui échoue en boucle
      // relancerait indéfiniment la migration.
      for(let tour = 0; tour < 100; tour++){
        const r = await call(false);
        if(!r) return;
        total  += r.traitees || 0;
        ko     += (r.echecs || []).length;
        libere += r.allegementKo || 0;
        say(`⏳ ${total} affiche${total > 1 ? 's' : ''} hébergée${total > 1 ? 's' : ''}… ${r.restant} restante${r.restant > 1 ? 's' : ''}`);
        if(!r.relancer) break;
      }
      const allege = libere > 1024 ? `${(libere/1024).toFixed(1)} Mo` : `${libere} Ko`;
      say(`✅ Terminé — ${total} affiche${total > 1 ? 's' : ''} hébergée${total > 1 ? 's' : ''}, ${allege} retirés de la base.`
        + (ko ? ` ${ko} échec${ko > 1 ? 's' : ''} (voir la console).` : ''), 'ok');
      await refreshPublicEvents();
      renderAll();
    }catch(err){
      say(messageForPosters(err), 'ko');
    }finally{ setBusy(false); }
  });
}

/* La cause la plus probable est l'absence de stockage connecté : le dire
   plutôt que d'afficher un code d'erreur. */
function messageForPosters(err){
  const code = String((err && (err.code || err.message)) || '');
  if(/stockage_mal_configure/.test(code)){
    return "⚠️ La valeur de BLOB_READ_WRITE_TOKEN n'a pas la forme attendue : elle doit commencer par « vercel_blob_rw_ », sans guillemets ni nom de variable. Corrige-la dans Vercel, puis redéploie.";
  }
  if(/stockage_indisponible|503/.test(code)){
    return "⚠️ Aucun stockage de fichiers connecté : ajoute un Blob store dans Vercel → Storage, puis redéploie.";
  }
  if(/admin|403/.test(code)) return "⚠️ Action réservée à l'administrateur.";
  console.warn('[EBOK] hébergement des affiches :', err);
  return "⚠️ L'hébergement a échoué. Réessaie dans un instant.";
}

let featuredTimer = null;   // défilement automatique du carrousel "à la une"

function renderFeatured(){
  const featured = events.filter(e=>e.featured);
  const track = document.getElementById('carouselTrack');
  const dotsContainer = document.getElementById('carouselDots');
  const slot = document.getElementById('featuredSlot');
  if(featuredTimer){ clearInterval(featuredTimer); featuredTimer = null; }
  if(!track || !slot) return;
  if(featured.length === 0){ slot.style.display = 'none'; return; }
  slot.style.display = '';

  let currentSlide = 0;

  // Slides — bannière immersive : affiche floutée en fond + affiche nette à
  // gauche + texte clair sur voile sombre (rendu premium, jamais "blanc").
  track.innerHTML = featured.map(ev=>{
    const c = TYPE_COLORS[ev.type] || '#607D8B';
    const bg = safeImg(ev.poster)
      ? `background-image:url("${encodeURI(safeImg(ev.poster))}")`
      : `background:radial-gradient(120% 120% at 20% 0%, ${c}, #101014 70%)`;
    const poster = safeImg(ev.poster)
      ? `<img src="${esc(safeImg(ev.poster))}" alt="Affiche ${esc(ev.title)}">`
      : `<div class="fx-poster-ph" style="--c:${c}">${esc((ev.type||'').slice(0,12).toUpperCase())}</div>`;
    const meta = [fmtDateRange(ev.dateStart, ev.dateEnd), ev.niveau, ev.sexe].filter(Boolean).join(' · ');
    return `<div class="carousel-item">
      <div class="fx-bg ${safeImg(ev.poster) ? 'blur' : ''}" style="${bg}"></div>
      <div class="fx-scrim"></div>
      <div class="fx-content">
        <div class="fx-poster" data-open="${esc(ev.id)}" role="button" tabindex="0" aria-label="Voir l'événement ${esc(ev.title)}">${poster}</div>
        <div class="fx-text">
          <span class="featured-tag">★ À la une</span>
          <span class="featured-cat"><span class="dot" style="background:${c}"></span>${esc(ev.type || 'Événement')}</span>
          <h3>${esc(ev.title)}</h3>
          <p class="featured-place">📍 ${esc(ev.city || '')}${ev.region ? ' · ' + esc(ev.region) : ''}</p>
          <p class="featured-meta">📅 ${esc(meta)}</p>
          <div class="featured-actions">
            <button class="btn btn-primary" data-open="${esc(ev.id)}">Voir l'événement</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  // Points
  dotsContainer.innerHTML = featured.map((_, i)=>
    `<button class="carousel-dot ${i===0 ? 'active' : ''}" data-slide="${i}" aria-label="Aller à l'événement ${i+1}"></button>`).join('');

  const prev = document.getElementById('carouselPrev');
  const next = document.getElementById('carouselNext');
  const single = featured.length <= 1;
  // Un seul événement : pas de flèches, points ni défilement.
  if(prev) prev.style.display = single ? 'none' : '';
  if(next) next.style.display = single ? 'none' : '';
  dotsContainer.style.display = single ? 'none' : '';

  function goToSlide(n){
    currentSlide = (n + featured.length) % featured.length;
    track.style.transform = `translateX(-${currentSlide * 100}%)`;
    dotsContainer.querySelectorAll('.carousel-dot').forEach((d,i)=> d.classList.toggle('active', i===currentSlide));
  }
  function stopAuto(){ if(featuredTimer){ clearInterval(featuredTimer); featuredTimer = null; } }
  function startAuto(){ stopAuto(); if(!single) featuredTimer = setInterval(()=> goToSlide(currentSlide + 1), 5000); }

  if(prev) prev.onclick = ()=>{ goToSlide(currentSlide - 1); startAuto(); };
  if(next) next.onclick = ()=>{ goToSlide(currentSlide + 1); startAuto(); };
  dotsContainer.querySelectorAll('.carousel-dot').forEach(dot=>
    dot.onclick = ()=>{ goToSlide(parseInt(dot.dataset.slide, 10)); startAuto(); });
  track.querySelectorAll('[data-open]').forEach(b=>{
    b.addEventListener('click', ()=> openEvent(b.dataset.open));
    // L'affiche n'est pas un vrai bouton : Entrée doit l'ouvrir aussi.
    if(b.tagName !== 'BUTTON') b.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); openEvent(b.dataset.open); } });
  });

  // Pause au survol pour laisser le temps de lire.
  const wrapper = slot.querySelector('.carousel-wrapper');
  if(wrapper){ wrapper.onmouseenter = stopAuto; wrapper.onmouseleave = startAuto; }

  // Balayage au doigt : la piste suit le doigt, puis passe à la diapositive
  // voisine si le geste est assez franc, sinon revient. Un geste vertical
  // laisse la page défiler. (Propriétés on… : la fonction est rappelée à
  // chaque mise à jour des événements, un écouteur s'empilerait.)
  if(wrapper){
    let x0 = 0, y0 = 0, dx = 0, sens = null;   // sens : null = indécis, true = horizontal
    wrapper.ontouchstart = e=>{
      if(single || e.touches.length !== 1){ sens = false; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; sens = null;
      stopAuto();
    };
    wrapper.ontouchmove = e=>{
      if(sens === false || e.touches.length !== 1) return;
      const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
      if(sens === null){
        if(Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        sens = Math.abs(mx) > Math.abs(my);
        if(!sens) return;
        track.style.transition = 'none';
      }
      dx = mx;
      if(e.cancelable) e.preventDefault();
      track.style.transform = `translateX(calc(-${currentSlide * 100}% + ${dx}px))`;
    };
    wrapper.ontouchend = wrapper.ontouchcancel = ()=>{
      if(sens === true){
        track.style.transition = '';
        const seuil = Math.min(70, wrapper.clientWidth * 0.18);
        goToSlide(Math.abs(dx) > seuil ? currentSlide + (dx < 0 ? 1 : -1) : currentSlide);
      }
      sens = null;
      startAuto();
    };
  }

  goToSlide(0);
  startAuto();
}

/* =========================================================
   NAVIGATION
   ========================================================= */
/* =========================================================
   URL PAR ÉVÉNEMENT (History API)
   ---------------------------------------------------------
   Chaque fiche a sa propre adresse `/evenement/<id>` : les liens partagés
   fonctionnent, le retour arrière du navigateur aussi, et une fiche peut être
   mise en favori. On reste pour autant sur une seule page — aucun rechargement
   à la navigation, la carte et les filtres ne sont jamais reconstruits.

   Côté hébergement, `/evenement/*` est réécrit vers index.html (voir
   vercel.json), sinon un accès direct renverrait un 404.
   ========================================================= */
const EVENT_PATH = /^\/evenement\/([^/]+)\/?$/;

/** ID d'événement présent dans l'URL courante, ou null. */
function eventIdFromUrl(){
  const m = EVENT_PATH.exec(location.pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Change l'URL sans recharger, en évitant les entrées d'historique en double. */
function setUrl(path){
  if(location.pathname === path) return;
  history.pushState({}, '', path);
}

// Vrai le temps d'aligner l'affichage sur l'URL (retour arrière) : dans ce cas
// c'est le navigateur qui a déjà changé l'URL, il ne faut pas y retoucher.
let syncingFromUrl = false;

// Fiche demandée par l'URL au chargement, tant qu'elle n'a pas pu être ouverte.
// Les événements arrivent en deux temps (données locales, puis la base via
// clerk-init.js) : on retente donc à l'arrivée des données.
let pendingUrlEventId = eventIdFromUrl();

async function tryOpenFromUrl(){
  if(!pendingUrlEventId) return;
  if(await openEvent(pendingUrlEventId, {fromUrl:true})) pendingUrlEventId = null;
}

// Retour / avance du navigateur.
window.addEventListener('popstate', ()=>{
  const id = eventIdFromUrl();
  if(id){ openEvent(id, {fromUrl:true}); return; }
  syncingFromUrl = true;
  showPage('home');
  syncingFromUrl = false;
});

function showPage(name){
  // Espace réservé aux comptes connectés (si l'auth est active).
  if(name === 'profile' && !currentUser && window.EBOK_AUTH){ openAuth('login'); return; }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.querySelectorAll('.navlink').forEach(n=>n.classList.toggle('active', n.dataset.nav===name));
  // Publier exige un compte : on propose la connexion sans masquer le formulaire.
  if(name === 'create' && !currentUser && window.EBOK_AUTH){ openAuth('login'); }
  // Précharge la base des villes dès qu'on arrive sur la page de publication.
  if(name === 'create'){ ensureCitiesLoaded(); prefillOrgFromProfile(); }
  if(name === 'profile'){ renderProfile(); renderOnboardingNudge(); }
  if(name === 'favoris') renderFavorites();
  if(name === 'alertes') ouvrirPageAlertes();
  // Quitter une fiche événement : on revient à l'URL racine.
  if(!syncingFromUrl && name !== 'event' && eventIdFromUrl()) setUrl('/');
  syncMenuActif(name);
  window.scrollTo({top:0, behavior:'instant'});
}
/* Met en valeur la page courante dans le volet. */
function syncMenuActif(nom){
  for(const l of document.querySelectorAll('.side-menu-link[data-nav]')){
    l.classList.toggle('active', l.dataset.nav === nom);
  }
}
document.querySelectorAll('[data-nav]').forEach(el=>{
  el.addEventListener('click', ()=> showPage(el.dataset.nav));
});

/* =========================================================
   AUTHENTIFICATION & ESPACE DIFFUSEUR / ADMIN
   ========================================================= */
let currentUser = null;
let currentProfile = null;
let currentIsAdmin = false;
let favorites = new Set();

/* ---------- Favoris (mettre un événement de côté) ---------- */
async function loadFavorites(){
  if(currentUser && window.EBOK_DATA && window.EBOK_DATA.getFavorites){
    try{ favorites = new Set(await window.EBOK_DATA.getFavorites(currentUser.uid)); }
    catch(e){ favorites = new Set(); }
  }else if(!window.EBOK_AUTH){
    // Mode démo (sans base) : on garde les favoris en local.
    try{ favorites = new Set(JSON.parse(localStorage.getItem('ebok-favs') || '[]')); }
    catch(e){ favorites = new Set(); }
  }else{
    favorites = new Set();
  }
}

async function toggleFav(id){
  // Il faut un compte pour enregistrer (sauf en mode démo local).
  if(!currentUser && window.EBOK_AUTH){ openAuth('login'); return; }
  const add = !favorites.has(id);
  if(add) favorites.add(id); else favorites.delete(id);
  // Le total public bouge tout de suite : attendre la réponse du serveur
  // donnerait l'impression que le clic n'a pas été pris en compte.
  const ev = events.find(e=> e.id === id);
  if(ev) ev.favCount = Math.max(0, (Number(ev.favCount) || 0) + (add ? 1 : -1));
  updateFavButtons(id);
  if(currentUser && window.EBOK_DATA && window.EBOK_DATA.toggleFavorite){
    try{ await window.EBOK_DATA.toggleFavorite(currentUser.uid, id, add); }
    catch(e){ /* on garde l'état local même si l'écriture échoue */ }
  }else{
    localStorage.setItem('ebok-favs', JSON.stringify([...favorites]));
  }
  if(document.getElementById('page-favoris').classList.contains('active')) renderFavorites();
}

function updateFavButtons(id){
  const on = favorites.has(id);
  const ev = events.find(e=> e.id === id);
  const total = ev ? (Number(ev.favCount) || 0) : 0;
  document.querySelectorAll(`.fav-btn[data-fav="${id}"]`).forEach(b=>{
    b.classList.toggle('active', on);
    if(b.classList.contains('fav-btn-lg')){
      b.innerHTML = favLgHtml(on, total);
    }
    if(b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', String(on));
  });
  for(const el of document.querySelectorAll(`[data-fav-count="${id}"]`)){
    el.textContent = total > 0 ? total : '';
    el.classList.toggle('hidden', total <= 0);
  }
}

/* Pastille du total, à côté du libellé du bouton. Masquée à zéro : « 0
   intéressé » dessert un événement qui vient d'être publié. */
function favBadge(total){
  return total > 0 ? ` <span class="fav-count-inline">${total}</span>` : '';
}

// Délégation en phase de capture : le clic sur ♥ n'ouvre pas l'événement.
document.addEventListener('click', (e)=>{
  const btn = e.target.closest && e.target.closest('.fav-btn');
  if(btn){ e.preventDefault(); e.stopPropagation(); toggleFav(btn.dataset.fav); }
}, true);

// Idem pour le raccourci d'édition admin (pastille sur la carte ou bouton en
// ligne sur la fiche) : il ouvre la modale, pas l'événement.
document.addEventListener('click', (e)=>{
  const btn = e.target.closest && e.target.closest('[data-edit]');
  if(btn){ e.preventDefault(); e.stopPropagation(); openEditModal(btn.dataset.edit); }
}, true);

async function renderFavorites(){
  const grid = document.getElementById('favoritesGrid');
  if(!currentUser && window.EBOK_AUTH){
    grid.innerHTML = `<div class="empty-state"><h4>Retrouve tes événements en un clic</h4>
      <p>Connecte-toi, puis clique sur le ♥ d'un événement pour le mettre de côté.</p>
      <button class="btn btn-primary" data-auth="login">Se connecter</button></div>`;
    return;
  }
  const ids = [...favorites];
  if(!ids.length){
    grid.innerHTML = `<div class="empty-state"><h4>Aucun favori</h4><p>Clique sur le ♥ d'un événement pour le mettre de côté.</p></div>`;
    return;
  }
  // Événements connus localement + récupération des éventuels manquants.
  const list = [];
  for(const id of ids){
    let ev = events.find(e=>e.id===id);
    if(!ev && window.EBOK_DATA && window.EBOK_DATA.getEvent){
      try{ ev = await window.EBOK_DATA.getEvent(id); }catch(e){ ev = null; }
    }
    if(ev) list.push(ev);
  }
  if(!list.length){
    grid.innerHTML = `<div class="empty-state"><h4>Aucun favori</h4><p>Clique sur le ♥ d'un événement pour le mettre de côté.</p></div>`;
    return;
  }
  // À venir d'abord (le plus proche en tête), terminés ensuite.
  const debut = e=> String(e.dateStart || '');
  list.sort((a,b)=> (isPast(a) - isPast(b)) || (isPast(a) ? debut(b).localeCompare(debut(a)) : debut(a).localeCompare(debut(b))));
  grid.innerHTML = list.map(eventCardHtml).join('');
  grid.querySelectorAll('.event-card').forEach(card=>{
    card.addEventListener('click', ()=> openEvent(card.dataset.id));
  });
}

// Boutons « Se connecter » des états vides (favoris, alertes).
document.addEventListener('click', e=>{
  const b = e.target.closest && e.target.closest('[data-auth]');
  if(b) openAuth(b.dataset.auth);
});

/* ---------- Connexion (déléguée à Clerk) ---------- */
/* Il n'y a pas de formulaire de connexion maison : e-mail, mot de passe,
   Google, vérification et réinitialisation sont entièrement gérés par le
   widget Clerk (voir js/clerk.js). */

/** Ouvre le widget Clerk. `tab` vaut 'login' ou 'signup'. */
function openAuth(tab){
  if(window.EBOK_AUTH && typeof window.EBOK_AUTH.openSignIn === 'function'){
    window.EBOK_AUTH.openSignIn(tab === 'signup' ? 'signup' : 'login');
    return;
  }
  // Clerk n'a pas pu se charger : on le dit, plutôt que de ne rien faire.
  showAuthUnavailable();
}

/* Bandeau affiché quand le service de comptes est injoignable (Clerk bloqué
   par un bloqueur de contenu, coupure réseau, site ouvert en file://). Sans
   lui, les boutons « Se connecter » resteraient sans effet et sans
   explication. */
function showAuthUnavailable(){
  let box = document.getElementById('authUnavailable');
  if(!box){
    box = document.createElement('div');
    box.id = 'authUnavailable';
    box.className = 'auth-unavailable';
    box.setAttribute('role', 'alert');
    box.innerHTML =
      '<span>Les comptes sont momentanément injoignables. '
      + 'Vérifie ta connexion ou désactive ton bloqueur de publicités, puis recharge la page.</span>'
      + '<button type="button" class="auth-unavailable-close" aria-label="Fermer">&times;</button>';
    box.querySelector('button').addEventListener('click', ()=> box.remove());
    document.body.appendChild(box);
  }
  clearTimeout(showAuthUnavailable._t);
  showAuthUnavailable._t = setTimeout(()=> box.remove(), 10000);
}

/* Grise les boutons de compte tant que Clerk n'a pas répondu. Appelé par
   clerk-init.js : `ready` faux = service injoignable. */
function setAuthAvailable(ready){
  for(const id of ['btnLogin', 'btnSignup']){
    const el = document.getElementById(id);
    if(!el) continue;
    el.disabled = !ready;
    el.title = ready ? '' : 'Service de comptes momentanément injoignable';
  }
}

/* ---------- Profil membre (questions inscription + édition) ---------- */
const ROLE_OPTIONS = ["Joueur", "Coach", "Organisateur", "Club", "Ligue", "Entreprise", "Média", "Autre"];
/* Rôles qui publient au nom d'une structure : on leur demande son identité à
   l'inscription, ce qui pré-remplit ensuite le formulaire de publication. */
const ROLES_STRUCTURE = ["Organisateur", "Club", "Ligue", "Entreprise", "Média"];
/* Réseaux proposés à tous les profils, tous facultatifs. Stockés sous
   `socials`, et non à la racine du profil, pour ne pas mélanger l'identité
   d'un membre avec ses comptes. */
const SOCIAL_KEYS = ["instagram", "tiktok", "snapchat", "facebook", "linkedin"];
/* Libellés affichés dans « À propos de moi ». */
const SOCIAL_LABELS = [
  ["instagram", "Instagram"], ["tiktok", "TikTok"], ["snapchat", "Snapchat"],
  ["facebook", "Facebook"], ["linkedin", "LinkedIn"],
];
const INTEREST_OPTIONS = ["Tournois", "Camps", "Circuit 3x3", "Détections", "All-Star Game", "Clinic Coachs", "Show", "Voyage", "Matchs de Gala", "Handibasket"];
const MAX_INTERESTS = 3;
/* Niveaux de pratique, du plus accessible au plus élevé. Posés aux joueurs à
   l'inscription (voir la modale de bienvenue). */
const NIVEAU_OPTIONS = ["Loisir", "Département", "Région", "National", "Pro"];
const profilePhoto = {};          // dataURL de la photo, par préfixe ("su-", "pe-")

// Applique l'aperçu de la photo de profil pour un préfixe donné.
function setProfilePhotoPreview(p){
  const prev = document.getElementById(p + 'photoPrev');
  if(!prev) return;
  const src = profilePhoto[p];
  if(src){ prev.style.backgroundImage = `url(${src})`; prev.classList.add('has-photo'); prev.innerHTML = ''; }
  else{ prev.style.backgroundImage = ''; prev.classList.remove('has-photo'); prev.innerHTML = '<span>+</span>'; }
}

/* Champs de profil réutilisés à l'inscription (prefix "su-") et dans la
   modale d'édition (prefix "pe-"). */
function profileFieldsHtml(p){
  const roleOpts = `<option value="">—</option>` + ROLE_OPTIONS.map(r=> `<option value="${r}">${r}</option>`).join('');
  const interests = INTEREST_OPTIONS.map(i=>
    `<label class="chip-check"><input type="checkbox" name="${p}interest" value="${esc(i)}"><span>${esc(i)}</span></label>`).join('');
  return `
    <div class="field">
      <label>Photo de profil</label>
      <div class="photo-upload">
        <div class="photo-avatar-prev" id="${p}photoPrev" aria-hidden="true"><span>+</span></div>
        <div>
          <input type="file" id="${p}photoFile" accept="image/*">
          <p class="field-hint">JPG ou PNG, format carré de préférence.</p>
        </div>
      </div>
    </div>
    <div class="field">
      <label for="${p}pseudo">Pseudo</label>
      <input type="text" id="${p}pseudo" placeholder="Ex. MarleyB34">
    </div>
    <div class="field">
      <label for="${p}role">Tu es…</label>
      <select id="${p}role" data-role-select="${p}">${roleOpts}</select>
    </div>
    <div class="field hidden" data-role-other="${p}">
      <label for="${p}roleOther">Précise</label>
      <input type="text" id="${p}roleOther" placeholder="Ex. Parent, photographe, média…">
    </div>
    <div class="form-row">
      <div class="field">
        <label for="${p}age">Âge</label>
        <input type="number" id="${p}age" min="5" max="99" placeholder="Ex. 24">
      </div>
      <div class="field">
        <label for="${p}sexe">Sexe</label>
        <select id="${p}sexe">
          <option value="">—</option>
          <option>Masculin</option>
          <option>Féminin</option>
          <option>Autre</option>
        </select>
      </div>
    </div>
    <div class="field hidden" data-role-practice="${p}">
      <label for="${p}practice">Niveau de pratique / club / catégorie</label>
      <input type="text" id="${p}practice" placeholder="Ex. Régional U17, ou nom de ton club">
    </div>
    <div class="field">
      <label for="${p}favClub">Club préféré</label>
      <input type="text" id="${p}favClub" placeholder="Ex. ASVEL, Paris Basketball…">
    </div>
    <div class="field">
      <label>Événements qui t'intéressent le plus <span class="field-hint">(${MAX_INTERESTS} choix max)</span></label>
      <div class="chip-checks" data-interests="${p}">${interests}</div>
    </div>
    <div class="field">
      <label>Tes réseaux <span class="field-hint">(facultatif)</span></label>
      <div class="socials-grid">
        ${SOCIAL_LABELS.map(([cle, label])=> `
          <div class="field social-field">
            <label for="${p}${cle}">${esc(label)}</label>
            <input type="text" id="${p}${cle}" placeholder="${cle === 'facebook' || cle === 'linkedin' ? 'Nom ou lien' : '@moncompte'}">
          </div>`).join('')}
      </div>
    </div>`;
}

/* Comportements dynamiques : champs conditionnels + limite d'intérêts. */
function wireProfileFields(p){
  const role = document.getElementById(p + 'role');
  const other = document.querySelector(`[data-role-other="${p}"]`);
  const practice = document.querySelector(`[data-role-practice="${p}"]`);
  if(role && other && practice){
    const sync = ()=>{
      const v = role.value;
      other.classList.toggle('hidden', v !== 'Autre');
      practice.classList.toggle('hidden', !(v === 'Joueur' || v === 'Coach'));
    };
    if(!role.dataset.wired){ role.addEventListener('change', sync); role.dataset.wired = '1'; }
    sync();
  }
  const boxes = [...document.querySelectorAll(`[data-interests="${p}"] input[type=checkbox]`)];
  const enforce = ()=>{
    const full = boxes.filter(x=> x.checked).length >= MAX_INTERESTS;
    boxes.forEach(x=>{ x.disabled = full && !x.checked; x.closest('.chip-check')?.classList.toggle('disabled', x.disabled); });
  };
  boxes.forEach(b=>{
    if(!b.dataset.wired){ b.addEventListener('change', enforce); b.dataset.wired = '1'; }
  });
  enforce();

  // Photo de profil : lecture du fichier en dataURL + aperçu.
  const photoInput = document.getElementById(p + 'photoFile');
  if(photoInput && !photoInput.dataset.wired){
    photoInput.addEventListener('change', ()=>{
      const file = photoInput.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = e=>{ profilePhoto[p] = e.target.result; setProfilePhotoPreview(p); };
      reader.readAsDataURL(file);
    });
    photoInput.dataset.wired = '1';
  }
  setProfilePhotoPreview(p);
}

/* Lit les champs de profil en un objet prêt à stocker. */
function readProfileFields(p){
  const g = id => (document.getElementById(p + id)?.value || '').trim();
  const role = g('role');
  const isPlayerOrCoach = role === 'Joueur' || role === 'Coach';
  const ageNum = parseInt(g('age'), 10);
  const interests = [...document.querySelectorAll(`[data-interests="${p}"] input:checked`)].map(x=> x.value).slice(0, MAX_INTERESTS);
  return {
    pseudo: g('pseudo'),
    photo: profilePhoto[p] || '',
    role,
    roleOther: role === 'Autre' ? g('roleOther') : '',
    age: isNaN(ageNum) ? null : ageNum,
    sexe: g('sexe'),
    practice: isPlayerOrCoach ? g('practice') : '',
    favClub: g('favClub'),
    interests,
    socials: Object.fromEntries(SOCIAL_KEYS.map(c=> [c, g(c).replace(/^@/, '')])),
  };
}

/* Pré-remplit les champs de profil à partir d'un profil existant. */
function fillProfileFields(p, prof){
  prof = prof || {};
  const s = (id, v)=>{ const el = document.getElementById(p + id); if(el) el.value = (v == null ? '' : v); };
  s('pseudo', prof.pseudo || '');
  profilePhoto[p] = prof.photo || '';
  s('role', prof.role || '');
  s('roleOther', prof.roleOther || '');
  s('age', prof.age != null ? prof.age : '');
  s('sexe', prof.sexe || '');
  s('practice', prof.practice || '');
  s('favClub', prof.favClub || '');
  const socials = prof.socials || {};
  for(const cle of SOCIAL_KEYS) s(cle, socials[cle] || '');
  const set = new Set(prof.interests || []);
  document.querySelectorAll(`[data-interests="${p}"] input[type=checkbox]`).forEach(x=>{ x.checked = set.has(x.value); });
  wireProfileFields(p);
}

function displayName(){
  return (currentProfile && (currentProfile.pseudo || currentProfile.name || currentProfile.orgname))
    || (currentUser && (currentUser.displayName || currentUser.email))
    || 'Mon compte';
}
function updateAuthUI(){
  const loggedOut = !currentUser;
  document.getElementById('accountOut').classList.toggle('hidden', !loggedOut);
  document.getElementById('accountLogged').classList.toggle('hidden', loggedOut);
  document.getElementById('navProfile').classList.toggle('hidden', loggedOut);
  if(currentUser){
    document.getElementById('accountName').innerHTML =
      `<b>${esc(displayName())}</b>${currentIsAdmin ? '<span class="account-badge-admin">Admin</span>' : ''}`;
  }
  // L'assistant IA d'import est ouvert à tout membre connecté ; c'est le
  // parcours de publication (js/create-wizard.js) qui l'affiche à la demande.
  // La route serveur revérifie la session et applique le quota quotidien.
}

function initAuth(){
  document.getElementById('btnLogin').addEventListener('click', ()=> openAuth('login'));
  document.getElementById('btnSignup').addEventListener('click', ()=> openAuth('signup'));

  const logout = async ()=>{
    if(window.EBOK_AUTH) await window.EBOK_AUTH.signOutUser();
    showPage('home');
  };
  document.getElementById('btnLogout').addEventListener('click', logout);
  document.getElementById('btnLogout2').addEventListener('click', logout);

  updateAuthUI();
}

/* =========================================================
   VOLET DE NAVIGATION (mobile)
   ---------------------------------------------------------
   La barre du haut empilait trois rangées sur mobile et la navigation défilait
   à l'horizontale. Elle se réduit à quatre boutons ; tout le reste vit ici.
   ========================================================= */
let menuOuvert = false;

function ouvrirMenu(){
  const volet = document.getElementById('sideMenu');
  const fond = document.getElementById('menuBackdrop');
  if(!volet) return;
  syncMenu();
  volet.hidden = false;
  fond.hidden = false;
  menuOuvert = true;
  document.getElementById('btnMenu')?.setAttribute('aria-expanded', 'true');
  // Empêche la page de défiler derrière le volet.
  document.body.style.overflow = 'hidden';
  document.getElementById('btnMenuClose')?.focus();
}

function fermerMenu(){
  const volet = document.getElementById('sideMenu');
  const fond = document.getElementById('menuBackdrop');
  if(!volet) return;
  volet.hidden = true;
  fond.hidden = true;
  menuOuvert = false;
  document.getElementById('btnMenu')?.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

/* Aligne le contenu du volet sur l'état de connexion et le thème. */
function syncMenu(){
  const connecte = !!currentUser;
  document.getElementById('menuOut')?.classList.toggle('hidden', connecte);
  document.getElementById('menuLogged')?.classList.toggle('hidden', !connecte);
  for(const el of document.querySelectorAll('.menu-auth')){
    el.classList.toggle('hidden', !connecte);
  }
  if(connecte){
    const nom = displayName();
    document.getElementById('menuName').textContent = nom;
    document.getElementById('menuMail').textContent = currentUser.email || '';
    const avatar = document.getElementById('menuAvatar');
    const photo = currentProfile && safeImg(currentProfile.photo);
    if(photo){
      avatar.style.backgroundImage = `url("${encodeURI(photo)}")`;
      avatar.textContent = '';
    }else{
      avatar.style.backgroundImage = '';
      avatar.textContent = (nom || '?').trim().slice(0, 2).toUpperCase();
    }
  }
  // Le libellé du thème annonce ce vers quoi on bascule, pas l'état courant.
  const clair = document.documentElement.getAttribute('data-theme') === 'light';
  const icone = document.getElementById('menuThemeIcon');
  const label = document.getElementById('menuThemeLabel');
  if(icone) icone.textContent = clair ? '🌙' : '☀️';
  if(label) label.textContent = clair ? 'Thème sombre' : 'Thème clair';
}

/* ------------------------------------------------------------------ *
 * Pied de page
 * ------------------------------------------------------------------ */

/* Comptes officiels d'EBOK. Laisser vide masque la ligne, et la rubrique
   entière si aucun compte n'est renseigné : un pied de page qui annonce des
   réseaux sans lien donne l'impression d'un site inachevé.
   Pour en ajouter un : colle l'adresse complète du profil. */
const RESEAUX_EBOK = {
  instagram: '',
  linkedin: '',
};

function initFooter(){
  const annee = document.getElementById('footerYear');
  if(annee) annee.textContent = String(new Date().getFullYear());

  initContactFooter();

  const bloc = document.getElementById('footerSocial');
  if(!bloc) return;
  let visibles = 0;
  for(const li of bloc.querySelectorAll('[data-reseau]')){
    const url = RESEAUX_EBOK[li.dataset.reseau];
    if(url){
      li.querySelector('a').href = url;
      visibles++;
    }else{
      li.remove();
    }
  }
  bloc.classList.toggle('hidden', visibles === 0);
}

/* L'adresse de contact n'est jamais écrite dans le HTML : les robots qui
   aspirent les pages pour récolter des e-mails ne la trouvent pas. Elle est
   reconstituée au premier clic, affichée, puis la messagerie s'ouvre. */
function initContactFooter(){
  const lien = document.getElementById('footerContact');
  if(!lien) return;
  lien.addEventListener('click', (e)=>{
    const adresse = `${lien.dataset.u}@${lien.dataset.d}`;
    if(lien.getAttribute('href') === `mailto:${adresse}`) return; // déjà révélée
    e.preventDefault();
    lien.href = `mailto:${adresse}`;
    const texte = lien.querySelector('.footer-contact-text');
    if(texte) texte.textContent = adresse;
    window.location.href = lien.href;
  });
}

function initMenu(){
  const bouton = document.getElementById('btnMenu');
  if(!bouton) return;
  bouton.addEventListener('click', ()=> menuOuvert ? fermerMenu() : ouvrirMenu());
  document.getElementById('btnMenuClose').addEventListener('click', fermerMenu);
  document.getElementById('menuBackdrop').addEventListener('click', fermerMenu);
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && menuOuvert) fermerMenu(); });

  // Naviguer referme le volet : sinon il masque la page qu'on vient d'ouvrir.
  for(const lien of document.querySelectorAll('.side-menu-link[data-nav]')){
    lien.addEventListener('click', fermerMenu);
  }

  // Raccourcis vers une section de la page « Mon profil ».
  for(const lien of document.querySelectorAll('[data-menu-section]')){
    lien.addEventListener('click', ()=>{
      const cible = lien.dataset.menuSection;
      fermerMenu();
      showPage('profile');
      // Laisse le temps à la page de se dessiner avant de faire défiler.
      setTimeout(()=>{
        document.getElementById(cible)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    });
  }

  document.getElementById('menuLogin').addEventListener('click', ()=>{ fermerMenu(); openAuth('login'); });
  document.getElementById('menuSignup').addEventListener('click', ()=>{ fermerMenu(); openAuth('signup'); });
  document.getElementById('menuLogout').addEventListener('click', async ()=>{
    fermerMenu();
    if(window.EBOK_AUTH) await window.EBOK_AUTH.signOutUser();
    showPage('home');
  });
  document.getElementById('menuTheme').addEventListener('click', ()=>{
    const suivant = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(suivant);
    localStorage.setItem('ebok-theme', suivant);
    syncMenu();
  });
}

/* =========================================================
   BIENVENUE — formulaire de profil à la première connexion
   ---------------------------------------------------------
   Le formulaire de profil complet existe, mais il est enfoui dans
   « Mon profil » → Modifier : personne ne l'ouvre spontanément, et les profils
   restent vides. On pose donc les quatre questions qui servent vraiment, une
   fois, au moment où l'utilisateur vient de s'inscrire.

   Passable : « Plus tard » ferme sans rien enregistrer. Un rappel reste alors
   sur la page « Mon profil » jusqu'à ce que ce soit fait. On ne redemande pas
   dans la même session, pour ne pas harceler.
   ========================================================= */
let onboardingVille = null;      // ville choisie dans l'autocomplétion (lat/lng)
let onboardingRefuse = false;    // « Plus tard » cliqué dans cette session
let obRole = '';                 // rôle choisi (pilote l'étape « joueur »)
let obNiveau = '';               // niveau choisi
let obEtape = 0;                 // index dans la liste des étapes actives

/* Étapes affichées, dans l'ordre. L'étape « joueur » n'existe que pour un
   joueur : la liste est donc recalculée à chaque changement de rôle, et la
   progression suit. */
function obEtapes(){
  let specifique = [];
  if(obRole === 'Joueur') specifique = ['joueur'];
  else if(ROLES_STRUCTURE.includes(obRole)) specifique = ['structure'];
  return ['pseudo', 'role', ...specifique, 'ville', 'interets', 'reseaux'];
}

/* Vrai si le profil mérite encore d'être complété. `onboarded` est posé à
   l'enregistrement : il distingue « jamais répondu » de « répondu en laissant
   des champs vides », qu'on ne doit pas relancer indéfiniment. */
function profilIncomplet(){
  const p = currentProfile;
  if(!p) return true;
  if(p.onboarded) return false;
  // Profil déjà nourri autrement (ancien membre) : on ne le dérange pas.
  return !(p.pseudo && p.role);
}

/* Affiche l'étape demandée et met à jour progression et boutons. */
function obAller(i){
  const etapes = obEtapes();
  obEtape = Math.max(0, Math.min(i, etapes.length - 1));
  const courante = etapes[obEtape];

  for(const el of document.querySelectorAll('#onboardingModal .ob-step')){
    el.hidden = el.dataset.step !== courante;
  }
  document.getElementById('onboardingError').classList.add('hidden');

  // Progression : « Question 2 sur 5 » + barre.
  const total = etapes.length;
  document.getElementById('obProgressTxt').textContent = `Question ${obEtape + 1} sur ${total}`;
  document.getElementById('obProgressFill').style.width = `${((obEtape + 1) / total) * 100}%`;

  // Retour masqué sur la première carte ; « C'est parti » sur la dernière.
  document.getElementById('obBack').classList.toggle('hidden', obEtape === 0);
  const derniere = obEtape === total - 1;
  // La dernière carte est facultative : le bouton doit le dire, pour qu'on ose
  // la traverser sans rien remplir.
  const done = document.getElementById('obDone');
  if(derniere) done.textContent = courante === 'reseaux' ? 'Terminer' : "C'est parti";
  // Sur la carte « rôle », choisir une pastille fait avancer tout seul :
  // un bouton « Suivant » n'y ajoute rien et encombre l'écran au doigt.
  const avanceSeule = courante === 'role';
  document.getElementById('obNext').classList.toggle('hidden', derniere || avanceSeule);
  document.getElementById('obDone').classList.toggle('hidden', !derniere);

  // « Quels événements t'intéressent » n'a pas de sens pour un club : il en
  // organise, il ne les suit pas.
  if(courante === 'interets'){
    const titre = document.querySelector('.ob-step[data-step="interets"] h3');
    if(titre){
      titre.textContent = ROLES_STRUCTURE.includes(obRole)
        ? "Quels événements organises-tu ?"
        : "Quels événements t'intéressent ?";
    }
  }

  // Le curseur va dans le champ de la carte : une saisie de moins au doigt.
  const champ = document.querySelector(`.ob-step[data-step="${courante}"] input[type=text], .ob-step[data-step="${courante}"] input[type=number]`);
  if(champ) setTimeout(()=> champ.focus(), 50);
}

/* Contrôle de l'étape courante. Renvoie un message d'erreur, ou null si tout va
   bien. Seuls le pseudo et le rôle sont exigés : le reste enrichit le profil
   sans être indispensable. */
function obValide(){
  const etape = obEtapes()[obEtape];
  if(etape === 'pseudo' && !document.getElementById('ob-pseudo').value.trim()){
    return "Indique le nom qu'on affichera.";
  }
  if(etape === 'role' && !obRole) return "Choisis ce qui te correspond le mieux.";
  return null;
}

function obSuivant(){
  const erreur = obValide();
  if(erreur){
    const box = document.getElementById('onboardingError');
    box.textContent = erreur;
    box.classList.remove('hidden');
    return;
  }
  obAller(obEtape + 1);
}

function closeOnboarding(){
  const modal = document.getElementById('onboardingModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function openOnboarding(){
  const modal = document.getElementById('onboardingModal');
  if(!modal || !currentUser) return;
  const p = currentProfile || {};

  // Pré-remplissage : le nom vient de Google, autant ne pas le redemander.
  const pseudo = document.getElementById('ob-pseudo');
  if(pseudo && !pseudo.value) pseudo.value = p.pseudo || p.name || currentUser.displayName || '';
  const ville = document.getElementById('ob-ville');
  if(ville && !ville.value) ville.value = p.ville || '';
  const age = document.getElementById('ob-age');
  if(age && !age.value && p.age != null) age.value = p.age;
  for(const [id, cle] of [['ob-orgname','orgname'], ['ob-orgsite','orgsite']]){
    const el = document.getElementById(id);
    if(el && !el.value && p[cle]) el.value = p[cle];
  }
  const socials = p.socials || {};
  for(const cle of SOCIAL_KEYS){
    const el = document.getElementById('ob-' + cle);
    if(el && !el.value && socials[cle]) el.value = socials[cle];
  }
  if(p.role){ obRole = p.role; obMarquePastille('ob-role', p.role); }
  if(p.niveau){ obNiveau = p.niveau; obMarquePastille('ob-niveau', p.niveau); }
  if(Array.isArray(p.interests)){
    for(const box of document.querySelectorAll('#ob-interests input[type=checkbox]')){
      box.checked = p.interests.includes(box.value);
    }
  }

  obAller(0);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

/* Marque la pastille choisie dans un groupe de choix unique. */
function obMarquePastille(groupeId, valeur){
  for(const b of document.querySelectorAll(`#${groupeId} .chip-pick`)){
    b.classList.toggle('selected', b.dataset.value === valeur);
    b.setAttribute('aria-pressed', b.dataset.value === valeur ? 'true' : 'false');
  }
}

/* Construit un groupe de pastilles à choix unique. */
function obGroupePastilles(groupeId, options, onPick){
  const groupe = document.getElementById(groupeId);
  groupe.innerHTML = options.map(o=>
    `<button type="button" class="chip-pick" data-value="${esc(o)}" aria-pressed="false">${esc(o)}</button>`
  ).join('');
  groupe.addEventListener('click', e=>{
    const btn = e.target.closest('.chip-pick');
    if(!btn) return;
    obMarquePastille(groupeId, btn.dataset.value);
    onPick(btn.dataset.value);
  });
}

/* Affiche ou masque le rappel de la page « Mon profil ». */
function renderOnboardingNudge(){
  const nudge = document.getElementById('onboardingNudge');
  if(nudge) nudge.classList.toggle('hidden', !profilIncomplet());
}

/* Ouvre le formulaire si c'est une première connexion. Appelé à chaque
   changement d'état d'authentification. */
function maybeOpenOnboarding(){
  if(!currentUser || onboardingRefuse) return;
  if(!profilIncomplet()) return;
  openOnboarding();
}

function initOnboarding(){
  const modal = document.getElementById('onboardingModal');
  if(!modal) return;

  // Pastilles plutôt qu'un menu déroulant : bien plus confortable au pouce.
  // Choisir fait avancer tout seul — un geste de moins par question.
  obGroupePastilles('ob-role', ROLE_OPTIONS, v=>{
    obRole = v;
    setTimeout(()=> obSuivant(), 180);   // laisse voir la sélection
  });
  obGroupePastilles('ob-niveau', NIVEAU_OPTIONS, v=>{ obNiveau = v; });

  document.getElementById('ob-interests').innerHTML = INTEREST_OPTIONS.map(i=>
    `<label class="chip-check"><input type="checkbox" value="${esc(i)}"><span>${esc(i)}</span></label>`
  ).join('');

  // Limite à MAX_INTERESTS. On réutilise la règle du formulaire de profil
  // plutôt que de la réécrire : elle grise aussi visuellement les chips
  // devenues indisponibles (classe `disabled` sur le label).
  wireProfileFields('ob-');

  // Autocomplétion de ville : même composant que le formulaire de publication,
  // donc mêmes données et mêmes coordonnées.
  ensureCitiesLoaded();
  attachCityAutocomplete('ob-ville', 'ob-ville-ac', pick=>{
    onboardingVille = pick;
    const hint = document.getElementById('ob-ville-hint');
    if(hint){
      hint.textContent = '📍 ' + pick.city + (pick.region ? ' · ' + pick.region : '');
      hint.style.color = 'var(--green)';
    }
  });

  document.getElementById('obNext').addEventListener('click', obSuivant);
  document.getElementById('obBack').addEventListener('click', ()=> obAller(obEtape - 1));

  // Entrée valide l'étape au lieu d'envoyer le formulaire incomplet.
  modal.addEventListener('keydown', e=>{
    if(e.key !== 'Enter') return;
    const etapes = obEtapes();
    if(obEtape < etapes.length - 1){ e.preventDefault(); obSuivant(); }
  });

  const plusTard = ()=>{ onboardingRefuse = true; closeOnboarding(); renderOnboardingNudge(); };
  document.getElementById('onboardingSkip').addEventListener('click', plusTard);
  document.getElementById('onboardingLater').addEventListener('click', plusTard);

  const rouvrir = document.getElementById('btnOpenOnboarding');
  if(rouvrir) rouvrir.addEventListener('click', ()=>{ onboardingRefuse = false; openOnboarding(); });

  document.getElementById('onboardingForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const erreur = document.getElementById('onboardingError');

    const data = {
      pseudo: document.getElementById('ob-pseudo').value.trim(),
      role: obRole,
      ville: document.getElementById('ob-ville').value.trim(),
      interests: [...document.querySelectorAll('#ob-interests input:checked')].map(b=> b.value),
      onboarded: true,
    };
    // Le pseudo sert de nom d'affichage, comme dans la modale d'édition.
    if(data.pseudo) data.name = data.pseudo;
    // Âge et niveau n'ont de sens que pour un joueur : on ne les enregistre
    // que dans ce cas, et on efface d'anciennes valeurs si le rôle a changé.
    if(data.role === 'Joueur'){
      const age = parseInt(document.getElementById('ob-age').value, 10);
      data.age = Number.isFinite(age) ? age : null;
      data.niveau = obNiveau;
    }else{
      data.age = null;
      data.niveau = '';
    }
    // Identité de la structure : elle nourrit le profil diffuseur et pré-remplit
    // le formulaire de publication. Sans elle, les événements se publient sous
    // le nom générique « Organisateur ».
    // On ne l'efface PAS quand le rôle change : contrairement à l'âge, un
    // joueur peut tout à fait organiser par ailleurs.
    // Réseaux sociaux, communs à tous les profils. L'arobase est ajoutée à
    // l'affichage : on ne la stocke pas.
    data.socials = {};
    for(const cle of SOCIAL_KEYS){
      data.socials[cle] = document.getElementById('ob-' + cle).value.trim().replace(/^@/, '');
    }

    if(ROLES_STRUCTURE.includes(data.role)){
      data.orgname = document.getElementById('ob-orgname').value.trim();
      data.orgsite = document.getElementById('ob-orgsite').value.trim();
      // La ville déjà demandée sert aussi de ville de la structure : autant ne
      // pas poser deux fois la même question.
      if(data.ville) data.orgcity = data.ville;
      // Pour une structure, ces deux réseaux servent aussi de contact sur les
      // fiches événement : on les recopie là où le formulaire de publication
      // les attend, plutôt que de les redemander.
      data.orginsta = data.socials.instagram;
      data.orglinkedin = data.socials.linkedin;
    }
    // Coordonnées de la ville : elles préparent le filtre « autour de moi ».
    if(onboardingVille && onboardingVille.city === data.ville){
      data.villeLat = onboardingVille.lat;
      data.villeLng = onboardingVille.lng;
      data.region = onboardingVille.region || '';
    }

    if(window.EBOK_DATA && window.EBOK_DATA.updateUserProfile){
      try{
        await window.EBOK_DATA.updateUserProfile(currentUser.uid, data);
      }catch(err){
        erreur.textContent = "Enregistrement impossible. Réessaie dans un instant.";
        erreur.classList.remove('hidden');
        return;
      }
    }

    currentProfile = Object.assign({}, currentProfile, data);
    closeOnboarding();
    updateAuthUI();
    renderOnboardingNudge();
    if(document.getElementById('page-profile').classList.contains('active')) renderProfile();
  });
}

/* =========================================================
   MES ALERTES
   ---------------------------------------------------------
   Le membre décrit ce qui l'intéresse ; le serveur lui écrit quand un
   événement VALIDÉ correspond. Un critère laissé vide ne filtre pas : une
   alerte sans région couvre toute la France.
   ========================================================= */
let mesAlertes = [];
let mesReperes = [];               // événements repérés : {eventId, alertId, vu, at}
let alerteEnCours = null;          // id de l'alerte modifiée, null si création

/* Régions proposées : celles de la base de villes, pour que les valeurs
   coïncident exactement avec celles enregistrées sur les événements. */
function regionsDisponibles(){
  const r = window.CITIES_FR_REGIONS;
  if(r) return [...new Set(Object.values(r))].sort((a,b)=> a.localeCompare(b,'fr'));
  // Repli si la base de villes n'est pas encore chargée : les régions déjà
  // présentes sur les événements affichés.
  return [...new Set(events.map(e=> e.region).filter(Boolean))].sort();
}

async function chargerAlertes(){
  mesAlertes = []; mesReperes = [];
  if(currentUser && window.EBOK_DATA && window.EBOK_DATA.getAlertsEtReperes){
    try{
      const r = await window.EBOK_DATA.getAlertsEtReperes();
      mesAlertes = r.alerts; mesReperes = r.notifications;
    }catch(e){ /* alertes indisponibles : la page l'affichera vide */ }
  }
  majPastilleAlertes();
}

/* Pastille du menu : nombre d'événements repérés pas encore vus. Deux alertes
   peuvent repérer le même événement : il ne compte qu'une fois. */
function majPastilleAlertes(){
  const n = new Set(mesReperes.filter(r=> !r.vu).map(r=> r.eventId)).size;
  for(const el of document.querySelectorAll('[data-alert-badge]')){
    el.classList.toggle('hidden', n === 0);
    el.textContent = el.dataset.alertBadge === 'dot' ? '' : (n > 9 ? '9+' : String(n));
  }
}

/* Page « Mes alertes » : la liste, puis les événements repérés. Les ouvrir
   suffit à les considérer comme vus — la pastille s'éteint, les étiquettes
   « Nouveau » restent le temps de cette visite. */
async function ouvrirPageAlertes(){
  renderAlertes();
  await renderReperes();
  if(mesReperes.some(r=> !r.vu) && window.EBOK_DATA && window.EBOK_DATA.markAlertsSeen){
    try{
      await window.EBOK_DATA.markAlertsSeen();
      mesReperes.forEach(r=>{ r.vu = true; });
      majPastilleAlertes();
    }catch(e){ /* on retentera à la prochaine visite */ }
  }
}

async function renderReperes(){
  const section = document.getElementById('section-reperes');
  const grid = document.getElementById('reperesGrid');
  if(!section || !grid) return;
  // Un événement repéré par plusieurs alertes n'apparaît qu'une fois ; il est
  // « nouveau » si au moins l'une d'elles ne l'a pas encore montré.
  const parEvent = new Map();
  for(const r of mesReperes){
    const deja = parEvent.get(r.eventId);
    if(deja) deja.nouveau = deja.nouveau || !r.vu;
    else parEvent.set(r.eventId, { nouveau: !r.vu });
  }
  const cartes = [];
  for(const [id, info] of parEvent){
    let ev = events.find(e=> e.id === id);
    if(!ev && window.EBOK_DATA && window.EBOK_DATA.getEvent){
      try{ ev = await window.EBOK_DATA.getEvent(id); }catch(e){ ev = null; }
    }
    if(ev && !isPast(ev)) cartes.push({ ev, nouveau: info.nouveau });
  }
  section.classList.toggle('hidden', !currentUser || !mesAlertes.length);
  if(!cartes.length){
    grid.innerHTML = `<div class="empty-state"><h4>Rien pour l'instant</h4>
      <p>Dès qu'un événement correspondant à tes alertes est publié, il apparaît ici.</p></div>`;
    return;
  }
  grid.innerHTML = cartes.map(c=> eventCardHtml(c.ev)).join('');
  [...grid.querySelectorAll('.event-card')].forEach((card, i)=>{
    if(cartes[i].nouveau){
      card.classList.add('is-new');
      card.querySelector('.card-media')?.insertAdjacentHTML('beforeend', '<span class="new-flag">Nouveau</span>');
    }
    card.addEventListener('click', ()=> openEvent(card.dataset.id));
  });
}

function renderAlertes(){
  const box = document.getElementById('alertsList');
  if(!box) return;
  if(!currentUser){
    box.innerHTML = `<div class="empty-state"><h4>Ne rate plus aucun événement</h4>
      <p>Connecte-toi pour créer une alerte : une région, un type d'événement, et on te prévient.</p>
      <button class="btn btn-primary" data-auth="login">Se connecter</button></div>`;
    return;
  }
  if(!mesAlertes.length){
    box.innerHTML = `<div class="empty-state"><h4>Aucune alerte</h4>
      <p>Crée ta première alerte pour être prévenu des événements qui te correspondent.</p></div>`;
    return;
  }
  box.innerHTML = mesAlertes.map(a=> `
    <div class="alert-card ${a.actif ? '' : 'inactive'}">
      <div class="alert-main">
        <strong>${esc(a.nom)}</strong>
        <span class="alert-criteres">${esc(resumeCriteres(a.criteres))}</span>
      </div>
      <div class="alert-actions">
        <button class="btn btn-ghost" data-alert-toggle="${esc(a.id)}">${a.actif ? 'Suspendre' : 'Réactiver'}</button>
        <button class="btn btn-ghost" data-alert-edit="${esc(a.id)}">Modifier</button>
        <button class="btn btn-ghost alert-del" data-alert-del="${esc(a.id)}" aria-label="Supprimer">🗑</button>
      </div>
    </div>`).join('');
}

/* AAAA-MM-JJ → JJ/MM/AAAA. Un format ISO se lit mal en français. */
function dateAlerteFr(v){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v || '');
}

/* Même formulation que côté serveur (lib/alertes.js) : le membre doit lire la
   même chose dans l'interface et dans l'e-mail qu'il reçoit. */
function resumeCriteres(c){
  c = c || {};
  const bouts = [];
  bouts.push(c.regions && c.regions.length ? c.regions.join(', ') : 'toute la France');
  bouts.push(c.types && c.types.length ? c.types.join(', ') : 'tous les types');
  if(c.du && c.au) bouts.push(`du ${dateAlerteFr(c.du)} au ${dateAlerteFr(c.au)}`);
  else if(c.du) bouts.push(`à partir du ${dateAlerteFr(c.du)}`);
  else if(c.au) bouts.push(`jusqu'au ${dateAlerteFr(c.au)}`);
  return bouts.join(' · ');
}

function closeAlertModal(){
  const m = document.getElementById('alertModal');
  m.classList.remove('open');
  m.setAttribute('aria-hidden', 'true');
}

/* Menus déroulants des critères d'alerte.
   Une liste de pastilles occupait presque tout l'écran sur mobile : on garde
   les mêmes cases à cocher (le formulaire lit toujours `#id input:checked`)
   mais repliées dans un <details>, dont le résumé rappelle la sélection. */
function resumeMenuAlerte(id, vide, pluriel){
  const panneau = document.getElementById(id);
  const cible = document.getElementById(id + '-resume');
  if(!panneau || !cible) return;
  const choisis = [...panneau.querySelectorAll('input:checked')].map(x=> x.value);
  // Au-delà de deux, énumérer devient illisible : on compte.
  cible.textContent = choisis.length === 0 ? vide
    : choisis.length <= 2 ? choisis.join(', ')
    : `${choisis.length} ${pluriel} sélectionnés`;
  document.getElementById(id + '-drop')?.classList.toggle('has-pick', choisis.length > 0);
}

function remplirMenuAlerte(id, valeurs, choisies, vide, pluriel){
  const panneau = document.getElementById(id);
  if(!panneau) return;
  panneau.innerHTML = valeurs.map(v=>
    `<label class="pick-item"><input type="checkbox" value="${esc(v)}"${(choisies||[]).includes(v) ? ' checked' : ''}><span>${esc(v)}</span></label>`
  ).join('');
  // Le menu est reconstruit à chaque ouverture : on rebranche ici plutôt que
  // de déléguer, et on referme le <details> resté ouvert de la fois d'avant.
  panneau.onchange = ()=> resumeMenuAlerte(id, vide, pluriel);
  document.getElementById(id + '-drop')?.removeAttribute('open');
  resumeMenuAlerte(id, vide, pluriel);
}

/* `depart` : critères proposés pour une nouvelle alerte (ceux de la recherche
   en cours), que le membre peut encore corriger avant d'enregistrer. */
function openAlertModal(id, depart){
  const m = document.getElementById('alertModal');
  if(!m || !currentUser) return;
  alerteEnCours = id || null;
  const a = id ? mesAlertes.find(x=> x.id === id) : null;
  const c = (a && a.criteres) || depart || {};

  document.getElementById('alertTitle').textContent = a ? "Modifier l'alerte" : 'Nouvelle alerte';
  document.getElementById('al-nom').value = a ? (a.nom || '') : '';
  document.getElementById('al-du').value = c.du || '';
  document.getElementById('al-au').value = c.au || '';

  remplirMenuAlerte('al-regions', regionsDisponibles(), c.regions, 'Toute la France', 'régions');
  remplirMenuAlerte('al-types', Object.keys(TYPE_COLORS), c.types, 'Tous les types', 'types');

  document.getElementById('alertError').classList.add('hidden');
  m.classList.add('open');
  m.setAttribute('aria-hidden', 'false');
}

function initAlertes(){
  const m = document.getElementById('alertModal');
  if(!m) return;
  document.getElementById('btnNewAlert').addEventListener('click', ()=>{
    if(!currentUser && window.EBOK_AUTH){ openAuth('login'); return; }
    openAlertModal(null);
  });
  // Raccourcis « Créer une alerte » de l'accueil et de la recherche : ils
  // reprennent la région ou le type déjà choisis.
  for(const b of document.querySelectorAll('[data-new-alert]')){
    b.addEventListener('click', ()=>{
      if(!currentUser && window.EBOK_AUTH){ openAuth('login'); return; }
      const dispo = regionsDisponibles();
      const depart = { regions: [], types: [] };
      if(b.dataset.newAlert === 'home'){
        if(dispo.includes(selectedRegion)) depart.regions = [selectedRegion];
      }else{
        const type = document.getElementById('f-type').value;
        if(TYPE_COLORS[type]) depart.types = [type];
        const choisie = document.getElementById('f-region').value;
        const region = dispo.find(r=> r === choisie);
        if(region) depart.regions = [region];
      }
      showPage('alertes');
      openAlertModal(null, depart);
    });
  }
  document.getElementById('alertClose').addEventListener('click', closeAlertModal);
  document.getElementById('alertCancel').addEventListener('click', closeAlertModal);
  bindBackdropClose(m, closeAlertModal);

  // Actions des cartes, par délégation : la liste est redessinée à chaque
  // changement, rebrancher les écouteurs à chaque fois serait fragile.
  document.getElementById('alertsList').addEventListener('click', async e=>{
    const btn = e.target.closest('[data-alert-edit],[data-alert-del],[data-alert-toggle]');
    if(!btn) return;
    if(btn.dataset.alertEdit) return openAlertModal(btn.dataset.alertEdit);
    if(btn.dataset.alertToggle){
      const a = mesAlertes.find(x=> x.id === btn.dataset.alertToggle);
      if(a && window.EBOK_DATA.updateAlert){
        // On adopte l'alerte telle que le serveur la renvoie, plutôt que de
        // basculer l'état à l'aveugle : si l'écriture n'a pas abouti, l'affichage
        // ne doit pas prétendre le contraire.
        const maj = await window.EBOK_DATA.updateAlert(a.id, { actif: !a.actif });
        Object.assign(a, maj || { actif: !a.actif });
        renderAlertes();
      }
      return;
    }
    if(btn.dataset.alertDel){
      if(!confirm('Supprimer cette alerte ?')) return;
      if(window.EBOK_DATA.deleteAlert) await window.EBOK_DATA.deleteAlert(btn.dataset.alertDel);
      mesAlertes = mesAlertes.filter(x=> x.id !== btn.dataset.alertDel);
      mesReperes = mesReperes.filter(r=> r.alertId !== btn.dataset.alertDel);
      renderAlertes();
      renderReperes();
    }
  });

  document.getElementById('alertForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const erreur = document.getElementById('alertError');
    const coches = id => [...document.querySelectorAll(`#${id} input:checked`)].map(x=> x.value);
    const du = document.getElementById('al-du').value;
    const au = document.getElementById('al-au').value;
    if(du && au && du > au){
      erreur.textContent = "La date de fin précède la date de début.";
      erreur.classList.remove('hidden');
      return;
    }
    const donnees = {
      nom: document.getElementById('al-nom').value.trim(),
      criteres: { regions: coches('al-regions'), types: coches('al-types'), du, au },
    };
    try{
      if(alerteEnCours){
        const maj = await window.EBOK_DATA.updateAlert(alerteEnCours, donnees);
        const i = mesAlertes.findIndex(x=> x.id === alerteEnCours);
        if(i >= 0 && maj) mesAlertes[i] = maj;
      }else{
        const creee = await window.EBOK_DATA.createAlert(donnees);
        if(creee) mesAlertes.unshift(creee);
      }
    }catch(err){
      erreur.textContent = err && err.code === 'trop_d_alertes'
        ? "Tu as atteint la limite de 10 alertes. Supprimes-en une pour en créer une nouvelle."
        : "Enregistrement impossible. Réessaie dans un instant.";
      erreur.classList.remove('hidden');
      return;
    }
    closeAlertModal();
    renderAlertes();
    renderReperes();
  });
}

/* ---- Page "Mon profil" (favoris + événements publiés + admin) ---- */
async function renderProfile(){
  if(!currentUser) return;
  // En-tête
  const name = displayName();
  document.getElementById('profileName').innerHTML =
    `${esc(name)}${currentIsAdmin ? '<span class="account-badge-admin">Admin</span>' : ''}`;
  document.getElementById('profileEmail').textContent = currentUser.email || '';
  const initials = (name || '?').trim().slice(0,2).toUpperCase();
  const avatarEl = document.getElementById('profileAvatar');
  if(currentProfile && safeImg(currentProfile.photo)){
    // Sans les guillemets ni encodeURI, une parenthèse dans l'URL referme le
    // url(...) et laisse écrire la suite de la déclaration CSS.
    avatarEl.style.backgroundImage = `url("${encodeURI(safeImg(currentProfile.photo))}")`;
    avatarEl.classList.add('has-photo');
    avatarEl.textContent = '';
  }else{
    avatarEl.style.backgroundImage = '';
    avatarEl.classList.remove('has-photo');
    avatarEl.textContent = initials;
  }

  renderProfileAbout();
  renderMyEvents();
  const adminSection = document.getElementById('adminSection');
  adminSection.classList.toggle('hidden', !currentIsAdmin);
  if(currentIsAdmin){
    renderAdminEvents(); renderAdminMembers();
    if(typeof renderAdminDetection === 'function') renderAdminDetection();
  }
}

/* Récapitulatif du profil membre ("À propos de moi"). */
function renderProfileAbout(){
  const box = document.getElementById('profileAbout');
  if(!box) return;
  const p = currentProfile || {};
  const roleLabel = p.role === 'Autre' ? (p.roleOther || 'Autre') : p.role;
  const rows = [
    p.pseudo ? ['Pseudo', p.pseudo] : null,
    roleLabel ? ['Profil', roleLabel] : null,
    (p.age != null && p.age !== '') ? ['Âge', p.age + ' ans'] : null,
    p.sexe ? ['Sexe', p.sexe] : null,
    p.niveau ? ['Niveau', p.niveau] : null,
    p.ville ? ['Ville', p.ville] : null,
    p.practice ? ['Niveau / club', p.practice] : null,
    p.favClub ? ['Club préféré', p.favClub] : null,
    (Array.isArray(p.interests) && p.interests.length) ? ['Événements préférés', p.interests.join(', ')] : null,
    ...SOCIAL_LABELS.map(([cle, label])=>{
      const v = p.socials && p.socials[cle];
      return v ? [label, v] : null;
    }),
  ].filter(Boolean);
  if(!rows.length){
    box.innerHTML = `<p class="about-empty">Complète ton profil pour qu'EBOK te propose les événements qui te ressemblent.</p>`;
    return;
  }
  box.innerHTML = rows.map(([k, v])=>
    `<div class="about-item"><span class="about-k">${esc(k)}</span><span class="about-v">${esc(v)}</span></div>`).join('');
}

/* ---- Modale d'édition du profil membre ---- */
function closeProfileEdit(){
  const modal = document.getElementById('profileEditModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}
function openProfileEdit(){
  if(!currentUser) return;
  const p = currentProfile || {};
  fillProfileFields('pe-', p);
  document.getElementById('profileEditError').classList.add('hidden');
  const modal = document.getElementById('profileEditModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}
function initProfileEdit(){
  const modal = document.getElementById('profileEditModal');
  if(!modal) return;
  document.getElementById('pe-profile').innerHTML = profileFieldsHtml('pe-');
  wireProfileFields('pe-');
  document.getElementById('profileEditClose').addEventListener('click', closeProfileEdit);
  document.getElementById('profileEditCancel').addEventListener('click', closeProfileEdit);
  bindBackdropClose(modal, closeProfileEdit);
  const btn = document.getElementById('btnEditProfile');
  if(btn) btn.addEventListener('click', openProfileEdit);

  document.getElementById('profileEditForm').addEventListener('submit', async e=>{
    e.preventDefault();
    // Le pseudo sert désormais de nom d'affichage (plus de champ « Nom » séparé).
    const data = readProfileFields('pe-');
    if(data.pseudo) data.name = data.pseudo;
    if(currentUser && window.EBOK_DATA && window.EBOK_DATA.updateUserProfile){
      try{ await window.EBOK_DATA.updateUserProfile(currentUser.uid, data); }
      catch(err){
        const box = document.getElementById('profileEditError');
        box.textContent = "Enregistrement impossible. Réessaie."; box.classList.remove('hidden');
        return;
      }
    }
    currentProfile = Object.assign({}, currentProfile, data);
    closeProfileEdit();
    updateAuthUI();
    renderProfile();
  });
}

/* Événements publiés par l'utilisateur. */
async function renderMyEvents(){
  const grid = document.getElementById('mineGrid');
  await fillEventsGrid(grid,
    ()=> window.EBOK_DATA.getEventsByUser(currentUser.uid),
    "Aucun événement publié pour l'instant. Clique sur « Publier un événement » pour commencer !");
}

/* ---- Administration : tableau de gestion des événements ---- */
let adminList = [];               // dernière liste chargée (pour l'édition)

// Échappe le texte inséré dans le HTML du tableau (titres, villes…).
function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Échapper ne suffit pas dans un href : "javascript:..." reste exécutable une
   fois entre guillemets. On n'autorise donc que les protocoles attendus, plus
   les liens internes. Toute autre valeur devient un lien mort. */
function safeUrl(u){
  const s = String(u == null ? '' : u).trim();
  if(!s) return '';
  if(/^(https?:|mailto:|tel:)/i.test(s)) return s;
  if(/^[/#?]/.test(s)) return s;          // relatif au site
  return '';
}

/* Même principe pour une image. Les affiches d'avant la migration vers Blob
   sont encore stockées en data-URI : on les garde, mais bornées aux images. */
function safeImg(u){
  const s = String(u == null ? '' : u).trim();
  if(!s) return '';
  if(/^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]*$/i.test(s)) return s;
  if(/^https?:\/\//i.test(s)) return s;
  if(/^\//.test(s)) return s;
  return '';
}

/* Une couleur de type inconnu (le serveur n'impose pas la liste) finirait
   telle quelle dans un attribut style. */
function typeColor(type){
  return (typeof TYPE_COLORS !== 'undefined' && TYPE_COLORS[type]) || 'var(--chalk-dim)';
}

/* Couleur libre (galerie) : seule une valeur hexadécimale est reprise dans un
   attribut style, le reste retombe sur le fond par défaut. */
function safeColor(c){
  const s = String(c == null ? '' : c).trim();
  return /^#[0-9a-f]{3,8}$/i.test(s) ? s : 'var(--asphalt-3)';
}

/* Tous les événements (section admin) — rendu sous forme de tableau. */
async function renderAdminEvents(){
  const wrap = document.getElementById('adminGrid');
  if(!wrap) return;
  if(!window.EBOK_DATA){
    wrap.innerHTML = `<div class="empty-state"><p>Disponible une fois la base connectée.</p></div>`;
    return;
  }
  wrap.innerHTML = `<div class="empty-state"><p>Chargement…</p></div>`;
  let list;
  try{ list = await window.EBOK_DATA.getAllEventsForAdmin(); }
  catch(err){ wrap.innerHTML = `<div class="empty-state"><h4>Erreur</h4><p>Impossible de charger les événements.</p></div>`; return; }
  await loadAdminUsers();   // pour afficher le nom des créateurs
  if(!list.length){ wrap.innerHTML = `<div class="empty-state"><p>Aucun événement dans la base.</p></div>`; return; }
  list.sort((a,b)=> (b.createdAt || 0) - (a.createdAt || 0));
  adminList = list;
  wrap.innerHTML = adminTableHtml(list);
  wrap.querySelectorAll('[data-open]').forEach(b=> b.addEventListener('click', ()=> openEvent(b.dataset.open)));
  wrap.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', ()=> openEditModal(b.dataset.edit)));
  wrap.querySelectorAll('[data-del]').forEach(b=> b.addEventListener('click', ()=> handleDelete(b.dataset.del)));
  wrap.querySelectorAll('[data-approve]').forEach(b=> b.addEventListener('click', ()=> handleApprove(b.dataset.approve)));
  wrap.querySelectorAll('[data-feature]').forEach(b=> b.addEventListener('click', ()=> handleToggleFeatured(b.dataset.feature)));
}

/* ---- Membres inscrits (chargés une fois pour l'espace admin) ---- */
let adminUsers = [];
let adminUsersByUid = {};
async function loadAdminUsers(){
  if(!window.EBOK_DATA || !window.EBOK_DATA.getAllUsers) return adminUsers;
  try{
    adminUsers = await window.EBOK_DATA.getAllUsers();
    adminUsersByUid = {};
    adminUsers.forEach(u=> { adminUsersByUid[u.uid] = u; });
  }catch(e){ /* on garde la dernière liste connue */ }
  return adminUsers;
}
/* Nom lisible du créateur d'un événement. */
function creatorLabel(ev){
  if(!ev.userId){
    return `<span class="muted">${esc((ev.org && ev.org.name) || 'Admin')}</span>`;
  }
  const u = adminUsersByUid[ev.userId];
  const name = (u && (u.pseudo || u.name || u.email)) || (ev.org && ev.org.name) || 'Membre';
  return esc(name);
}

function adminTableHtml(list){
  return `<div class="admin-list">${list.map(adminRowHtml).join('')}</div>`;
}

function adminRowHtml(ev){
  const pending = ev.status !== 'approved';
  const feat = !!ev.featured;
  const meta = [ev.type, ev.city, fmtDateRange(ev.dateStart, ev.dateEnd)].filter(Boolean).join(' · ');
  const metaFull = meta ? `${esc(meta)} · ${creatorLabel(ev)}` : creatorLabel(ev);
  return `<div class="admin-item${pending ? ' is-pending' : ''}">
    <button class="star-toggle ${feat ? 'on' : ''}" data-feature="${esc(ev.id)}" aria-pressed="${feat}" title="${feat ? 'Retirer de la une' : 'Mettre à la une'}">★</button>
    <div class="admin-item-body">
      <div class="admin-item-title admin-title-link" data-open="${esc(ev.id)}">
        <span class="status-dot ${pending ? 'status-pending' : 'status-approved'}">${pending ? 'En attente' : 'En ligne'}</span>
        <b>${esc(ev.title)}</b>
      </div>
      <div class="admin-item-meta">${metaFull}</div>
      ${ev.detection && ev.detection.auto ? `<div class="admin-item-det">🤖 Détecté${ev.detection.sourceNom ? ' sur ' + esc(ev.detection.sourceNom) : ''} · <a href="${esc(safeUrl(ev.detection.lien || ev.detection.sourceUrl))}" target="_blank" rel="noopener">vérifier à la source ↗</a></div>` : ''}
    </div>
    <div class="admin-item-actions">
      <button class="btn btn-ghost btn-xs" data-open="${esc(ev.id)}">Voir</button>
      <button class="btn btn-ghost btn-xs" data-edit="${esc(ev.id)}">Modifier</button>
      ${pending ? `<button class="btn btn-approve btn-xs" data-approve="${esc(ev.id)}">Valider</button>` : ''}
      <button class="btn btn-danger btn-xs" data-del="${esc(ev.id)}">Supprimer</button>
    </div>
  </div>`;
}

/* ---- Membres inscrits : tableau synthétique (espace admin) ---- */
async function renderAdminMembers(){
  const wrap = document.getElementById('adminMembers');
  if(!wrap) return;
  if(!window.EBOK_DATA || !window.EBOK_DATA.getAllUsers){
    wrap.innerHTML = `<div class="empty-state"><p>Disponible une fois la base connectée.</p></div>`;
    return;
  }
  wrap.innerHTML = `<div class="empty-state"><p>Chargement…</p></div>`;
  let users;
  try{ users = await loadAdminUsers(); }
  catch(err){ wrap.innerHTML = `<div class="empty-state"><p>Impossible de charger les membres.</p></div>`; return; }
  if(!users.length){ wrap.innerHTML = `<div class="empty-state"><p>Aucun membre inscrit pour l'instant.</p></div>`; return; }
  const list = users.slice().sort((a,b)=> (b.createdAt || 0) - (a.createdAt || 0));
  wrap.innerHTML = `<p class="admin-count">${list.length} membre${list.length>1?'s':''}</p>` + membersTableHtml(list);
}

function membersTableHtml(list){
  return `<div class="admin-table-scroll">
    <table class="admin-table">
      <thead><tr>
        <th>Pseudo</th><th>Email</th><th>Profil</th><th>Âge</th>
        <th>Niveau / club</th><th>Club préféré</th><th>Inscrit le</th>
      </tr></thead>
      <tbody>${list.map(memberRowHtml).join('')}</tbody>
    </table>
  </div>`;
}

function memberRowHtml(u){
  const role = u.role === 'Autre' ? (u.roleOther || 'Autre') : (u.role || '');
  const date = u.createdAt ? new Date(u.createdAt).toLocaleDateString('fr-FR') : '—';
  const age = (u.age != null && u.age !== '') ? esc(u.age) + ' ans' : '—';
  return `<tr>
    <td class="col-title"><b>${esc(u.pseudo || u.name || '—')}</b></td>
    <td>${esc(u.email || '—')}</td>
    <td>${esc(role || '—')}</td>
    <td>${age}</td>
    <td>${esc(u.practice || '—')}</td>
    <td>${esc(u.favClub || '—')}</td>
    <td class="col-dates">${date}</td>
  </tr>`;
}

/* Recharge la liste publique (événements validés) après une modification
   admin, pour que la carte et le bandeau "à la une" restent à jour. */
async function refreshPublicEvents(){
  if(window.EBOK_DATA && window.EBOK_DATA.getAllEvents){
    try{ const list = await window.EBOK_DATA.getAllEvents(); if(Array.isArray(list)) events = list; }
    catch(e){ /* on garde la liste courante */ }
  }
}

/* ---- Assistant IA : import d'un événement (lien ou image) ---- */
/* Assistant IA d'import — visible uniquement pour l'admin (updateAuthUI), et
   revérifié côté serveur par api/import-event.js. Il reste en observation : on
   mesure sa fiabilité sur de vraies affiches avant de décider s'il est ouvert
   aux diffuseurs (voir DEVELOPMENT_PLAN.md). Elles ne s'exécutent pas tant qu'aucun élément #ia-* 
   n'existe dans la page. */
function initAiImport(){
  const btn = document.getElementById('ia-btn');
  const input = document.getElementById('ia-url');
  const file = document.getElementById('ia-file');
  const drop = document.getElementById('ia-drop');
  if(!btn || !input) return;
  btn.addEventListener('click', importFromUrl);
  input.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); importFromUrl(); } });
  if(file){
    file.addEventListener('change', ()=>{ if(file.files[0]) importFromImage(file.files[0]); file.value = ''; });
  }
  if(drop && file){
    drop.addEventListener('dragover', e=>{ e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', ()=> drop.classList.remove('drag'));
    drop.addEventListener('drop', e=>{
      e.preventDefault(); drop.classList.remove('drag');
      if(e.dataTransfer.files[0]) importFromImage(e.dataTransfer.files[0]);
    });
  }
}

/* Envoie une requête d'import à la fonction serverless. */
async function runImport(payload, pending){
  const status = document.getElementById('ia-status');
  const btn = document.getElementById('ia-btn');
  // L'assistant demande un compte (jeton Clerk) ; le quota est géré par le serveur.
  if(!currentUser){ status.textContent = 'Connecte-toi pour utiliser l’assistant IA.'; return; }
  status.textContent = pending;
  btn.disabled = true;
  try{
    let idToken = '';
    if(currentUser && currentUser.getIdToken) idToken = await currentUser.getIdToken();
    const res = await fetch('/api/import-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ idToken }, payload))
    });
    let data = null;
    try{ data = await res.json(); }catch(e){ /* réponse non JSON */ }
    // Pas de JSON = la réponse ne vient pas de /api/import-event mais de la
    // plateforme (fonction plantée, délai dépassé, corps de requête trop gros).
    // On remonte le statut HTTP, sinon l'erreur est indiagnosticable.
    if(!data){
      const hints = {
        413: 'affiche trop lourde pour le serveur.',
        429: 'trop de requêtes, réessaie dans un instant.',
        504: 'le serveur a mis trop de temps à répondre.'
      };
      throw new Error(`Import impossible (erreur serveur ${res.status}${hints[res.status] ? ' — ' + hints[res.status] : ''}).`);
    }
    if(!res.ok || !data.ok) throw new Error(data.error || `Import impossible (statut ${res.status}).`);
    prefillCreateFromImport(data.event || {}, data.poster);
    // Le modèle retenu est affiché : c'est l'information à me transmettre quand
    // l'extraction se trompe, et elle change d'un import à l'autre.
    const modele = (data.event && data.event.modele) ? ` (${data.event.modele})` : '';
    status.textContent = `✅ Infos récupérées${modele} — vérifie et publie.`;
    // Parcours en étapes : direction le récapitulatif pour tout relire.
    if(typeof window.wizardApresImport === 'function') window.wizardApresImport();
  }catch(err){
    status.textContent = '⚠️ ' + (err.message || 'Import impossible.');
  }finally{
    btn.disabled = false;
  }
}

function importFromUrl(){
  const url = (document.getElementById('ia-url').value || '').trim();
  if(!url){ document.getElementById('ia-status').textContent = 'Colle d’abord un lien.'; return; }
  runImport({ url }, '⏳ Analyse de la page en cours (10–20 s)…');
}

async function importFromImage(file){
  const status = document.getElementById('ia-status');
  if(!/^image\//.test(file.type)){ status.textContent = '⚠️ Choisis un fichier image.'; return; }
  if(file.size > 15 * 1024 * 1024){ status.textContent = '⚠️ Image trop lourde (max 15 Mo).'; return; }
  status.textContent = '⏳ Préparation de l’affiche…';
  let image;
  try{
    // 1600 px : Vercel refuse un corps de requête au-delà de ~4,5 Mo (une image
    // de 4 Mo en pèse ~5,3 en base64), mais il faut garder le petit texte de
    // l'affiche lisible pour l'IA — d'où une réduction moins agressive
    // que pour les aperçus de la galerie.
    image = await compressImage(file, 1600, 0.85);
  }catch(err){
    status.textContent = '⚠️ ' + (err?.message || 'Image illisible.');
    return;
  }
  runImport({ image }, '⏳ Lecture de l’affiche par l’IA (10–20 s)…');
}

/* Pré-remplit le formulaire de publication avec les données extraites. */
function prefillCreateFromImport(ev, poster){
  const set = (id, v)=>{ const el = document.getElementById(id); if(el && v != null && v !== '') el.value = v; };
  set('c-nom', ev.title);
  set('c-type', ev.type);
  set('c-ville', ev.city);
  if(ev.region) setRegionValue('c-region', ev.region);
  // Pays : seulement s'il existe dans la liste (sinon le choix reste France).
  const paysEl = document.getElementById('c-pays');
  if(paysEl && ev.pays && Array.from(paysEl.options).some(o=> o.value === ev.pays)) paysEl.value = ev.pays;
  set('c-adresse', ev.address);
  set('c-date-debut', ev.dateStart);
  set('c-date-fin', ev.dateEnd);
  set('c-sexe', ev.sexe);
  set('c-niveau', ev.niveau);
  set('c-desc', ev.description);
  set('c-orgname', ev.orgName);
  set('c-insta', ev.insta);
  set('c-site', ev.site);
  set('c-tarif', ev.tarif);
  // Les tranches d'âge sont des cases à cocher : on ne touche à la sélection
  // que si l'IA a effectivement reconnu quelque chose.
  const ages = ageList(ev.age);
  if(ages.length) renderAgeChoices('c-age', ages);
  // Le type vient d'être renseigné : le bloc voyage doit suivre.
  const type = document.getElementById('c-type');
  if(type) toggleVoyageBlock('c-voyage', type.value);
  if(ev.voyage) fillVoyage('c', ev.voyage);
  // Affiche récupérée : on l'injecte dans l'aperçu du dropzone.
  const preview = document.getElementById('dzPreview');
  const label = document.getElementById('dzLabel');
  if(poster && preview){
    preview.src = poster;
    preview.classList.remove('hidden');
    if(label) label.style.display = 'none';
  }
  showPage('create');
  const banner = document.getElementById('createSuccess');
  if(banner){
    banner.textContent = '🤖 Formulaire pré-rempli par l’IA — vérifie les infos (surtout les dates) puis publie.';
    banner.classList.remove('hidden');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Vrai si l'erreur est un refus de droits (API Neon/Clerk : admin, auth, prive). */
function isPermissionError(err){
  const code = String((err && (err.code || err.message)) || '').toLowerCase();
  return code.includes('permission') || code.includes('insufficient') || code.includes('unauthenticated')
    || code === 'admin' || code === 'auth' || code === 'prive';
}

/* Affiche le bandeau d'aide / diagnostic dans l'espace admin.
   `err` est l'erreur serveur remontée par l'action refusée (facultatif). */
function showAdminRulesAlert(err){
  const box = document.getElementById('adminRulesAlert');
  if(!box) return;
  const perm = isPermissionError(err);
  const code = err ? String((err.code || '') || '') : '';
  const message = err ? String((err.message || '') || '') : '';

  // Identité serveur : email/uid réellement transmis à l'API.
  const email = (currentUser && currentUser.email) || '(inconnu)';
  const uid = (currentUser && currentUser.uid) || '(inconnu)';
  const emailKnownAdmin = /^marley\.ebok@gmail\.com$/i.test(email);

  const title = document.getElementById('adminRulesTitle');
  if(title) title.textContent = perm
    ? 'Action refusée par la base de données (droits).'
    : 'L\'action a échoué — voici le diagnostic.';

  const diag = document.getElementById('adminRulesDiag');
  if(diag){
    diag.innerHTML =
      `Connecté : <b class="${emailKnownAdmin ? 'ok' : 'bad'}">${esc(email)}</b><br>` +
      `UID : ${esc(uid)}<br>` +
      (code || message
        ? `Erreur : <span class="bad">${esc(code || '—')}</span>${message ? ' · ' + esc(message.slice(0,140)) : ''}`
        : '') +
      (emailKnownAdmin ? '' : `<br><span class="bad">⚠️ Cet email n'est pas l'email admin (marley.ebok@gmail.com) : reconnecte-toi avec le bon compte.</span>`);
  }

  // Les étapes "règles" ne concernent que les refus de droits.
  const help = document.getElementById('adminRulesHelp');
  if(help) help.classList.toggle('hidden', !perm);

  box.classList.remove('hidden');
  box.scrollIntoView({behavior:'smooth', block:'center'});
}

/* Bascule "mise en avant" (bandeau page d'accueil) depuis le tableau. */
async function handleToggleFeatured(id){
  // État courant : depuis les listes connues, sinon depuis le bouton affiché.
  const known = adminList.find(e=> e.id === id) || events.find(e=> e.id === id);
  const btn = document.querySelector(`[data-feature="${id}"]`);
  const curFeat = known ? !!known.featured : (btn ? btn.classList.contains('on') : false);
  const next = !curFeat;
  // Retour visuel immédiat (annulé si l'enregistrement échoue).
  if(btn){ btn.classList.toggle('on', next); btn.setAttribute('aria-pressed', String(next)); }
  try{ await window.EBOK_DATA.updateEvent(id, { featured: next }); }
  catch(err){
    if(btn){ btn.classList.toggle('on', curFeat); btn.setAttribute('aria-pressed', String(curFeat)); }
    showAdminRulesAlert(err);
    return;
  }
  if(known) known.featured = next;
  const local = events.find(e=> e.id === id); if(local) local.featured = next;
  await refreshPublicEvents();
  renderAll();
  renderProfile();
}

async function fillEventsGrid(grid, fetcher, emptyMsg){
  if(!grid) return;
  if(!window.EBOK_DATA){
    grid.innerHTML = `<div class="empty-state"><p>Disponible une fois la base connectée.</p></div>`;
    return;
  }
  grid.innerHTML = `<div class="empty-state"><p>Chargement…</p></div>`;
  let list;
  try{ list = await fetcher(); }
  catch(err){ grid.innerHTML = `<div class="empty-state"><h4>Erreur</h4><p>Impossible de charger les événements.</p></div>`; return; }
  if(!list.length){ grid.innerHTML = `<div class="empty-state"><p>${emptyMsg}</p></div>`; return; }
  list.sort((a,b)=> (b.createdAt || 0) - (a.createdAt || 0));
  grid.innerHTML = list.map(mineCardHtml).join('');
  grid.querySelectorAll('[data-open]').forEach(b=> b.addEventListener('click', ()=> openEvent(b.dataset.open)));
  grid.querySelectorAll('[data-del]').forEach(b=> b.addEventListener('click', ()=> handleDelete(b.dataset.del)));
  grid.querySelectorAll('[data-approve]').forEach(b=> b.addEventListener('click', ()=> handleApprove(b.dataset.approve)));
  grid.querySelectorAll('[data-feature]').forEach(b=> b.addEventListener('click', ()=> handleToggleFeatured(b.dataset.feature)));
  grid.querySelectorAll('[data-dispo]').forEach(sel=> sel.addEventListener('change', ()=> handleDispoChange(sel.dataset.dispo, sel.value)));
}

function mineCardHtml(ev){
  const pending = ev.status !== 'approved';
  const feat = !!ev.featured;
  const cur = ev.dispo || '';
  const opt = (v,l)=> `<option value="${v}" ${cur===v?'selected':''}>${l}</option>`;
  // Étoile "à la une" réservée à l'admin (met/enlève l'événement en avant).
  const starBtn = currentIsAdmin
    ? `<button class="star-toggle card-star ${feat ? 'on' : ''}" data-feature="${esc(ev.id)}" aria-pressed="${feat}" title="${feat ? 'Retirer de la une' : 'Mettre à la une'}">★</button>`
    : '';
  return `<div class="mine-card-wrap">
    <span class="status-pill ${pending ? 'status-pending' : 'status-approved'}">${pending ? 'En attente' : 'En ligne'}</span>
    ${starBtn}
    ${eventCardHtml(ev)}
    <div class="mine-dispo">
      <label for="dispo-${esc(ev.id)}">Places&nbsp;:</label>
      <select id="dispo-${esc(ev.id)}" data-dispo="${esc(ev.id)}">
        ${opt('', '— Non précisé')}${opt('dispo','Places disponibles')}${opt('limite','Encore quelques places')}${opt('complet','Complet')}
      </select>
    </div>
    <div class="mine-card-actions">
      <button class="btn btn-ghost" data-open="${esc(ev.id)}">Voir</button>
      ${(currentIsAdmin && pending) ? `<button class="btn btn-approve" data-approve="${esc(ev.id)}">Valider</button>` : ''}
      <button class="btn btn-danger" data-del="${esc(ev.id)}">Supprimer</button>
    </div>
  </div>`;
}

/* Mise à jour rapide de la disponibilité depuis le dashboard. */
async function handleDispoChange(id, dispo){
  const ev = events.find(e=> e.id === id);
  if(ev) ev.dispo = dispo;
  if(window.EBOK_DATA && window.EBOK_DATA.updateEvent){
    try{ await window.EBOK_DATA.updateEvent(id, { dispo }); }
    catch(err){ alert("Mise à jour impossible."); }
  }
  renderAll();
  if(document.getElementById('page-profile').classList.contains('active')) renderProfile();
}

async function handleDelete(id){
  if(!confirm('Supprimer cet événement ? Cette action est définitive.')) return;
  try{
    await window.EBOK_DATA.deleteEvent(id);
    events = events.filter(e=> e.id !== id);
    renderAll();
    renderProfile();
  }catch(err){ showAdminRulesAlert(err); }
}

async function handleApprove(id){
  try{
    await window.EBOK_DATA.approveEvent(id);
    const list = await window.EBOK_DATA.getAllEvents();
    if(Array.isArray(list)){ events = list; renderAll(); }
    renderProfile();
  }catch(err){ showAdminRulesAlert(err); }
}

/* ---- Modale d'édition d'un événement (admin) ---- */
let editingId = null;
let editPosterData = null;        // nouvelle affiche (dataURL) si remplacée
let editPickedLocation = null;    // ville revalidée dans la liste (coords + région)

function setFieldVal(id, v){ const el = document.getElementById(id); if(el) el.value = (v == null ? '' : v); }
function showEditError(msg){
  const e = document.getElementById('editError');
  if(!e) return; e.textContent = msg; e.classList.remove('hidden');
}
function closeEditModal(){
  const modal = document.getElementById('editModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  editingId = null;
  editPosterData = null;
  editPickedLocation = null;
}

function openEditModal(id){
  const ev = adminList.find(e=> e.id === id) || events.find(e=> e.id === id);
  if(!ev){ return; }
  editingId = id;
  editPosterData = null;
  editPickedLocation = null;
  ensureCitiesLoaded();
  setFieldVal('e-title', ev.title);
  setFieldVal('e-type', ev.type || 'Divers');
  setFieldVal('e-niveau', ev.niveau || 'Loisir');
  setFieldVal('e-city', ev.city);
  setRegionValue('e-region', ev.region);
  setFieldVal('e-address', (ev.infos && ev.infos.adresse) || ev.lieu || '');
  setFieldVal('e-date-start', ev.dateStart);
  setFieldVal('e-date-end', ev.dateEnd);
  setFieldVal('e-sexe', ev.sexe || 'Mixte');
  setFieldVal('e-tarif', ev.tarif || '');
  setFieldVal('e-inscription', ev.lienInscription || '');
  setFieldVal('e-billetterie', ev.lienBilletterie || '');
  setFieldVal('e-site-officiel', ev.siteOfficiel || '');
  renderCountrySelect('e-pays', eventCountry(ev));
  renderAgeChoices('e-age', ev.age);
  fillVoyage('e', ev.voyage);
  toggleVoyageBlock('e-voyage', ev.type || 'Divers');
  const eType = document.getElementById('e-type');
  // Propriété (et non addEventListener) : la modale est rouverte à chaque
  // édition, un écouteur ajouté s'y empilerait.
  if(eType) eType.onchange = ()=> toggleVoyageBlock('e-voyage', eType.value);
  setFieldVal('e-places', ev.placesTotal != null ? ev.placesTotal : '');
  setFieldVal('e-dispo', ev.dispo || '');
  setFieldVal('e-status', ev.status === 'approved' ? 'approved' : 'pending');
  setFieldVal('e-desc', ev.description);
  const feat = document.getElementById('e-featured'); if(feat) feat.checked = !!ev.featured;
  const prev = document.getElementById('e-poster-preview');
  if(prev){
    if(ev.poster){ prev.src = ev.poster; prev.classList.remove('hidden'); }
    else{ prev.src = ''; prev.classList.add('hidden'); }
  }
  const fileInput = document.getElementById('e-poster-file'); if(fileInput) fileInput.value = '';
  document.getElementById('editError').classList.add('hidden');
  const modal = document.getElementById('editModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function initEditModal(){
  const modal = document.getElementById('editModal');
  if(!modal) return;
  document.getElementById('editClose').addEventListener('click', closeEditModal);
  document.getElementById('editCancel').addEventListener('click', closeEditModal);
  bindBackdropClose(modal, closeEditModal);

  // Autocomplétion de ville dans l'édition → corrige position + région.
  attachCityAutocomplete('e-city', 'e-city-ac', pick=>{
    editPickedLocation = pick;
    setRegionValue('e-region', pick.region);
  });

  const fileInput = document.getElementById('e-poster-file');
  fileInput.addEventListener('change', async ()=>{
    const file = fileInput.files[0];
    if(!file) return;
    // Même compression qu'à la création : l'affiche part maintenant sur le
    // stockage, inutile d'y envoyer l'original plein format.
    try{
      editPosterData = await compressImage(file);
    }catch(err){
      console.warn("[EBOK] Lecture de l'affiche impossible.", err);
      return;
    }
    const prev = document.getElementById('e-poster-preview');
    if(prev){ prev.src = editPosterData; prev.classList.remove('hidden'); }
  });

  document.getElementById('editForm').addEventListener('submit', async e=>{
    e.preventDefault();
    if(!editingId) return;
    const gv = id => (document.getElementById(id)?.value || '').trim();
    const ev = adminList.find(x=> x.id === editingId) || events.find(x=> x.id === editingId);

    const patch = {
      title: gv('e-title') || 'Événement sans nom',
      type: gv('e-type') || 'Divers',
      niveau: gv('e-niveau'),
      city: gv('e-city'),
      region: gv('e-region'),
      lieu: gv('e-address') || gv('e-city'),
      dateStart: gv('e-date-start'),
      dateEnd: gv('e-date-end') || gv('e-date-start'),
      sexe: gv('e-sexe'),
      pays: gv('e-pays') || DEFAULT_COUNTRY,
      age: readAgeChoices('e-age'),
      tarif: gv('e-tarif'),
      lienInscription: lienPropre(gv('e-inscription')),
      lienBilletterie: lienPropre(gv('e-billetterie')),
      siteOfficiel: lienPropre(gv('e-site-officiel')),
      voyage: readVoyage('e', gv('e-type') || 'Divers'),
      dispo: gv('e-dispo'),
      description: gv('e-desc'),
      status: gv('e-status') === 'approved' ? 'approved' : 'pending',
      featured: document.getElementById('e-featured').checked
    };
    const placesRaw = gv('e-places');
    patch.placesTotal = placesRaw ? parseInt(placesRaw, 10) : null;
    patch.infos = Object.assign({}, ev && ev.infos, { adresse: gv('e-address') });

    // Recalcule TOUJOURS la position depuis la ville (corrige aussi les
    // événements anciens mal placés). Priorité : ville revalidée dans la
    // liste → base locale des villes → géocodage de l'adresse.
    // Hors de France, ces sources ne connaissent pas le lieu et replaceraient
    // l'événement en métropole : on n'y touche pas.
    if(patch.pays === DEFAULT_COUNTRY){
      await ensureCitiesLoaded();
      const picked = (editPickedLocation &&
        normalizeCity(patch.city).startsWith(normalizeCity(editPickedLocation.city)))
        ? editPickedLocation : null;
      const loc = picked || cityCoordsLocal(patch.city);
      if(loc){
        patch.x = loc.x; patch.y = loc.y;
        if(loc.lat != null){ patch.lat = loc.lat; patch.lng = loc.lng; }
        if(loc.region) patch.region = loc.region;   // région officielle
      }else{
        const c = await resolveCoords(gv('e-address'), patch.city, patch.region);
        patch.x = c.x; patch.y = c.y;
        if(c.lat != null){ patch.lat = c.lat; patch.lng = c.lng; }
      }
    }
    if(editPosterData){ patch.poster = await hostPoster(editPosterData); }

    try{ await window.EBOK_DATA.updateEvent(editingId, patch); }
    catch(err){
      closeEditModal();
      showAdminRulesAlert(err);
      return;
    }

    if(ev) Object.assign(ev, patch);
    const local = events.find(x=> x.id === editingId);
    if(local) Object.assign(local, patch);
    closeEditModal();
    await refreshPublicEvents();
    renderAll();
    renderProfile();
  });
}

/* =========================================================
   INIT
   ========================================================= */

/* Redessine tout ce qui dépend des données (carte, carrousel, listes).
   Appelé au démarrage, quand un événement est publié, et quand une
   source externe (clerk-init.js) renvoie les données. Ne rebranche PAS les
   écouteurs des filtres (faits une seule fois via initHomeFilters). */
/* Compteur « 🏀 N events à venir » au-dessus du titre de l'accueil.
   Caché tant qu'il y a moins de COMPTEUR_SEUIL événements à venir : un petit
   chiffre ferait l'effet inverse de celui recherché. */
const COMPTEUR_SEUIL = 50;
function renderCompteur(){
  const el = document.getElementById('heroCompteur');
  if(!el) return;
  const n = events.filter(ev => ev && ev.dateEnd && !isPast(ev)).length;
  el.hidden = n < COMPTEUR_SEUIL;
  el.textContent = `🏀 ${n} events à venir`;
}

function renderAll(){
  renderCompteur();
  buildMap();
  renderFeatured();
  applyMapFilters();
  renderResults();
}

/* Point d'entrée exposé pour la couche de données optionnelle (clerk-init.js).
   Tant qu'elle n'est pas branchée, l'app tourne sur les données locales
   de data.js. */
window.EBOK = {
  get events(){ return events; },
  setEvents(list){ if(Array.isArray(list)) events = list; renderAll(); tryOpenFromUrl(); },
  addEvent(ev){ events = [ev, ...events]; renderAll(); },
  // Appelé par clerk-init.js selon que le service de comptes répond ou non.
  setAuthAvailable,
  // Appelé par clerk-init.js à chaque connexion / déconnexion.
  async onAuthChanged(user, profile, admin){
    currentUser = user || null;
    currentProfile = profile || null;
    currentIsAdmin = !!admin;
    updateAuthUI();
    await loadFavorites();
    renderAll();                 // rafraîchit les ♥ sur les cartes
    prefillOrgFromProfile();     // le profil diffuseur arrive avec la session
    renderOnboardingNudge();
    syncMenu();                  // le volet reflète l'état de connexion
    await chargerAlertes();
    renderAlertes();
    if(document.getElementById('page-alertes').classList.contains('active')) ouvrirPageAlertes();
    if(document.getElementById('page-favoris').classList.contains('active')) renderFavorites();
    maybeOpenOnboarding();       // première connexion : on pose les 4 questions
    if(document.getElementById('page-profile').classList.contains('active')) renderProfile();
  }
};

/* =========================================================
   THÈME (clair / sombre)
   ========================================================= */
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  if(btn) btn.textContent = theme === 'light' ? '☀️' : '🌙';
}
function initTheme(){
  // Clair par défaut ; le sombre reste disponible via la bascule.
  const saved = localStorage.getItem('ebok-theme') || 'light';
  applyTheme(saved);
  const btn = document.getElementById('themeToggle');
  if(btn) btn.addEventListener('click', ()=>{
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem('ebok-theme', next);
  });
}

// Écouteurs (une seule fois) + premier rendu sur les données locales.
initTheme();           // applique le thème mémorisé avant le rendu
initGeoloc();          // restaure une éventuelle position avant le 1er dessin
loadFavorites();       // favoris locaux (mode démo) avant le 1er dessin
buildMap();
initMapZoom();
fillRegionSelect('c-region', 'Choisis une région');
fillRegionSelect('e-region', 'Choisis une région');
renderFeatured();
initHomeFilters();
initSearchPage();
initCreatePage();
initAuth();
initEditModal();
initProfileEdit();
initOnboarding();
initMenu();
initFooter();
initAlertes();
initAiImport();
initPostersMaintenance();

// Lien partagé vers une fiche : on l'ouvre dès le démarrage.
tryOpenFromUrl();

