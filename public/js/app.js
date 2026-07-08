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


function buildMap(){
  const svg = document.getElementById('franceMap');
  let html = `<path class="france-shape" d="${FRANCE_PATH}"/>`;
  for(const [name,[x,y]] of Object.entries(CITY_LABELS)){
    html += `<circle cx="${x}" cy="${y}" r="2.4" fill="rgba(243,238,226,0.35)"></circle>
      <text x="${x+6}" y="${y+3}" font-family="Space Mono" font-size="9" fill="rgba(243,238,226,0.35)">${name}</text>`;
  }
  for(const ev of events){
    const c = TYPE_COLORS[ev.type];
    html += `<g class="pin" data-id="${ev.id}" data-type="${ev.type}">
      <circle class="core" cx="${ev.x}" cy="${ev.y}" r="9" fill="${c}"></circle>
      <circle cx="${ev.x}" cy="${ev.y}" r="3" fill="#fff"></circle>
    </g>`;
  }
  svg.innerHTML = html;

  svg.querySelectorAll('.pin').forEach(pin=>{
    pin.addEventListener('mouseenter',(e)=>showTooltip(pin));
    pin.addEventListener('mouseleave',hideTooltip);
    pin.addEventListener('click',()=>{ openEvent(pin.dataset.id); });
  });
}

function showTooltip(pin){
  const ev = events.find(e=>e.id===pin.dataset.id);
  const tt = document.getElementById('mapTooltip');
  const wrap = document.querySelector('.map-wrap');
  const svg = document.getElementById('franceMap');
  const svgRect = svg.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const scale = svgRect.width/560;
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
      applyMapFilters();
    }
  });

  // Rayon slider
  const radiusSlider = document.getElementById('radiusFilter');
  const radiusValue = document.getElementById('radiusValue');
  radiusSlider.addEventListener('input', (e)=>{
    homeRadius = parseInt(e.target.value, 10);
    if(homeRadius >= 200){
      radiusValue.textContent = 'Partout';
    }else{
      radiusValue.textContent = `${homeRadius} km`;
    }
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
  Object.entries(TYPE_COLORS).forEach(([type,color])=>{
    const id = 'type-'+type.replace(/\s/g,'');
    typeWrap.insertAdjacentHTML('beforeend', `
      <label class="check-item" for="${id}">
        <input type="checkbox" id="${id}" value="${type}" checked>
        <span class="dot" style="background:${color}"></span>${type}
      </label>`);
  });
  typeWrap.querySelectorAll('input').forEach(cb=>cb.addEventListener('change', applyMapFilters));
  applyMapFilters();
}

let homeView = 'map';
let homeStatus = 'upcoming';
let homeCity = '';
let homeRadius = 200;

// Variables du calendrier de période
let periodStart = '';
let periodEnd = '';

// Centroïde arbitraire de la France (pour le rayon)
const FRANCE_CENTER = {x: 280, y: 280};

function getEventDistance(ev){
  if(!ev.x || !ev.y) return 0;
  const dx = ev.x - FRANCE_CENTER.x;
  const dy = ev.y - FRANCE_CENTER.y;
  return Math.sqrt(dx*dx + dy*dy) * 1.5; // facteur pour approximer en km (simplifié)
}

function computeHomeFilteredEvents(){
  const checkedTypes = Array.from(document.querySelectorAll('#typeFilterHome input:checked')).map(i=>i.value);
  
  return events.filter(ev=>{
    if(!checkedTypes.includes(ev.type)) return false;
    if(homeStatus === 'upcoming' && isPast(ev)) return false;
    if(homeStatus === 'archived' && !isPast(ev)) return false;
    if(periodStart && ev.dateEnd < periodStart) return false;
    if(periodEnd && ev.dateStart > periodEnd) return false;
    if(homeCity && ev.city !== homeCity && ev.region !== homeCity) return false;
    const dist = getEventDistance(ev);
    if(dist > homeRadius) return false;
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

  document.getElementById('createForm').addEventListener('submit',(e)=>{
    e.preventDefault();
    const visibility = document.querySelector('input[name="visibility"]:checked')?.value || 'standard';
    const banner = document.getElementById('createSuccess');
    if(visibility === 'standard'){
      banner.textContent = "✅ Événement envoyé — il apparaîtra sur la carte après validation.";
    }else{
      banner.textContent = "✅ Événement envoyé — notre équipe te recontacte sous 48h pour activer ton option de visibilité.";
    }
    banner.classList.remove('hidden');
    banner.scrollIntoView({behavior:'smooth', block:'center'});
  });
}

/* =========================================================
   EVENT DETAIL PAGE
   ========================================================= */
function openEvent(id){
  const ev = events.find(e=>e.id===id);
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
  try{
    if(window.storage){
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
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.querySelectorAll('.navlink').forEach(n=>n.classList.toggle('active', n.dataset.nav===name));
  window.scrollTo({top:0, behavior:'instant'});
}
document.querySelectorAll('[data-nav]').forEach(el=>{
  el.addEventListener('click', ()=> showPage(el.dataset.nav));
});

/* =========================================================
   INIT
   ========================================================= */
buildMap();
renderFeatured();
initHomeFilters();
initSearchPage();
initCreatePage();
