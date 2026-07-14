/* =========================================================
   EBOK Event — LOGIQUE APPLICATIVE
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

function eventCardHtml(ev){
  return `
    <div class="event-card" data-id="${ev.id}">
      <div class="card-media">
        ${ev.poster ? `<img src="${ev.poster}" alt="Affiche ${ev.title}">` : `<div style="width:100%;height:100%;background:linear-gradient(135deg, ${TYPE_COLORS[ev.type]}33, var(--asphalt-3));display:flex;align-items:center;justify-content:center;font-family:var(--font-display);color:${TYPE_COLORS[ev.type]};font-size:15px;">${ev.type.toUpperCase()}</div>`}
        <span class="card-type-badge" style="background:${TYPE_COLORS[ev.type]}">${ev.type}</span>
        ${isPast(ev) ? `<span class="card-past-badge">Terminé</span>` : ``}
        ${ev.dispo && DISPO_META[ev.dispo] ? `<span class="dispo-badge ${DISPO_META[ev.dispo].cls}">${DISPO_META[ev.dispo].label}</span>` : ``}
        <button class="fav-btn ${favorites.has(ev.id) ? 'active' : ''}" data-fav="${ev.id}" aria-label="Enregistrer en favori" title="Mettre de côté">♥</button>
      </div>
      <div class="card-body">
        <h4>${ev.title}</h4>
        <div class="card-meta">
          <b>${ev.city}</b> · ${fmtDateRange(ev.dateStart, ev.dateEnd)}<br>
          ${ev.sexe} · ${ev.age} · ${ev.niveau}
        </div>
      </div>
    </div>`;
}


let selectedRegion = '';

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

  const labels = Object.entries(CITY_LABELS).map(([name,[x,y]])=>
    `<circle class="city-dot-halo" cx="${x}" cy="${y}" r="6"></circle>
     <circle class="city-dot" cx="${x}" cy="${y}" r="3"></circle>
     <text class="city-name" x="${x+8}" y="${y+3.5}">${name}</text>`
  ).join('');

  const pins = events.map(ev=>{
    const c = TYPE_COLORS[ev.type];
    return `<g class="pin" data-id="${ev.id}" data-type="${ev.type}">
      <circle class="core" cx="${ev.x}" cy="${ev.y}" r="8" fill="${c}"></circle>
      <circle cx="${ev.x}" cy="${ev.y}" r="2.6" fill="#fff"></circle>
    </g>`;
  }).join('');

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

  svg.innerHTML = `
    <g class="region-base-layer">${base}</g>
    <g class="region-layer" id="regionLayer">${tops}</g>
    <g class="city-layer">${labels}</g>
    ${overseas}
    <g class="geo-layer">${geoMarker}</g>
    <g class="pin-layer">${pins}</g>`;

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

  svg.querySelectorAll('.pin').forEach(pin=>{
    pin.addEventListener('mouseenter', ()=> showTooltip(pin));
    pin.addEventListener('mouseleave', hideTooltip);
    pin.addEventListener('click', (e)=>{ e.stopPropagation(); openEvent(pin.dataset.id); });
  });
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
  const lieu = document.getElementById('f-lieu');
  if(lieu) lieu.value = name;
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
  selectedRegion = FRANCE_REGIONS.some(r=> r.name === homeCity) ? homeCity : '';
  applySelectedRegionStyle();
}

function showTooltip(pin){
  const ev = events.find(e=>e.id===pin.dataset.id);
  const tt = document.getElementById('mapTooltip');
  const wrap = document.querySelector('.map-wrap');
  const svg = document.getElementById('franceMap');
  const svgRect = svg.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const scale = svgRect.width/MAP_W;
  const left = (svgRect.left - wrapRect.left) + ev.x*scale;
  const top = (svgRect.top - wrapRect.top) + ev.y*scale;
  tt.style.left = left+"px";
  tt.style.top = top+"px";
  tt.innerHTML = `<div class="tt-type" style="color:${TYPE_COLORS[ev.type]}">${ev.type}</div>
    <div class="tt-title">${ev.title}</div>
    <div class="tt-meta">${ev.lieu}<br>${fmtDateRange(ev.dateStart,ev.dateEnd)}<br>${ev.sexe} · ${ev.age} · ${ev.niveau}</div>`;
  tt.classList.add('show');
}
function hideTooltip(){ document.getElementById('mapTooltip').classList.remove('show'); }

/* =========================================================
   FILTERS — home map
   ========================================================= */

function initHomeFilters(){
  document.querySelectorAll('#statusFilterHome .status-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      homeStatus = btn.dataset.status;
      document.querySelectorAll('#statusFilterHome .status-btn').forEach(b=> b.classList.toggle('active', b===btn));
      applyMapFilters();
    });
  });

  // Barre de recherche ville/région avec autocomplétion
  const cities = [...new Set(events.flatMap(e=>[e.city, e.region]))].sort();
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
  
  citySearch.addEventListener('input', (e)=> showSuggestions(e.target.value));
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

  // Calendrier de période (date début / date fin)
  let pickerMonth = new Date(2026, 5); // juin 2026
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
            periodStart = ''; // Déselectionner au 2e clic
          }else{
            periodStart = date;
            periodEnd = ''; // En mode single, on ne met pas periodEnd
          }
        }
        
        updatePeriodDisplay();
        renderPicker();
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
      `<button type="button" class="type-chip active" data-type="${type}" style="--chip:${color}" aria-pressed="true"><span class="dot"></span>${type}</button>`);
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
  document.getElementById('typeNone').addEventListener('click', ()=> setAllTypes(false));

  updateTypeLabel();
  applyMapFilters();
}

/* Met à jour l'intitulé du bouton "Types" selon la sélection. */
function updateTypeLabel(){
  const chips = document.querySelectorAll('#typeFilterHome .type-chip');
  const active = document.querySelectorAll('#typeFilterHome .type-chip.active');
  const label = document.getElementById('typeDdLabel');
  if(!label) return;
  if(active.length === chips.length) label.textContent = 'Tous les types';
  else if(active.length === 0) label.textContent = 'Aucun type';
  else if(active.length === 1) label.textContent = active[0].dataset.type;
  else label.textContent = `${active.length} types`;
}

let homeView = 'map';
let homeStatus = 'upcoming';
let homeCity = '';
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

function computeHomeFilteredEvents(){
  const checkedTypes = Array.from(document.querySelectorAll('#typeFilterHome .type-chip.active')).map(c=>c.dataset.type);
  
  return events.filter(ev=>{
    if(!checkedTypes.includes(ev.type)) return false;
    if(homeStatus === 'upcoming' && isPast(ev)) return false;
    if(homeStatus === 'archived' && !isPast(ev)) return false;
    if(periodStart && ev.dateEnd < periodStart) return false;
    if(periodEnd && ev.dateStart > periodEnd) return false;
    if(homeCity && ev.city !== homeCity && ev.region !== homeCity) return false;
    // "Partout" (curseur au max, >= 200) = aucune limite de distance.
    if(homeRadius < 200 && getEventDistance(ev) > homeRadius) return false;
    return true;
  });
}

function applyMapFilters(){
  const filtered = computeHomeFilteredEvents();
  const filteredIds = filtered.map(e=>e.id);
  document.querySelectorAll('.pin').forEach(pin=>{
    pin.classList.toggle('dimmed', !filteredIds.includes(pin.dataset.id));
  });
  document.getElementById('homeCount').textContent = `${filtered.length} événement${filtered.length>1?'s':''}`;
  if(homeView === 'list') renderHomeList(filtered);
}

function renderHomeList(filtered){
  const grid = document.getElementById('homeListView');
  if(filtered.length === 0){
    grid.innerHTML = `<div class="empty-state"><h4>Aucun événement ne correspond</h4><p>Essaie d'élargir tes filtres — semaine ou type d'événement.</p></div>`;
    return;
  }
  grid.innerHTML = filtered.slice().sort((a,b)=> a.dateStart.localeCompare(b.dateStart)).map(ev=>`
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
let searchStatus = 'all';   // Statut de la recherche avancée : upcoming / archived / all
function initSearchPage(){
  const typeSel = document.getElementById('f-type');
  Object.keys(TYPE_COLORS).forEach(t=>{
    const opt = document.createElement('option'); opt.value=t; opt.textContent=t;
    typeSel.appendChild(opt);
  });
  document.querySelectorAll('#statusFilterSearch .status-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      searchStatus = btn.dataset.status;
      document.querySelectorAll('#statusFilterSearch .status-btn').forEach(b=> b.classList.toggle('active', b===btn));
      renderResults();
    });
  });
  document.getElementById('searchForm').addEventListener('submit',(e)=>{ e.preventDefault(); renderResults(); });
  document.getElementById('resetSearch').addEventListener('click', ()=>{
    document.getElementById('searchForm').reset();
    searchStatus = 'all';
    document.querySelectorAll('#statusFilterSearch .status-btn').forEach(b=> b.classList.toggle('active', b.dataset.status==='all'));
    renderResults();
  });
  renderResults();
}

function renderResults(){
  const lieu = document.getElementById('f-lieu').value.trim().toLowerCase();
  const type = document.getElementById('f-type').value;
  const dStart = document.getElementById('f-date-start').value;
  const dEnd = document.getElementById('f-date-end').value;
  const sexe = document.getElementById('f-sexe').value;
  const age = document.getElementById('f-age').value;
  const niveau = document.getElementById('f-niveau').value;
  const afficheOnly = document.getElementById('f-affiche').checked;

  let results = events.filter(ev=>{
    if(lieu && !(ev.city.toLowerCase().includes(lieu) || ev.region.toLowerCase().includes(lieu) || ev.lieu.toLowerCase().includes(lieu))) return false;
    if(type !== 'all' && ev.type !== type) return false;
    if(dStart && ev.dateEnd < dStart) return false;
    if(dEnd && ev.dateStart > dEnd) return false;
    if(searchStatus === 'upcoming' && isPast(ev)) return false;
    if(searchStatus === 'archived' && !isPast(ev)) return false;
    if(sexe !== 'all' && ev.sexe !== sexe && ev.sexe !== 'Mixte') return false;
    if(age !== 'all' && ev.age !== age) return false;
    if(niveau !== 'all' && ev.niveau !== niveau) return false;
    if(afficheOnly && !ev.poster) return false;
    return true;
  }).sort((a,b)=> a.dateStart.localeCompare(b.dateStart));

  // Carte régionale si le filtre lieu vise une seule région.
  const lieuRaw = document.getElementById('f-lieu').value.trim();
  const region = (typeof FRANCE_REGIONS !== 'undefined')
    ? FRANCE_REGIONS.find(r=> r.name.toLowerCase() === lieuRaw.toLowerCase()) : null;
  if(region) renderRegionMap(region.name, results); else hideRegionMap();

  document.getElementById('resultsCount').textContent = `${results.length} résultat${results.length>1?'s':''}`;
  const grid = document.getElementById('resultsGrid');
  if(results.length===0){
    grid.innerHTML = `<div class="empty-state"><h4>Aucun événement ne correspond</h4><p>Essaie d'élargir tes filtres — lieu, dates ou niveau.</p></div>`;
    return;
  }
  grid.innerHTML = results.map(ev=>`
${eventCardHtml(ev)}`).join('');

  grid.querySelectorAll('.event-card').forEach(card=>{
    card.addEventListener('click', ()=> openEvent(card.dataset.id));
  });
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
    const c = TYPE_COLORS[ev.type] || '#FF5722';
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
  const c = TYPE_COLORS[ev.type] || '#FF5722';
  const poster = ev.poster
    ? `<img src="${ev.poster}" alt="Affiche ${esc(ev.title)}">`
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
  const c = TYPE_COLORS[ev.type] || '#FF5722';
  const thumb = ev.poster
    ? `<img src="${ev.poster}" alt="">`
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
function initCreatePage(){
  const dz = document.getElementById('dropzone');
  const input = document.getElementById('c-affiche');
  const preview = document.getElementById('dzPreview');
  const label = document.getElementById('dzLabel');

  // Autocomplétion de ville (fixe la localisation + la région).
  attachCityAutocomplete('c-ville', 'c-ville-ac', pick=>{
    createPickedLocation = pick;
    const regionEl = document.getElementById('c-region');
    if(regionEl) regionEl.value = pick.region || '';
    const hint = document.getElementById('c-ville-hint');
    if(hint){ hint.textContent = '📍 ' + pick.city + (pick.region ? ' · ' + pick.region : '') + ' — localisé sur la carte.'; hint.style.color = 'var(--green)'; }
  });

  input.addEventListener('change', async ()=>{
    const file = input.files[0];
    if(!file) return;
    try{
      preview.src = await compressImage(file, 1200, 0.8);   // réduit le poids pour Firestore
      preview.classList.remove('hidden');
      label.style.display = 'none';
    }catch(err){ console.warn('[EBOK] Compression affiche échouée', err); }
  });
  ['dragover'].forEach(evt=> dz.addEventListener(evt, e=>{ e.preventDefault(); dz.style.borderColor='var(--orange)'; }));
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
    const {x, y}    = coords;
    const posterSrc = (preview && !preview.classList.contains('hidden')) ? preview.src : null;
    const visibility = document.querySelector('input[name="visibility"]:checked')?.value || 'standard';

    // L'admin (ou le mode démo local) publie directement ; un diffuseur passe
    // en validation. On CRÉE toujours l'événement en "pending" côté Firebase :
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
      city, region,
      lieu: val('c-adresse') || city,
      x, y,
      lat: coords.lat != null ? coords.lat : null,
      lng: coords.lng != null ? coords.lng : null,
      dateStart, dateEnd,
      sexe: val('c-sexe') || 'Mixte',
      age: val('c-age') || 'Séniors (18-35 ans)',
      niveau: val('c-niveau') || 'Loisir',
      poster: posterSrc,
      description: val('c-desc'),
      infos: {
        adresse: val('c-adresse'),
        horaires: val('c-horaires'),
        buvette: val('c-buvette'),
        reservation: val('c-reservation')
      },
      gallery: [],
      placesTotal: val('c-places') ? parseInt(val('c-places'), 10) : null,
      dispo: val('c-dispo') || '',
      featured: visibility !== 'standard',
      visibility,
      status,
      userId: currentUser ? currentUser.uid : null,
      org: {
        name: val('c-orgname') || (currentProfile && (currentProfile.orgname || currentProfile.name)) || 'Organisateur',
        insta: val('c-insta').replace(/^@/, ''),
        site: val('c-site'),
        tel: val('c-tel'),
        email: val('c-email') || (currentUser ? currentUser.email : '')
      }
    };

    // Persistance : si Firebase est branché, on enregistre en base.
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
        console.warn('[EBOK] Enregistrement Firebase échoué.', err);
        const code = String((err && err.code) || '').toLowerCase();
        const msg  = String((err && err.message) || '');
        const tooBig = /longer than|exceeds the maximum|invalid-argument|maximum allowed size/i.test(code + ' ' + msg);
        let banner;
        if(tooBig){
          banner = "⚠️ Enregistrement impossible : l'affiche ou les photos sont trop lourdes. Réessaie avec une image plus légère.";
        }else if(code.includes('permission-denied') || code.includes('unauthenticated')){
          // Règles Firestore : le compte n'a pas le droit d'écrire cet événement.
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
      // Mode démo (sans Firebase) : rien à enregistrer, on affiche directement.
      newEvent.status = 'approved';
      published = true;
    }

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
    if(sub)   sub.textContent = 'Merci de faire vivre le basket français 🏀';
  }else{
    if(title) title.textContent = 'Ton événement a bien été créé !';
    if(text)  text.innerHTML = 'Il va être étudié par notre équipe, puis accepté avant publication <b>sous 24h</b>. Tu le retrouveras ensuite sur la carte et dans la recherche, ainsi que dans « Mes événements ».';
    if(sub)   sub.textContent = 'Merci de faire vivre le basket français 🏀';
  }
  showPage('confirm');
}

/* Devine des coordonnées SVG à partir de la ville/région saisie, en
   s'appuyant sur les villes connues. À remplacer par une vraie
   géolocalisation (lat/lon + géocodage) à la phase géolocalisation. */
/* Réduit et compresse une image (affiche / photo) avant stockage.
   Firestore limite un document à 1 Mo : une image brute en base64 dépasse
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
  const c = TYPE_COLORS[ev.type] || '#FF5722';
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

async function openEvent(id){
  let ev = events.find(e=>e.id===id);
  // Événement absent de la liste publique (ex. en attente de validation) :
  // on le récupère directement depuis Firebase si possible.
  if(!ev && window.EBOK_DATA && typeof window.EBOK_DATA.getEvent === 'function'){
    try{ ev = await window.EBOK_DATA.getEvent(id); }catch(e){ /* ignore */ }
  }
  if(!ev) return;
  currentGallery = ev.gallery || [];
  const el = document.getElementById('eventDetail');
  const posterHtml = ev.poster
    ? `<button type="button" class="poster-zoom" id="posterZoom" title="Agrandir l'affiche" aria-label="Agrandir l'affiche">
         <img src="${ev.poster}" alt="Affiche ${ev.title}">
         <span class="poster-zoom-ic">🔍</span>
       </button>`
    : `<div style="aspect-ratio:3/4;background:linear-gradient(160deg, ${TYPE_COLORS[ev.type]}44, var(--asphalt-3));display:flex;align-items:center;justify-content:center;font-family:var(--font-display);color:${TYPE_COLORS[ev.type]};font-size:22px;text-align:center;padding:20px;">${ev.type.toUpperCase()}<br><span style="font-size:13px;color:var(--chalk-dim);font-family:var(--font-body);margin-top:8px;">Affiche à venir</span></div>`;

  const contactItems = [];
  if(ev.org.insta) contactItems.push(`<a class="popover-item" href="https://instagram.com/${ev.org.insta}" target="_blank"><span class="ic">📷</span>Instagram — @${ev.org.insta}</a>`);
  if(ev.org.site) contactItems.push(`<a class="popover-item" href="${ev.org.site}" target="_blank"><span class="ic">🔗</span>Site web</a>`);
  if(ev.org.tel) contactItems.push(`<a class="popover-item" href="tel:${ev.org.tel.replace(/\\s/g,'')}"><span class="ic">📞</span>${ev.org.tel}</a>`);
  if(ev.org.email) contactItems.push(`<a class="popover-item" href="mailto:${ev.org.email}"><span class="ic">✉️</span>${ev.org.email}</a>`);
  if(contactItems.length===0) contactItems.push(`<div class="popover-item" style="color:#7c7768;">Aucun contact renseigné</div>`);

  const shareUrl = `https://courtmap.fr/evenement/${ev.id}`;
  const shareText = encodeURIComponent(`${ev.title} — ${fmtDateRange(ev.dateStart,ev.dateEnd)} à ${ev.city}. Plus d'infos :`);

  const infos = ev.infos || {};
  const placesValue = [
    ev.placesTotal ? `${ev.placesTotal} places` : null,
    ev.dispo && DISPO_META[ev.dispo] ? DISPO_META[ev.dispo].label : null
  ].filter(Boolean).join(' · ');
  const practicalRows = [
    infos.adresse ? {ic:"📍", k:"Adresse", v:infos.adresse} : null,
    infos.horaires ? {ic:"🕐", k:"Horaires", v:infos.horaires} : null,
    infos.buvette ? {ic:"🥤", k:"Buvette", v:infos.buvette} : null,
    infos.reservation ? {ic:"🎟", k:"Réservation", v:infos.reservation} : null,
    placesValue ? {ic:"🎫", k:"Places", v:placesValue} : null,
  ].filter(Boolean);
  const practicalHtml = practicalRows.length
    ? `<div class="practical-grid">${practicalRows.map(r=>`
        <div class="practical-item"><span class="ic">${r.ic}</span><div><div class="k">${r.k}</div><div class="v">${r.v}</div></div></div>`).join('')}</div>`
    : `<p class="practical-empty">Infos pratiques à venir — contacte l'organisateur pour en savoir plus.</p>`;

  const gallery = ev.gallery || [];
  const galleryHtml = gallery.length
    ? `<div class="photo-wall">${gallery.map((g,i)=>`
        <div class="photo-card" data-photo="${i}"><div class="ph" style="background:${g.color}">${g.caption}</div><div class="cap">${g.caption}</div></div>`).join('')}</div>`
    : `<div class="gallery-empty">Aucune photo d'édition précédente pour le moment.</div>`;

  el.innerHTML = `
    <div class="event-side">
      <div class="event-poster">${posterHtml}</div>
      ${miniMapHtml(ev)}
    </div>
    <div class="event-main">
      <div class="badges">
        <div class="badges-left">
          <span class="badge solid" style="background:${TYPE_COLORS[ev.type]}">${ev.type}</span>
          <span class="badge">${ev.niveau}</span>
          <span class="badge">${ev.sexe}</span>
          <span class="badge">${ev.age}</span>
        </div>
        <div class="viewer-counter">
          <span class="vc-icon">👁</span>
          <span class="vc-num" id="vcNum">···</span>
          <span class="vc-label">curieux</span>
        </div>
      </div>
      <h2>${ev.title}</h2>
      <p class="event-org">Organisé par <b>${ev.org.name}</b></p>

      <div class="info-grid">
        <div class="info-cell"><div class="k">Lieu</div><div class="v">${ev.lieu}</div></div>
        <div class="info-cell"><div class="k">Région</div><div class="v">${ev.region}</div></div>
        <div class="info-cell"><div class="k">Dates</div><div class="v">${fmtDateRange(ev.dateStart, ev.dateEnd)}</div></div>
        <div class="info-cell"><div class="k">Niveau</div><div class="v">${ev.niveau}</div></div>
      </div>

      <p class="event-desc">${ev.description}</p>

      <div class="practical-block">
        <div class="practical-title">Infos pratiques</div>
        ${practicalHtml}
      </div>

      <div class="gallery-block">
        <div class="gallery-title">Photos d'éditions précédentes</div>
        ${galleryHtml}
      </div>

      <div class="action-row">
        <button class="btn btn-primary btn-lg" id="btnInfo">Se renseigner</button>
        <button class="btn btn-ghost btn-lg" id="btnShare">Partager</button>
        <button class="btn btn-ghost btn-lg fav-btn fav-btn-lg ${favorites.has(ev.id) ? 'active' : ''}" data-fav="${ev.id}">${favorites.has(ev.id) ? '♥ Enregistré' : '♡ Enregistrer'}</button>

        <div class="popover" id="popInfo">${contactItems.join('')}</div>

        <div class="popover" id="popShare">
          <a class="popover-item" target="_blank" href="https://wa.me/?text=${shareText}%20${encodeURIComponent(shareUrl)}"><span class="ic">💬</span>WhatsApp</a>
          <a class="popover-item" href="sms:?&body=${shareText}%20${encodeURIComponent(shareUrl)}"><span class="ic">📱</span>SMS</a>
          <a class="popover-item" href="mailto:?subject=${encodeURIComponent(ev.title)}&body=${shareText}%20${encodeURIComponent(shareUrl)}"><span class="ic">✉️</span>Email</a>
          <a class="popover-item" target="_blank" href="https://instagram.com"><span class="ic">📷</span>Instagram (copier le lien pour ta story)</a>
          <button class="popover-item" id="btnCopyLink" style="width:100%;text-align:left;border:none;background:none;"><span class="ic">🔗</span>Copier le lien</button>
          <div class="share-copied" id="shareCopied">Lien copié ✓</div>
        </div>
      </div>

      <div class="curieux-counter">
        <span class="cc-eye">👁</span>
        <div>
          <div class="cc-label">Nombre de curieux</div>
          <div class="cc-sub">personnes ont consulté cet événement</div>
        </div>
        <span class="cc-num" id="vcNumBottom">···</span>
      </div>
    </div>`;

  document.getElementById('btnInfo').addEventListener('click', (e)=>{
    e.stopPropagation();
    document.getElementById('popShare').classList.remove('open');
    document.getElementById('popInfo').classList.toggle('open');
  });
  document.getElementById('btnShare').addEventListener('click', (e)=>{
    e.stopPropagation();
    document.getElementById('popInfo').classList.remove('open');
    document.getElementById('popShare').classList.toggle('open');
  });
  document.getElementById('btnCopyLink').addEventListener('click', ()=>{
    navigator.clipboard.writeText(shareUrl).then(()=>{
      document.getElementById('shareCopied').style.display='block';
      setTimeout(()=> document.getElementById('shareCopied').style.display='none', 1800);
    });
  });
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
  document.addEventListener('click', ()=>{
    document.getElementById('popInfo')?.classList.remove('open');
    document.getElementById('popShare')?.classList.remove('open');
  }, {once:true});

  showPage('event');
  loadAndAnimateViews(ev.id);
}

/* ---- compteur de spectateurs (partagé si le stockage est dispo, sinon local) ---- */
async function loadAndAnimateViews(id){
  const seed = VIEW_SEEDS[id] || 120;
  let count = null;
  // 1) Source privilégiée : Firebase (compteur partagé entre tous les visiteurs).
  if(window.EBOK_DATA && typeof window.EBOK_DATA.incrementViews === 'function'){
    try{
      const c = await window.EBOK_DATA.incrementViews(id, seed);
      if(typeof c === 'number' && !isNaN(c)) count = c;
    }catch(e){ count = null; }
  }
  // 2) Sinon : stockage partagé de la plateforme s'il existe.
  try{
    if(count === null && window.storage){
      let existing = null;
      try{ existing = await window.storage.get('views:'+id, true); }catch(e){ existing = null; }
      const current = existing ? parseInt(existing.value, 10) : seed;
      count = (isNaN(current) ? seed : current) + 1;
      try{ await window.storage.set('views:'+id, String(count), true); }catch(e){ /* pas grave, on affiche quand même */ }
    }
  }catch(e){ count = null; }
  if(count === null){
    sessionCounters[id] = (sessionCounters[id] || seed) + 1;
    count = sessionCounters[id];
  }
  animateCount(document.getElementById('vcNum'), count);
  animateCount(document.getElementById('vcNumBottom'), count);
}
function animateCount(el, target){
  if(!el) return;
  const start = Math.max(0, target - 40);
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
function fmtDate(d){
  const dt = new Date(d+"T00:00:00");
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
}
function fmtDateRange(s,e){
  if(s===e) return fmtDate(s)+" 2026";
  const sd = new Date(s+"T00:00:00"), ed = new Date(e+"T00:00:00");
  if(sd.getMonth()===ed.getMonth()) return `${sd.getDate()} — ${ed.getDate()} ${MONTHS[ed.getMonth()]} 2026`;
  return `${fmtDate(s)} — ${fmtDate(e)} 2026`;
}

function openLightbox(item){
  const content = document.getElementById('lightboxContent');
  if(item.img){
    content.innerHTML = `<img src="${item.img}" alt="${item.caption||'Photo'}">`;
  }else{
    content.innerHTML = `<div class="lightbox-placeholder" style="background:${item.color||'#28282D'}">${item.caption||''}</div>`;
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
    const c = TYPE_COLORS[ev.type] || '#FF5722';
    const bg = ev.poster
      ? `background-image:url('${ev.poster}')`
      : `background:radial-gradient(120% 120% at 20% 0%, ${c}, #101014 70%)`;
    const poster = ev.poster
      ? `<img src="${ev.poster}" alt="Affiche ${esc(ev.title)}">`
      : `<div class="fx-poster-ph" style="--c:${c}">${esc((ev.type||'').slice(0,12).toUpperCase())}</div>`;
    const meta = [fmtDateRange(ev.dateStart, ev.dateEnd), ev.niveau, ev.sexe].filter(Boolean).join(' · ');
    return `<div class="carousel-item">
      <div class="fx-bg ${ev.poster ? 'blur' : ''}" style="${bg}"></div>
      <div class="fx-scrim"></div>
      <div class="fx-content">
        <div class="fx-poster">${poster}</div>
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
  track.querySelectorAll('[data-open]').forEach(b=> b.addEventListener('click', ()=> openEvent(b.dataset.open)));

  // Pause au survol pour laisser le temps de lire.
  const wrapper = slot.querySelector('.carousel-wrapper');
  if(wrapper){ wrapper.onmouseenter = stopAuto; wrapper.onmouseleave = startAuto; }

  goToSlide(0);
  startAuto();
}

/* =========================================================
   NAVIGATION
   ========================================================= */
function showPage(name){
  // Espace réservé aux comptes connectés (si l'auth est active).
  if(name === 'profile' && !currentUser && window.EBOK_AUTH){ openAuth('login'); return; }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.querySelectorAll('.navlink').forEach(n=>n.classList.toggle('active', n.dataset.nav===name));
  // Publier exige un compte : on propose la connexion sans masquer le formulaire.
  if(name === 'create' && !currentUser && window.EBOK_AUTH){ openAuth('login'); }
  // Précharge la base des villes dès qu'on arrive sur la page de publication.
  if(name === 'create') ensureCitiesLoaded();
  if(name === 'profile') renderProfile();
  window.scrollTo({top:0, behavior:'instant'});
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
    // Mode démo (sans Firebase) : on garde les favoris en local.
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
  updateFavButtons(id);
  if(currentUser && window.EBOK_DATA && window.EBOK_DATA.toggleFavorite){
    try{ await window.EBOK_DATA.toggleFavorite(currentUser.uid, id, add); }
    catch(e){ /* on garde l'état local même si l'écriture échoue */ }
  }else{
    localStorage.setItem('ebok-favs', JSON.stringify([...favorites]));
  }
  if(document.getElementById('page-profile').classList.contains('active')) renderProfile();
}

function updateFavButtons(id){
  const on = favorites.has(id);
  document.querySelectorAll(`.fav-btn[data-fav="${id}"]`).forEach(b=>{
    b.classList.toggle('active', on);
    if(b.classList.contains('fav-btn-lg')) b.textContent = on ? '♥ Enregistré' : '♡ Enregistrer';
  });
}

// Délégation en phase de capture : le clic sur ♥ n'ouvre pas l'événement.
document.addEventListener('click', (e)=>{
  const btn = e.target.closest && e.target.closest('.fav-btn');
  if(btn){ e.preventDefault(); e.stopPropagation(); toggleFav(btn.dataset.fav); }
}, true);

async function renderFavorites(){
  const grid = document.getElementById('favoritesGrid');
  if(!currentUser && window.EBOK_AUTH){
    grid.innerHTML = `<div class="empty-state"><h4>Connecte-toi</h4><p>Crée un compte pour enregistrer tes événements favoris.</p></div>`;
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
  list.sort((a,b)=> a.dateStart.localeCompare(b.dateStart));
  grid.innerHTML = list.map(eventCardHtml).join('');
  grid.querySelectorAll('.event-card').forEach(card=>{
    card.addEventListener('click', ()=> openEvent(card.dataset.id));
  });
}

function openAuth(tab){
  switchAuthTab(tab || 'login');
  document.getElementById('authError').classList.add('hidden');
  const modal = document.getElementById('authModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}
function closeAuth(){
  const modal = document.getElementById('authModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}
function switchAuthTab(tab){
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabSignup').classList.toggle('active', tab === 'signup');
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('signupForm').classList.toggle('hidden', tab !== 'signup');
  document.getElementById('authError').classList.add('hidden');
}
function showAuthError(msg){
  const e = document.getElementById('authError');
  e.textContent = msg;
  e.classList.remove('hidden');
}
function authMessage(err){
  const c = (err && err.code) || '';
  if(c.includes('email-already-in-use')) return "Cet email a déjà un compte. Essaie de te connecter.";
  if(c.includes('invalid-email')) return "Adresse email invalide.";
  if(c.includes('weak-password')) return "Mot de passe trop court (6 caractères minimum).";
  if(c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found'))
    return "Email ou mot de passe incorrect.";
  if(c.includes('too-many-requests')) return "Trop de tentatives. Réessaie dans quelques minutes.";
  return "Une erreur est survenue. Réessaie.";
}

/* ---------- Profil membre (questions inscription + édition) ---------- */
const ROLE_OPTIONS = ["Joueur", "Coach", "Organisateur", "Club", "Ligue", "Autre"];
const INTEREST_OPTIONS = ["Tournois", "Camps", "Circuit 3x3", "Détections", "All-Star Game", "Clinic Coachs", "Show", "Voyage", "Matchs de Gala", "Handibasket"];
const MAX_INTERESTS = 3;
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
    interests
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
      `<b>${displayName()}</b>${currentIsAdmin ? '<span class="account-badge-admin">Admin</span>' : ''}`;
  }
  const iaImport = document.getElementById('iaImport');
  if(iaImport) iaImport.classList.toggle('hidden', !currentIsAdmin);
}

function initAuth(){
  const modal = document.getElementById('authModal');
  // Injecte les questions de profil dans le formulaire d'inscription.
  const suProfile = document.getElementById('su-profile');
  if(suProfile){ suProfile.innerHTML = profileFieldsHtml('su-'); wireProfileFields('su-'); }
  document.getElementById('btnLogin').addEventListener('click', ()=> openAuth('login'));
  document.getElementById('btnSignup').addEventListener('click', ()=> openAuth('signup'));
  document.getElementById('authClose').addEventListener('click', closeAuth);
  bindBackdropClose(modal, closeAuth);
  document.getElementById('tabLogin').addEventListener('click', ()=> switchAuthTab('login'));
  document.getElementById('tabSignup').addEventListener('click', ()=> switchAuthTab('signup'));

  document.getElementById('loginForm').addEventListener('submit', async e=>{
    e.preventDefault();
    if(!window.EBOK_AUTH){ showAuthError("Connexion indisponible (Firebase non activé)."); return; }
    try{
      await window.EBOK_AUTH.signIn(
        document.getElementById('login-email').value.trim(),
        document.getElementById('login-pass').value
      );
      closeAuth();
    }catch(err){ showAuthError(authMessage(err)); }
  });

  document.getElementById('signupForm').addEventListener('submit', async e=>{
    e.preventDefault();
    if(!window.EBOK_AUTH){ showAuthError("Inscription indisponible (Firebase non activé)."); return; }
    const profile = Object.assign(
      { name: document.getElementById('su-name').value.trim() },
      readProfileFields('su-')
    );
    try{
      await window.EBOK_AUTH.signUp(
        document.getElementById('su-email').value.trim(),
        document.getElementById('su-pass').value,
        profile
      );
      closeAuth();
    }catch(err){ showAuthError(authMessage(err)); }
  });

  // Connexion avec Google
  document.getElementById('btnGoogle').addEventListener('click', async ()=>{
    if(!window.EBOK_AUTH || !window.EBOK_AUTH.signInWithGoogle){
      showAuthError("Connexion Google indisponible (à activer dans Firebase)."); return;
    }
    try{ await window.EBOK_AUTH.signInWithGoogle(); closeAuth(); }
    catch(err){ showAuthError(authMessage(err)); }
  });

  const logout = async ()=>{
    if(window.EBOK_AUTH) await window.EBOK_AUTH.signOutUser();
    showPage('home');
  };
  document.getElementById('btnLogout').addEventListener('click', logout);
  document.getElementById('btnLogout2').addEventListener('click', logout);

  updateAuthUI();
}

/* ---- Page "Mon profil" (favoris + événements publiés + admin) ---- */
async function renderProfile(){
  if(!currentUser) return;
  // En-tête
  const name = displayName();
  document.getElementById('profileName').innerHTML =
    `${name}${currentIsAdmin ? '<span class="account-badge-admin">Admin</span>' : ''}`;
  document.getElementById('profileEmail').textContent = currentUser.email || '';
  const initials = (name || '?').trim().slice(0,2).toUpperCase();
  const avatarEl = document.getElementById('profileAvatar');
  if(currentProfile && currentProfile.photo){
    avatarEl.style.backgroundImage = `url(${currentProfile.photo})`;
    avatarEl.classList.add('has-photo');
    avatarEl.textContent = '';
  }else{
    avatarEl.style.backgroundImage = '';
    avatarEl.classList.remove('has-photo');
    avatarEl.textContent = initials;
  }

  renderProfileAbout();
  renderFavorites();
  renderMyEvents();
  const adminSection = document.getElementById('adminSection');
  adminSection.classList.toggle('hidden', !currentIsAdmin);
  if(currentIsAdmin){ renderAdminEvents(); renderAdminMembers(); }
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
    p.practice ? ['Niveau / club', p.practice] : null,
    p.favClub ? ['Club préféré', p.favClub] : null,
    (Array.isArray(p.interests) && p.interests.length) ? ['Événements préférés', p.interests.join(', ')] : null,
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

/* Tous les événements (section admin) — rendu sous forme de tableau. */
async function renderAdminEvents(){
  const wrap = document.getElementById('adminGrid');
  if(!wrap) return;
  if(!window.EBOK_DATA){
    wrap.innerHTML = `<div class="empty-state"><p>Disponible une fois Firebase activé.</p></div>`;
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
  return `<div class="admin-table-scroll">
    <table class="admin-table">
      <thead><tr>
        <th>Statut</th>
        <th class="col-center">À la une</th>
        <th>Événement</th>
        <th>Créateur</th>
        <th>Type</th>
        <th>Ville</th>
        <th>Dates</th>
        <th class="col-actions">Actions</th>
      </tr></thead>
      <tbody>${list.map(adminRowHtml).join('')}</tbody>
    </table>
  </div>`;
}

function adminRowHtml(ev){
  const pending = ev.status !== 'approved';
  const feat = !!ev.featured;
  return `<tr>
    <td><span class="status-dot ${pending ? 'status-pending' : 'status-approved'}">${pending ? 'En attente' : 'En ligne'}</span></td>
    <td class="col-center">
      <button class="star-toggle ${feat ? 'on' : ''}" data-feature="${esc(ev.id)}" aria-pressed="${feat}" title="${feat ? 'Retirer de la une' : 'Mettre à la une'}">★</button>
    </td>
    <td class="col-title"><b>${esc(ev.title)}</b></td>
    <td>${creatorLabel(ev)}</td>
    <td>${esc(ev.type || '')}</td>
    <td>${esc(ev.city || '')}</td>
    <td class="col-dates">${fmtDateRange(ev.dateStart, ev.dateEnd)}</td>
    <td class="col-actions">
      <button class="btn btn-ghost btn-xs" data-open="${esc(ev.id)}">Voir</button>
      <button class="btn btn-ghost btn-xs" data-edit="${esc(ev.id)}">Modifier</button>
      ${pending ? `<button class="btn btn-approve btn-xs" data-approve="${esc(ev.id)}">Valider</button>` : ''}
      <button class="btn btn-danger btn-xs" data-del="${esc(ev.id)}">Supprimer</button>
    </td>
  </tr>`;
}

/* ---- Membres inscrits : tableau synthétique (espace admin) ---- */
async function renderAdminMembers(){
  const wrap = document.getElementById('adminMembers');
  if(!wrap) return;
  if(!window.EBOK_DATA || !window.EBOK_DATA.getAllUsers){
    wrap.innerHTML = `<div class="empty-state"><p>Disponible une fois Firebase activé.</p></div>`;
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
  // L'assistant est réservé à l'administrateur (jeton Firebase + email admin).
  if(!currentIsAdmin){ status.textContent = 'Assistant IA réservé à l’administrateur.'; return; }
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
    let data = {};
    try{ data = await res.json(); }catch(e){ /* réponse non JSON */ }
    if(!res.ok || !data.ok) throw new Error(data.error || 'Import impossible.');
    prefillCreateFromImport(data.event || {}, data.poster);
    status.textContent = '✅ Infos récupérées — vérifie et publie ci-dessous.';
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

function importFromImage(file){
  const status = document.getElementById('ia-status');
  if(!/^image\//.test(file.type)){ status.textContent = '⚠️ Choisis un fichier image.'; return; }
  if(file.size > 5 * 1024 * 1024){ status.textContent = '⚠️ Image trop lourde (max 5 Mo).'; return; }
  const reader = new FileReader();
  reader.onload = e=> runImport({ image: e.target.result }, '⏳ Lecture de l’affiche par l’IA (10–20 s)…');
  reader.readAsDataURL(file);
}

/* Pré-remplit le formulaire de publication avec les données extraites. */
function prefillCreateFromImport(ev, poster){
  const set = (id, v)=>{ const el = document.getElementById(id); if(el && v != null && v !== '') el.value = v; };
  set('c-nom', ev.title);
  set('c-type', ev.type);
  set('c-ville', ev.city);
  set('c-region', ev.region);
  set('c-adresse', ev.address);
  set('c-date-debut', ev.dateStart);
  set('c-date-fin', ev.dateEnd);
  set('c-sexe', ev.sexe);
  set('c-niveau', ev.niveau);
  set('c-desc', ev.description);
  set('c-orgname', ev.orgName);
  set('c-insta', ev.insta);
  set('c-site', ev.site);
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

/* Vrai si l'erreur Firebase est un refus de droits (règles Firestore). */
function isPermissionError(err){
  const code = String((err && (err.code || err.message)) || '').toLowerCase();
  return code.includes('permission') || code.includes('insufficient') || code.includes('unauthenticated');
}

/* Affiche le bandeau d'aide / diagnostic dans l'espace admin.
   `err` est l'erreur Firebase remontée par l'action refusée (facultatif). */
function showAdminRulesAlert(err){
  const box = document.getElementById('adminRulesAlert');
  if(!box) return;
  const perm = isPermissionError(err);
  const code = err ? String((err.code || '') || '') : '';
  const message = err ? String((err.message || '') || '') : '';

  // Identité serveur : email/uid réellement transmis à Firestore.
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
    grid.innerHTML = `<div class="empty-state"><p>Disponible une fois Firebase activé.</p></div>`;
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
      <label for="dispo-${ev.id}">Places&nbsp;:</label>
      <select id="dispo-${ev.id}" data-dispo="${ev.id}">
        ${opt('', '— Non précisé')}${opt('dispo','Places disponibles')}${opt('limite','Encore quelques places')}${opt('complet','Complet')}
      </select>
    </div>
    <div class="mine-card-actions">
      <button class="btn btn-ghost" data-open="${ev.id}">Voir</button>
      ${(currentIsAdmin && pending) ? `<button class="btn btn-approve" data-approve="${ev.id}">Valider</button>` : ''}
      <button class="btn btn-danger" data-del="${ev.id}">Supprimer</button>
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
  setFieldVal('e-region', ev.region);
  setFieldVal('e-address', (ev.infos && ev.infos.adresse) || ev.lieu || '');
  setFieldVal('e-date-start', ev.dateStart);
  setFieldVal('e-date-end', ev.dateEnd);
  setFieldVal('e-sexe', ev.sexe || 'Mixte');
  setFieldVal('e-age', ev.age || 'Séniors (18-35 ans)');
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
    const r = document.getElementById('e-region');
    if(r) r.value = pick.region || '';
  });

  const fileInput = document.getElementById('e-poster-file');
  fileInput.addEventListener('change', ()=>{
    const file = fileInput.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (e)=>{
      editPosterData = e.target.result;
      const prev = document.getElementById('e-poster-preview');
      if(prev){ prev.src = editPosterData; prev.classList.remove('hidden'); }
    };
    reader.readAsDataURL(file);
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
      age: gv('e-age'),
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
    if(editPosterData){ patch.poster = editPosterData; }

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
   source externe (Firebase) renvoie les données. Ne rebranche PAS les
   écouteurs des filtres (faits une seule fois via initHomeFilters). */
function renderAll(){
  buildMap();
  renderFeatured();
  applyMapFilters();
  renderResults();
}

/* Point d'entrée exposé pour la couche de données optionnelle (Firebase).
   Tant que Firebase n'est pas branché, l'app tourne sur les données
   locales de data.js. */
window.EBOK = {
  get events(){ return events; },
  setEvents(list){ if(Array.isArray(list)) events = list; renderAll(); },
  addEvent(ev){ events = [ev, ...events]; renderAll(); },
  // Appelé par firebase-init.js à chaque connexion / déconnexion.
  async onAuthChanged(user, profile, admin){
    currentUser = user || null;
    currentProfile = profile || null;
    currentIsAdmin = !!admin;
    updateAuthUI();
    await loadFavorites();
    renderAll();                 // rafraîchit les ♥ sur les cartes
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
  const saved = localStorage.getItem('ebok-theme') || 'dark';
  applyTheme(saved);
  const btn = document.getElementById('themeToggle');
  if(btn) btn.addEventListener('click', ()=>{
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem('ebok-theme', next);
  });
}

/* =========================================================
   BANDEAU « GALAXIE EBOK »
   ---------------------------------------------------------
   Défilement continu des logos des applications EBOK, en bas de
   l'accueil. Les images sont à déposer dans public/assets/galaxy/.
   ========================================================= */
const GALAXY_APPS = [
  { file: 'ebokbasketball.png', name: 'EBOK Basketball' },
  { file: 'ebokevent.png',      name: 'EBOK Event' },
  { file: 'ebokacademie.png',   name: 'EBOK Académie' },
  { file: 'ebokmercato.png',    name: 'EBOK Mercato' },
  { file: 'ebokscouting.png',   name: 'EBOK Scouting' },
  { file: 'ebokstats.png',      name: 'EBOK Stats' },
  { file: 'ebokplaybook.png',   name: 'EBOK Playbook' },
  { file: 'eboknotebook.png',   name: 'EBOK Notebook' },
  { file: 'ebokvideo.png',      name: 'EBOK Vidéo' },
  { file: 'ebokblog.png',       name: 'EBOK Blog' },
];
function renderGalaxyBand(){
  const track = document.getElementById('galaxyTrack');
  if(!track) return;
  const itemHtml = GALAXY_APPS.map(a=>
    `<div class="galaxy-item">
      <img src="assets/galaxy/${a.file}" alt="${esc(a.name)}" loading="lazy">
      <span>${esc(a.name)}</span>
    </div>`).join('');
  // Le contenu est dupliqué : l'animation glisse de 0 à -50% puis boucle
  // sans coupure visible (défilement continu, effet "infini").
  track.innerHTML = itemHtml + itemHtml;
}

// Écouteurs (une seule fois) + premier rendu sur les données locales.
renderGalaxyBand();
initTheme();           // applique le thème mémorisé avant le rendu
initGeoloc();          // restaure une éventuelle position avant le 1er dessin
loadFavorites();       // favoris locaux (mode démo) avant le 1er dessin
buildMap();
renderFeatured();
initHomeFilters();
initSearchPage();
initCreatePage();
initAuth();
initEditModal();
initProfileEdit();
initAiImport();

// Si une source de données externe est branchée (firebase-init.js), on
// remplace les données locales par celles de la base dès qu'elles arrivent.
if(window.EBOK_DATA && typeof window.EBOK_DATA.getAllEvents === 'function'){
  window.EBOK_DATA.getAllEvents()
    .then(list=>{ if(Array.isArray(list) && list.length){ events = list; renderAll(); } })
    .catch(err=> console.warn('[EBOK] Données Firebase indisponibles — affichage des données locales.', err));
}
