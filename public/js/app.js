/* =========================================================
   EBOK Event — LOGIQUE APPLICATIVE
   Navigation, filtres, carte, calendrier, recherche, détail
   événement, carrousel. S'appuie sur les données de data.js.
   ========================================================= */
function isPast(ev){ return ev.dateEnd < TODAY; }

const sessionCounters = {};
let currentGallery = [];

function eventCardHtml(ev){
  return `
    <div class="event-card" data-id="${ev.id}">
      <div class="card-media">
        ${ev.poster ? `<img src="${ev.poster}" alt="Affiche ${ev.title}">` : `<div style="width:100%;height:100%;background:linear-gradient(135deg, ${TYPE_COLORS[ev.type]}33, var(--asphalt-3));display:flex;align-items:center;justify-content:center;font-family:var(--font-display);color:${TYPE_COLORS[ev.type]};font-size:15px;">${ev.type.toUpperCase()}</div>`}
        <span class="card-type-badge" style="background:${TYPE_COLORS[ev.type]}">${ev.type}</span>
        ${isPast(ev) ? `<span class="card-past-badge">Terminé</span>` : ``}
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
    `<circle class="city-dot" cx="${x}" cy="${y}" r="2.2"></circle>
     <text class="city-name" x="${x+6}" y="${y+3}">${name}</text>`
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

  // Interactions régions : relief au survol/focus, sélection au clic.
  // (métropole ET encarts outre-mer partagent la classe .region)
  svg.querySelectorAll('.region').forEach(reg=>{
    const lift = ()=>{ reg.parentNode.appendChild(reg); reg.classList.add('hovered'); }; // au premier plan dans sa couche
    const drop = ()=> reg.classList.remove('hovered');
    reg.addEventListener('mouseenter', lift);
    reg.addEventListener('mouseleave', drop);
    reg.addEventListener('focus', lift);
    reg.addEventListener('blur', drop);
    reg.addEventListener('click', ()=> selectRegion(reg.dataset.region));
    reg.addEventListener('keydown', e=>{
      if(e.key==='Enter' || e.key===' '){ e.preventDefault(); selectRegion(reg.dataset.region); }
    });
  });
  applySelectedRegionStyle();

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

/* Sélection d'une région au clic : filtre les événements de cette région
   (re-clic pour désélectionner). */
function selectRegion(name){
  selectedRegion = (selectedRegion === name) ? '' : name;
  homeCity = selectedRegion;
  const input = document.getElementById('citySearch');
  if(input) input.value = selectedRegion;
  applySelectedRegionStyle();
  applyMapFilters();
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

  // Rayon slider
  const radiusSlider = document.getElementById('radiusFilter');
  radiusSlider.addEventListener('input', (e)=>{
    homeRadius = parseInt(e.target.value, 10);
    updateRadiusLabel();
    updateGeoCircle();
    applyMapFilters();
  });

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
      applyMapFilters();
    });
  });
  applyMapFilters();
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
function initSearchPage(){
  const typeSel = document.getElementById('f-type');
  Object.keys(TYPE_COLORS).forEach(t=>{
    const opt = document.createElement('option'); opt.value=t; opt.textContent=t;
    typeSel.appendChild(opt);
  });
  document.getElementById('searchForm').addEventListener('submit',(e)=>{ e.preventDefault(); renderResults(); });
  document.getElementById('resetSearch').addEventListener('click', ()=>{
    document.getElementById('searchForm').reset();
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
    if(sexe !== 'all' && ev.sexe !== sexe && ev.sexe !== 'Mixte') return false;
    if(age !== 'all' && ev.age !== age) return false;
    if(niveau !== 'all' && ev.niveau !== niveau) return false;
    if(afficheOnly && !ev.poster) return false;
    return true;
  }).sort((a,b)=> a.dateStart.localeCompare(b.dateStart));

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

/* =========================================================
   CREATE EVENT PAGE
   ========================================================= */
function initCreatePage(){
  const dz = document.getElementById('dropzone');
  const input = document.getElementById('c-affiche');
  const preview = document.getElementById('dzPreview');
  const label = document.getElementById('dzLabel');

  input.addEventListener('change', ()=>{
    const file = input.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (e)=>{
      preview.src = e.target.result;
      preview.classList.remove('hidden');
      label.style.display = 'none';
    };
    reader.readAsDataURL(file);
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
  galleryInput.addEventListener('change', ()=>{
    Array.from(galleryInput.files).forEach(file=>{
      const reader = new FileReader();
      reader.onload = (e)=>{ galleryFiles.push(e.target.result); renderGalleryThumbs(); };
      reader.readAsDataURL(file);
    });
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
    const region    = val('c-region');
    const type      = val('c-type') || 'Divers';
    const {x, y}    = guessCoords(city, region);
    const posterSrc = (preview && !preview.classList.contains('hidden')) ? preview.src : null;
    const visibility = document.querySelector('input[name="visibility"]:checked')?.value || 'standard';

    // L'admin publie directement en ligne ; un diffuseur passe en validation.
    const status = currentIsAdmin ? 'approved' : (window.EBOK_AUTH ? 'pending' : 'approved');

    const newEvent = {
      id: 'evt-' + Date.now(),
      title: val('c-nom') || 'Événement sans nom',
      type,
      city, region,
      lieu: val('c-adresse') || city,
      x, y,
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
      featured: visibility !== 'standard',
      visibility,
      status,
      userId: currentUser ? currentUser.uid : null,
      org: {
        name: val('c-orgname') || (currentProfile && currentProfile.orgname) || 'Organisateur',
        insta: val('c-insta').replace(/^@/, ''),
        site: val('c-site'),
        tel: val('c-tel'),
        email: val('c-email') || (currentUser ? currentUser.email : '')
      }
    };

    // Persistance : si Firebase est branché, on enregistre en base.
    // Sinon l'événement reste en mémoire (visible jusqu'au rechargement).
    let persisted = false;
    if(window.EBOK_DATA && typeof window.EBOK_DATA.createEvent === 'function'){
      try{
        newEvent.id = await window.EBOK_DATA.createEvent(newEvent) || newEvent.id;
        persisted = true;
      }catch(err){
        console.warn('[EBOK] Enregistrement Firebase échoué.', err);
        showCreateBanner("⚠️ Enregistrement impossible. Vérifie ta connexion et réessaie.");
        return;
      }
    }

    // Un événement validé (admin, ou mode démo local) apparaît tout de suite.
    // Un événement en attente n'est pas montré publiquement avant validation.
    if(status === 'approved'){
      window.EBOK.addEvent(newEvent);
      showCreateBanner(visibility === 'standard'
        ? "✅ Événement publié — retrouve-le sur la carte et dans la recherche."
        : "✅ Événement publié en avant.");
    }else{
      showCreateBanner("✅ Événement envoyé — il apparaîtra sur la carte après validation. Retrouve-le dans « Mes événements ».");
    }

    // Réinitialise le formulaire pour une éventuelle nouvelle publication.
    form.reset();
    galleryFiles.length = 0;
    renderGalleryThumbs();
    if(preview){ preview.src = ''; preview.classList.add('hidden'); }
    if(label) label.style.display = '';
  });
}

function showCreateBanner(msg){
  const banner = document.getElementById('createSuccess');
  banner.textContent = msg;
  banner.classList.remove('hidden');
  banner.scrollIntoView({behavior:'smooth', block:'center'});
}

/* Devine des coordonnées SVG à partir de la ville/région saisie, en
   s'appuyant sur les villes connues. À remplacer par une vraie
   géolocalisation (lat/lon + géocodage) à la phase géolocalisation. */
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

/* =========================================================
   EVENT DETAIL PAGE
   ========================================================= */
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
    ? `<img src="${ev.poster}" alt="Affiche ${ev.title}">`
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
  const practicalRows = [
    infos.adresse ? {ic:"📍", k:"Adresse", v:infos.adresse} : null,
    infos.horaires ? {ic:"🕐", k:"Horaires", v:infos.horaires} : null,
    infos.buvette ? {ic:"🥤", k:"Buvette", v:infos.buvette} : null,
    infos.reservation ? {ic:"🎟", k:"Réservation", v:infos.reservation} : null,
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
    <div class="event-poster">${posterHtml}</div>
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

function renderFeatured(){
  const featured = events.filter(e=>e.featured);
  if(featured.length === 0) return;
  
  let currentSlide = 0;
  const track = document.getElementById('carouselTrack');
  const dotsContainer = document.getElementById('carouselDots');
  
  // Générer les slides
  track.innerHTML = featured.map(ev=>`
    <div class="carousel-item">
      <span class="featured-tag">★ À la une</span>
      <div class="featured-media">${ev.poster ? `<img src="${ev.poster}" alt="${ev.title}">` : `<div style="width:100%;height:100%;background:linear-gradient(160deg, ${TYPE_COLORS[ev.type]}55, var(--asphalt-3));"></div>`}</div>
      <div class="featured-body">
        <span class="featured-eyebrow">${ev.type} · ${ev.city}</span>
        <h3>${ev.title}</h3>
        <p class="featured-meta">${fmtDateRange(ev.dateStart, ev.dateEnd)} · ${ev.sexe} · ${ev.niveau}</p>
        <div class="featured-actions">
          <button class="btn btn-primary" onclick="openEvent('${ev.id}'); return false;">Voir l'événement</button>
        </div>
      </div>
    </div>`).join('');
  
  // Générer les dots
  dotsContainer.innerHTML = featured.map((_, i)=>`
    <button class="carousel-dot ${i===0 ? 'active' : ''}" data-slide="${i}" aria-label="Aller à l'événement ${i+1}"></button>`).join('');
  
  function goToSlide(n){
    currentSlide = (n + featured.length) % featured.length;
    track.style.transform = `translateX(-${currentSlide * 100}%)`;
    document.querySelectorAll('.carousel-dot').forEach((d,i)=> d.classList.toggle('active', i===currentSlide));
  }
  
  document.getElementById('carouselPrev').addEventListener('click', ()=> goToSlide(currentSlide - 1));
  document.getElementById('carouselNext').addEventListener('click', ()=> goToSlide(currentSlide + 1));
  document.querySelectorAll('.carousel-dot').forEach(dot=> dot.addEventListener('click', ()=> goToSlide(parseInt(dot.dataset.slide))));
}

/* =========================================================
   NAVIGATION
   ========================================================= */
function showPage(name){
  // "Mes événements" est réservé aux comptes connectés (si l'auth est active).
  if(name === 'mine' && !currentUser && window.EBOK_AUTH){ openAuth('login'); return; }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.querySelectorAll('.navlink').forEach(n=>n.classList.toggle('active', n.dataset.nav===name));
  // Publier exige un compte : on propose la connexion sans masquer le formulaire.
  if(name === 'create' && !currentUser && window.EBOK_AUTH){ openAuth('login'); }
  if(name === 'mine') renderMine();
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

function updateAuthUI(){
  const loggedOut = !currentUser;
  document.getElementById('btnLogin').classList.toggle('hidden', !loggedOut);
  document.getElementById('accountLogged').classList.toggle('hidden', loggedOut);
  document.getElementById('navMine').classList.toggle('hidden', loggedOut);
  if(currentUser){
    const name = (currentProfile && currentProfile.orgname) || currentUser.email;
    document.getElementById('accountName').innerHTML =
      `<b>${name}</b>${currentIsAdmin ? '<span class="account-badge-admin">Admin</span>' : ''}`;
  }
}

function initAuth(){
  const modal = document.getElementById('authModal');
  document.getElementById('btnLogin').addEventListener('click', ()=> openAuth('login'));
  document.getElementById('authClose').addEventListener('click', closeAuth);
  modal.addEventListener('click', e=>{ if(e.target === modal) closeAuth(); });
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
    const profile = {
      orgname: document.getElementById('su-orgname').value.trim(),
      insta: document.getElementById('su-insta').value.trim().replace(/^@/, ''),
      tel: document.getElementById('su-tel').value.trim()
    };
    try{
      await window.EBOK_AUTH.signUp(
        document.getElementById('su-email').value.trim(),
        document.getElementById('su-pass').value,
        profile
      );
      closeAuth();
    }catch(err){ showAuthError(authMessage(err)); }
  });

  document.getElementById('btnLogout').addEventListener('click', async ()=>{
    if(window.EBOK_AUTH) await window.EBOK_AUTH.signOutUser();
    showPage('home');
  });

  updateAuthUI();
}

/* ---- Dashboard "Mes événements" / Admin ---- */
async function renderMine(){
  const grid = document.getElementById('mineGrid');
  const eyebrow = document.getElementById('mineEyebrow');
  const title = document.getElementById('mineTitle');
  const sub = document.getElementById('mineSub');

  if(!currentUser){
    grid.innerHTML = `<div class="empty-state"><h4>Connecte-toi</h4><p>Crée un compte diffuseur pour publier et gérer tes événements.</p></div>`;
    return;
  }
  if(currentIsAdmin){
    eyebrow.textContent = 'Administration';
    title.textContent = 'Tous les événements';
    sub.textContent = "Valide, publie ou supprime n'importe quel événement.";
  }else{
    eyebrow.textContent = 'Espace diffuseur';
    title.textContent = 'Mes événements';
    sub.textContent = 'Gère les événements que tu as publiés.';
  }

  if(!window.EBOK_DATA){
    grid.innerHTML = `<div class="empty-state"><p>Firebase requis pour cette section.</p></div>`;
    return;
  }
  grid.innerHTML = `<div class="empty-state"><p>Chargement…</p></div>`;
  let list;
  try{
    list = currentIsAdmin
      ? await window.EBOK_DATA.getAllEventsForAdmin()
      : await window.EBOK_DATA.getEventsByUser(currentUser.uid);
  }catch(err){
    grid.innerHTML = `<div class="empty-state"><h4>Erreur</h4><p>Impossible de charger les événements.</p></div>`;
    return;
  }
  if(!list.length){
    grid.innerHTML = `<div class="empty-state"><h4>Aucun événement</h4><p>Publie ton premier événement via « Publier un événement ».</p></div>`;
    return;
  }
  list.sort((a,b)=> (b.createdAt || 0) - (a.createdAt || 0));
  grid.innerHTML = list.map(mineCardHtml).join('');
  grid.querySelectorAll('[data-open]').forEach(b=> b.addEventListener('click', ()=> openEvent(b.dataset.open)));
  grid.querySelectorAll('[data-del]').forEach(b=> b.addEventListener('click', ()=> handleDelete(b.dataset.del)));
  grid.querySelectorAll('[data-approve]').forEach(b=> b.addEventListener('click', ()=> handleApprove(b.dataset.approve)));
}

function mineCardHtml(ev){
  const pending = ev.status !== 'approved';
  return `<div class="mine-card-wrap">
    <span class="status-pill ${pending ? 'status-pending' : 'status-approved'}">${pending ? 'En attente' : 'En ligne'}</span>
    ${eventCardHtml(ev)}
    <div class="mine-card-actions">
      <button class="btn btn-ghost" data-open="${ev.id}">Voir</button>
      ${(currentIsAdmin && pending) ? `<button class="btn btn-approve" data-approve="${ev.id}">Valider</button>` : ''}
      <button class="btn btn-danger" data-del="${ev.id}">Supprimer</button>
    </div>
  </div>`;
}

async function handleDelete(id){
  if(!confirm('Supprimer cet événement ? Cette action est définitive.')) return;
  try{
    await window.EBOK_DATA.deleteEvent(id);
    events = events.filter(e=> e.id !== id);
    renderAll();
    renderMine();
  }catch(err){ alert("Suppression impossible (droits insuffisants ?)."); }
}

async function handleApprove(id){
  try{
    await window.EBOK_DATA.approveEvent(id);
    const list = await window.EBOK_DATA.getAllEvents();
    if(Array.isArray(list)){ events = list; renderAll(); }
    renderMine();
  }catch(err){ alert("Validation impossible."); }
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
  onAuthChanged(user, profile, admin){
    currentUser = user || null;
    currentProfile = profile || null;
    currentIsAdmin = !!admin;
    updateAuthUI();
    if(document.getElementById('page-mine').classList.contains('active')) renderMine();
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

// Écouteurs (une seule fois) + premier rendu sur les données locales.
initTheme();           // applique le thème mémorisé avant le rendu
initGeoloc();          // restaure une éventuelle position avant le 1er dessin
buildMap();
renderFeatured();
initHomeFilters();
initSearchPage();
initCreatePage();
initAuth();

// Si une source de données externe est branchée (firebase-init.js), on
// remplace les données locales par celles de la base dès qu'elles arrivent.
if(window.EBOK_DATA && typeof window.EBOK_DATA.getAllEvents === 'function'){
  window.EBOK_DATA.getAllEvents()
    .then(list=>{ if(Array.isArray(list) && list.length){ events = list; renderAll(); } })
    .catch(err=> console.warn('[EBOK] Données Firebase indisponibles — affichage des données locales.', err));
}
