/* =========================================================================
   EBOK — ADMIN : CARTE INSTAGRAM
   Génère, dans le navigateur, l'image d'une publication Instagram (JPEG
   1080 × 1350, portrait 4:5) qui met en avant un événement : logo EBOK,
   pastille du type (couleurs de la carte), affiche de l'organisateur
   créditée, titre, lieu, dates, tarif et « Toutes les infos sur ebok.fr ».
   Prépare aussi la légende à copier.

   Rien n'est envoyé ni enregistré : l'image est dessinée sur un <canvas> à
   partir des données publiques de la fiche. Le bouton n'est affiché qu'à
   l'admin (app.js → ouvrirCarteInsta) ; comme rien n'est écrit en base,
   aucun contrôle serveur n'est nécessaire.

   Le gabarit reprend la maquette validée : fond sombre, Oswald / Inter /
   JetBrains Mono (chargées à la première ouverture), bordeaux du logo.
   ========================================================================= */
(function(){
  'use strict';

  const W = 1080, H = 1350, M = 56;
  const C = {
    fond: '#101114', bordeaux: '#B32A3B', bordeauxTexte: '#D9606C',
    texte: '#f2f2f4', separateur: '#2a2b31', discret: '#a9acb5', cadre: '#0b0b0d'
  };
  const F = {
    titre: 'Oswald, "Arial Narrow", Impact, sans-serif',
    texte: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", ui-monospace, Menlo, monospace'
  };
  const MOIS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  const URL_POLICES = 'https://fonts.googleapis.com/css2?family=Inter:wght@500;600&family=JetBrains+Mono:wght@500;700&family=Oswald:wght@600;700&display=swap';
  const LOGO = '/assets/logo-ebok-source.png';

  /* Zones fixes du gabarit (px, image 1080 × 1350). */
  const Z = {
    teteY: 48, teteH: 76,
    afficheY: 148, afficheH: 760,
    creditY: 924, creditH: 28,
    ctaY: H - 48 - 80, ctaH: 80
  };

  /* ---------- Données ---------- */

  function couleurType(type){
    const t = (typeof TYPE_COLORS !== 'undefined' && TYPE_COLORS) || {};
    return t[type] || '#607D8B';
  }
  /* Texte blanc ou noir sur la pastille, selon le meilleur contraste. */
  function texteSur(hex){
    const n = parseInt(String(hex).replace('#',''), 16);
    if(Number.isNaN(n)) return '#fff';
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v=>{ v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
    const L = .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
    return (1.05 / (L + .05)) >= ((L + .05) / .0612) ? '#fff' : '#101114';
  }
  function jour(iso){
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? { a: +m[1], m: +m[2], j: +m[3] } : null;
  }
  function datesCourtes(debut, fin){
    const d = jour(debut), f = jour(fin) || d;
    if(!d) return f ? `${f.j} ${MOIS[f.m-1]} ${f.a}` : '';
    if(d.a === f.a && d.m === f.m && d.j === f.j) return `${d.j} ${MOIS[d.m-1]} ${d.a}`;
    if(d.a !== f.a) return `${d.j} ${MOIS[d.m-1]} ${d.a} → ${f.j} ${MOIS[f.m-1]} ${f.a}`;
    if(d.m !== f.m) return `${d.j} ${MOIS[d.m-1]} → ${f.j} ${MOIS[f.m-1]} ${f.a}`;
    return `${d.j} → ${f.j} ${MOIS[f.m-1]} ${f.a}`;
  }
  /* « https://www.instagram.com/hardwork.trip?igsh=… » ou « @x » → « hardwork.trip ». */
  function compteInsta(v){
    let s = String(v || '').trim();
    if(!s) return '';
    const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
    if(m) s = m[1];
    s = s.replace(/^@+/, '').replace(/[/?#].*$/, '');
    return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s : '';
  }
  /* Tarif de la fiche → version courte pour l'image (modifiable avant export). */
  function tarifCourt(v){
    const s = String(v || '').replace(/\s+/g, ' ').trim();
    if(!s || /non (mentionn|communiq|précis|indiqu)|^nc$|^n\/?a$|^-$/i.test(s)) return '';
    if(/gratuit/i.test(s) && !/\d/.test(s)) return 'Gratuit';
    if(/^\d+(?:[.,]\d+)?$/.test(s)) return `${s} €`;
    if(s.length <= 18) return s.replace(/(\d)\s*€/g, '$1 €');
    const prix = [...s.matchAll(/(\d+(?:[.,]\d+)?)\s*€/g)].map(x=> parseFloat(x[1].replace(',', '.')));
    if(prix.length){
      const min = Math.min(...prix);
      return `${prix.length > 1 ? 'Dès ' : ''}${String(min).replace('.', ',')} €`;
    }
    return s.slice(0, 17) + '…';
  }
  /* Majuscules, en gardant « 3x3 » lisible (pas « 3X3 »). */
  function majuscules(s){ return String(s || '').toUpperCase().replace(/(\d)X(\d)/g, '$1x$2'); }
  function slug(s){
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'evenement';
  }
  const TAGS_TYPE = {
    'Camp':'campbasket', 'Détections':'detectionbasket', 'Circuit 3x3':'3x3basketball',
    'Tournoi':'tournoibasket', 'Voyage':'voyagebasket', 'Clinic Coachs':'coachbasket',
    'Handibasket':'handibasket', 'Match Pro':'basketpro', 'All-Star Game':'allstargame', 'Show':'basketshow'
  };
  function legende(d){
    const ligneInfos = [d.lieu && `📍 ${d.lieu}`, d.dates && `📅 ${d.dates}`, d.tarif && `💶 ${d.tarif}`].filter(Boolean).join(' · ');
    const tags = ['basket', 'basketball', TAGS_TYPE[d.type], slug(d.lieu).replace(/-/g, '')].filter(Boolean);
    return [
      majuscules(d.titre),
      ligneInfos,
      '👉 Toutes les infos sur ebok.fr (lien en bio)',
      d.insta ? `Affiche : @${d.insta}` : (d.org ? `Organisé par ${d.org}` : ''),
      '',
      [...new Set(tags)].map(t=> '#' + t).join(' ')
    ].filter((l, i, a)=> l !== '' || (i > 0 && a[i-1] !== '')).join('\n');
  }

  /* ---------- Ressources ---------- */

  let polices = null;
  function chargerPolices(){
    if(polices) return polices;
    polices = new Promise(fini=>{
      const minuterie = setTimeout(fini, 6000);
      const ok = ()=>{
        if(!document.fonts || !document.fonts.load){ clearTimeout(minuterie); return fini(); }
        Promise.all([
          `700 70px ${F.titre}`, `600 30px ${F.titre}`, `500 28px ${F.texte}`, `600 34px ${F.texte}`,
          `700 20px ${F.mono}`, `500 26px ${F.mono}`
        ].map(f=> document.fonts.load(f, 'AÉÀé@€'))).catch(()=>{}).then(()=>{ clearTimeout(minuterie); fini(); });
      };
      if(document.querySelector('link[data-carte-insta]')) return ok();
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = URL_POLICES; l.dataset.carteInsta = '1';
      l.onload = ok; l.onerror = ()=>{ clearTimeout(minuterie); fini(); };
      document.head.appendChild(l);
    });
    return polices;
  }
  function chargerImage(src){
    return new Promise((ok, ko)=>{
      const img = new Image();
      // Affiches sur Vercel Blob : CORS ouvert, l'image reste exportable.
      if(/^https?:\/\//i.test(src) && !src.startsWith(location.origin)) img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = ()=> ok(img);
      img.onerror = ()=> ko(new Error('image'));
      img.src = src;
    });
  }
  function adresseImage(u){
    const s = String(u == null ? '' : u).trim();
    if(/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(s)) return s;
    if(/^https:\/\//i.test(s) || /^\//.test(s)) return s;
    return '';
  }

  /* ---------- Dessin ---------- */

  function chemin(ctx, x, y, w, h, r){
    ctx.beginPath();
    if(ctx.roundRect){ ctx.roundRect(x, y, w, h, r); return; }
    const [a, b, c, d] = Array.isArray(r) ? r : [r, r, r, r];
    ctx.moveTo(x + a, y); ctx.lineTo(x + w - b, y); ctx.quadraticCurveTo(x + w, y, x + w, y + b);
    ctx.lineTo(x + w, y + h - c); ctx.quadraticCurveTo(x + w, y + h, x + w - c, y + h);
    ctx.lineTo(x + d, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - d);
    ctx.lineTo(x, y + a); ctx.quadraticCurveTo(x, y, x + a, y); ctx.closePath();
  }
  function espacement(ctx, px){ if('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }

  /* Découpe en lignes (au mot) ; null si un mot seul dépasse. */
  function couper(ctx, texte, largeur){
    const mots = texte.split(/\s+/).filter(Boolean), lignes = [];
    let cur = '';
    for(const m of mots){
      if(ctx.measureText(m).width > largeur) return null;
      const essai = cur ? cur + ' ' + m : m;
      if(ctx.measureText(essai).width <= largeur) cur = essai;
      else { lignes.push(cur); cur = m; }
    }
    if(cur) lignes.push(cur);
    return lignes;
  }
  /* Deux lignes équilibrées, sans commencer la 2e par un tiret. */
  function equilibrer(ctx, texte, largeur){
    const mots = texte.split(/\s+/).filter(Boolean);
    let meilleur = null;
    for(let i = 1; i < mots.length; i++){
      const a = mots.slice(0, i).join(' '), b = mots.slice(i).join(' ');
      const wa = ctx.measureText(a).width, wb = ctx.measureText(b).width;
      if(wa > largeur || wb > largeur) continue;
      const score = Math.max(wa, wb) + (/^[–—-]/.test(b) ? 10000 : 0);
      if(!meilleur || score < meilleur.score) meilleur = { score, lignes: [a, b] };
    }
    return meilleur ? meilleur.lignes : null;
  }
  function limiterLignes(ctx, lignes, max, largeur){
    if(lignes.length <= max) return lignes;
    const garde = lignes.slice(0, max);
    let der = garde[max - 1] + ' ' + lignes.slice(max).join(' ');
    while(der.length > 1 && ctx.measureText(der + '…').width > largeur) der = der.slice(0, -1).trimEnd();
    garde[max - 1] = der + '…';
    return garde;
  }

  function logoInsta(ctx, x, y, t){
    const k = t / 24;
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    chemin(ctx, 3, 3, 18, 18, 5); ctx.stroke();
    ctx.beginPath(); ctx.arc(12, 12, 4.2, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(17.4, 6.6, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function dessiner(canvas, d, res){
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';
    espacement(ctx, 0);

    // Fond, halo bordeaux, lignes de terrain
    ctx.fillStyle = C.fond; ctx.fillRect(0, 0, W, H);
    const halo = ctx.createRadialGradient(1050, -10, 0, 1050, -10, 450);
    halo.addColorStop(0, 'rgba(179,42,59,.34)'); halo.addColorStop(1, 'rgba(179,42,59,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.03)'; ctx.lineWidth = 3;
    [610, 190].forEach(r=>{ ctx.beginPath(); ctx.arc(540, 1350, r, 0, Math.PI * 2); ctx.stroke(); });

    // En-tête : logo + pastille du type
    if(res.logo){
      const lh = Z.teteH, lw = lh * res.logo.naturalWidth / res.logo.naturalHeight;
      ctx.drawImage(res.logo, M, Z.teteY, lw, lh);
    }
    if(d.type){
      const fond = couleurType(d.type);
      ctx.font = `600 30px ${F.titre}`; espacement(ctx, 1.8);
      const lbl = d.type.toUpperCase(), tw = ctx.measureText(lbl).width;
      const pw = tw + 48, ph = 57, px = W - M - pw, py = Z.teteY + (Z.teteH - ph) / 2;
      ctx.fillStyle = fond; chemin(ctx, px, py, pw, ph, [24, 4, 24, 4]); ctx.fill();
      ctx.fillStyle = texteSur(fond); ctx.textBaseline = 'middle';
      ctx.fillText(lbl, px + 24, py + ph / 2 + 1);
      ctx.textBaseline = 'alphabetic'; espacement(ctx, 0);
    }

    // Cadre de l'affiche : affiche entière, bords comblés par l'affiche floutée
    const fx = M, fy = Z.afficheY, fw = W - 2 * M, fh = Z.afficheH;
    ctx.save();
    chemin(ctx, fx, fy, fw, fh, [32, 6, 32, 6]); ctx.clip();
    ctx.fillStyle = C.cadre; ctx.fillRect(fx, fy, fw, fh);
    if(res.affiche){
      const im = res.affiche, iw = im.naturalWidth, ih = im.naturalHeight;
      // Flou : réduction très forte puis agrandissement lissé (fonctionne partout, y compris Safari).
      const mini = document.createElement('canvas'); mini.width = 24; mini.height = 30;
      const mc = mini.getContext('2d'), kc = Math.max(24 / iw, 30 / ih);
      mc.drawImage(im, (24 - iw * kc) / 2, (30 - ih * kc) / 2, iw * kc, ih * kc);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(mini, fx - 60, fy - 60, fw + 120, fh + 120);
      ctx.fillStyle = 'rgba(11,11,13,.58)'; ctx.fillRect(fx, fy, fw, fh);
      const k = Math.min(fw / iw, fh / ih), dw = iw * k, dh = ih * k;
      ctx.drawImage(im, fx + (fw - dw) / 2, fy + (fh - dh) / 2, dw, dh);
    }else{
      const coul = couleurType(d.type);
      const g = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh);
      g.addColorStop(0, coul + '40'); g.addColorStop(1, '#28282D');
      ctx.fillStyle = g; ctx.fillRect(fx, fy, fw, fh);
      ctx.fillStyle = coul; ctx.font = `700 120px ${F.titre}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText((d.type || 'EBOK').toUpperCase(), fx + fw / 2, fy + fh / 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 2;
    chemin(ctx, fx, fy, fw, fh, [32, 6, 32, 6]); ctx.stroke();

    // Crédit sous l'affiche
    const credit = d.insta ? '@' + d.insta : d.org;
    if(res.affiche && credit){
      const cy = Z.creditY + Z.creditH / 2;
      logoInsta(ctx, M, Z.creditY, 28);
      ctx.textBaseline = 'middle';
      ctx.font = `500 18px ${F.mono}`; espacement(ctx, 2.6); ctx.fillStyle = C.discret;
      const kicker = 'AFFICHE OFFICIELLE';
      ctx.fillText(kicker, M + 40, cy + 1);
      const kx = M + 40 + ctx.measureText(kicker).width + 14;
      espacement(ctx, 0); ctx.font = `500 26px ${F.mono}`; ctx.fillStyle = '#fff';
      ctx.fillText(credit, kx, cy + 1);
      ctx.textBaseline = 'alphabetic';
    }

    // Lieu · Dates · Tarif : colonnes avec séparateurs
    const cols = [
      { lbl: 'LIEU', val: d.lieu || '—', fr: 1.1 },
      { lbl: 'DATES', val: d.dates || '—', fr: 1.3 },
      { lbl: 'TARIF', val: d.tarif || 'Voir le site', fr: .9 }
    ];
    const totFr = cols.reduce((s, c)=> s + c.fr, 0);
    ctx.font = `600 34px ${F.texte}`;
    let x = M, maxL = 1;
    cols.forEach((c, i)=>{
      c.x = x; c.w = fw * c.fr / totFr; x += c.w;
      c.tx = c.x + (i ? 22 : 0);
      const larg = c.w - (i ? 44 : 22);
      c.lignes = limiterLignes(ctx, couper(ctx, c.val, larg) || [c.val], 2, larg);
      maxL = Math.max(maxL, c.lignes.length);
    });
    const metaH = 20 + 12 + maxL * 39;

    // Titre : 2 lignes max, taille ajustée pour tenir dans la zone d'infos
    const zoneHaut = Z.creditY + Z.creditH, zoneBas = Z.ctaY, zoneDispo = zoneBas - zoneHaut - 8;
    const titre = majuscules(d.titre);
    let taille = 70, lignesT = null;
    for(; taille >= 40; taille -= 2){
      ctx.font = `700 ${taille}px ${F.titre}`;
      let l = couper(ctx, titre, fw);
      if(l && l.length === 2) l = equilibrer(ctx, titre, fw) || l;
      if(l && l.length <= 2 && l.length * taille * 1.05 + 22 + metaH <= zoneDispo){ lignesT = l; break; }
    }
    if(!lignesT){ taille = 40; ctx.font = `700 40px ${F.titre}`; lignesT = limiterLignes(ctx, couper(ctx, titre, fw) || [titre], 2, fw); }
    const titreH = lignesT.length * taille * 1.05;
    let y = zoneHaut + (zoneBas - zoneHaut - (titreH + 22 + metaH)) / 2;

    ctx.fillStyle = '#fff'; ctx.font = `700 ${taille}px ${F.titre}`; ctx.textBaseline = 'alphabetic';
    lignesT.forEach((l, i)=> ctx.fillText(l, M, y + taille * .9 + i * taille * 1.05));
    y += titreH + 22;

    cols.forEach((c, i)=>{
      if(i){ ctx.fillStyle = C.separateur; ctx.fillRect(c.x, y, 2, metaH); }
      ctx.font = `700 20px ${F.mono}`; espacement(ctx, 3.2); ctx.fillStyle = C.bordeauxTexte;
      ctx.fillText(c.lbl, c.tx, y + 17);
      espacement(ctx, 0); ctx.font = `600 34px ${F.texte}`; ctx.fillStyle = C.texte;
      c.lignes.forEach((l, j)=> ctx.fillText(l, c.tx, y + 32 + 30 + j * 39));
    });

    // Bandeau d'appel à l'action
    ctx.fillStyle = C.bordeaux; chemin(ctx, M, Z.ctaY, fw, Z.ctaH, [28, 6, 28, 6]); ctx.fill();
    const cy = Z.ctaY + Z.ctaH / 2;
    ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.font = `500 28px ${F.texte}`;
    const debut = 'Toutes les infos sur ';
    ctx.fillText(debut, M + 34, cy + 1);
    const dx = M + 34 + ctx.measureText(debut).width + 4;
    ctx.font = `700 36px ${F.titre}`; espacement(ctx, .7);
    ctx.fillText('ebok.fr', dx, cy - 1);
    espacement(ctx, 0);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const ax = W - M - 30 - 40;
    ctx.beginPath();
    ctx.moveTo(ax + 8, cy); ctx.lineTo(ax + 32, cy);
    ctx.moveTo(ax + 22, cy - 10); ctx.lineTo(ax + 32, cy); ctx.lineTo(ax + 22, cy + 10);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- Fenêtre ---------- */

  let fen = null, etat = null, minuterie = 0;

  function construire(){
    if(fen) return fen;
    fen = document.createElement('div');
    fen.className = 'edit-modal carte-insta';
    fen.id = 'carteInstaModal';
    fen.setAttribute('aria-hidden', 'true');
    fen.setAttribute('role', 'dialog');
    fen.setAttribute('aria-modal', 'true');
    fen.setAttribute('aria-labelledby', 'ciTitre');
    fen.innerHTML = `
      <div class="edit-box ci-box">
        <button type="button" class="edit-close" data-ci-fermer aria-label="Fermer">&times;</button>
        <h3 id="ciTitre">Carte Instagram</h3>
        <p class="edit-sub">Image 1080 × 1350 (portrait 4:5), prête à publier. Ces champs ne changent que l'image, pas la fiche.</p>
        <div class="ci-grille">
          <div class="ci-apercu">
            <canvas id="ciCanvas" width="${W}" height="${H}" aria-label="Aperçu de la carte Instagram"></canvas>
            <p class="ci-etat" id="ciEtat" role="status"></p>
          </div>
          <div class="ci-champs">
            <div class="field"><label for="ci-titre">Titre</label><input type="text" id="ci-titre" maxlength="90"></div>
            <div class="form-row">
              <div class="field"><label for="ci-lieu">Lieu</label><input type="text" id="ci-lieu" maxlength="40"></div>
              <div class="field"><label for="ci-tarif">Tarif</label><input type="text" id="ci-tarif" maxlength="24" placeholder="Voir le site"></div>
            </div>
            <div class="form-row">
              <div class="field"><label for="ci-dates">Dates</label><input type="text" id="ci-dates" maxlength="40"></div>
              <div class="field"><label for="ci-insta">Compte Instagram</label><input type="text" id="ci-insta" maxlength="40" placeholder="sans @"></div>
            </div>
            <div class="field">
              <label for="ci-legende">Légende de la publication</label>
              <textarea id="ci-legende" rows="8"></textarea>
              <button type="button" class="btn btn-ghost btn-xs ci-copier" id="ciCopier">Copier la légende</button>
            </div>
            <div class="ci-publier" id="ciBlocIg" hidden>
              <label class="ci-check"><input type="checkbox" id="ci-tag" checked> Identifier l'organisateur sur la photo</label>
              <label class="ci-check"><input type="checkbox" id="ci-collab" checked> L'inviter à collaborer (le post s'affichera aussi sur son profil)</label>
              <p class="ci-ig" id="ciIg"></p>
            </div>
            <div class="ci-dm" id="ciDm" hidden>
              <label for="ci-dm-texte">Message à envoyer à l'organisateur</label>
              <textarea id="ci-dm-texte" rows="10"></textarea>
              <div class="ci-dm-actions">
                <button type="button" class="btn btn-ghost btn-xs" id="ciDmCopier">Copier le message</button>
                <a class="btn btn-primary btn-xs" id="ciDmOuvrir" target="_blank" rel="noopener" hidden>Ouvrir la conversation</a>
              </div>
              <p class="ci-ig">Instagram n'autorise pas l'envoi automatique d'un premier message : copie-le, puis colle-le dans la conversation qui s'ouvre.</p>
            </div>
            <p class="ci-astuce" id="ciAstuce">Pense à identifier l'organisateur sur la photo et à le mentionner dans la légende.</p>
          </div>
        </div>
        <div class="edit-actions">
          <button type="button" class="btn btn-ghost" id="ciPartager" hidden>Partager…</button>
          <button type="button" class="btn btn-primary" id="ciTelecharger">Télécharger l'image</button>
          <button type="button" class="btn btn-primary" id="ciPublierBtn" hidden>Publier sur Instagram</button>
        </div>
      </div>`;
    document.body.appendChild(fen);

    fen.addEventListener('click', e=>{
      if(e.target === fen || e.target.closest('[data-ci-fermer]')) fermer();
    });
    document.addEventListener('keydown', e=>{
      if(e.key === 'Escape' && fen.classList.contains('open')) fermer();
    });
    ['ci-titre', 'ci-lieu', 'ci-tarif', 'ci-dates', 'ci-insta'].forEach(id=>{
      fen.querySelector('#' + id).addEventListener('input', ()=>{
        clearTimeout(minuterie);
        minuterie = setTimeout(()=> majDepuisChamps(true), 120);
      });
    });
    fen.querySelector('#ciCopier').addEventListener('click', copierLegende);
    fen.querySelector('#ciTelecharger').addEventListener('click', telecharger);
    fen.querySelector('#ciPartager').addEventListener('click', partager);
    fen.querySelector('#ciPublierBtn').addEventListener('click', publier);
    fen.querySelector('#ciDmCopier').addEventListener('click', copierMessage);
    fen.addEventListener('input', ()=> annulerConfirmation());
    return fen;
  }

  function champ(id){ return fen.querySelector('#' + id); }
  function dire(msg, lien){
    const p = champ('ciEtat');
    p.textContent = msg || '';
    if(lien && /^https:\/\/(www\.)?instagram\.com\//.test(lien)){
      const a = document.createElement('a');
      a.href = lien; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Voir la publication ↗';
      p.append(' ', a);
    }
  }

  function lireChamps(){
    return {
      titre: champ('ci-titre').value.trim() || etat.ev.title || '',
      lieu: champ('ci-lieu').value.trim(),
      tarif: champ('ci-tarif').value.trim(),
      dates: champ('ci-dates').value.trim(),
      insta: compteInsta(champ('ci-insta').value),
      type: etat.ev.type || '',
      org: (etat.ev.org && etat.ev.org.name) || ''
    };
  }
  function majDepuisChamps(legendeAussi){
    if(!etat || !etat.pret) return;
    const d = lireChamps();
    dessiner(champ('ciCanvas'), d, etat.res);
    if(legendeAussi) champ('ci-legende').value = legende(d);
  }

  async function ouvrir(ev){
    if(!ev) return;
    construire();
    etat = { ev, res: {}, pret: false };
    champ('ci-titre').value = ev.title || '';
    champ('ci-lieu').value = ev.city || '';
    champ('ci-tarif').value = tarifCourt(ev.tarif);
    champ('ci-dates').value = datesCourtes(ev.dateStart, ev.dateEnd);
    champ('ci-insta').value = compteInsta(ev.org && ev.org.insta);
    champ('ci-legende').value = '';
    const partage = champ('ciPartager');
    partage.hidden = !(navigator.canShare && window.File);
    fen.classList.add('open');
    fen.setAttribute('aria-hidden', 'false');
    champ('ci-titre').focus({ preventScroll: true });
    dire('Préparation de l\'image…');
    champ('ciTelecharger').disabled = true;
    preparerInstagram(ev);

    const moi = etat;
    const src = adresseImage(ev.poster);
    const [logo, affiche] = await Promise.all([
      chargerImage(LOGO).catch(()=> null),
      src ? chargerImage(src).catch(()=> null) : Promise.resolve(null),
      chargerPolices()
    ]);
    if(moi !== etat) return;   // une autre carte a été ouverte entre-temps
    etat.res = { logo, affiche };
    etat.pret = true;
    majDepuisChamps(true);
    champ('ciTelecharger').disabled = false;
    if(!src) dire('Pas d\'affiche sur la fiche : la carte affiche le type à la place.');
    else if(!affiche) dire('L\'affiche n\'a pas pu être chargée (hébergée sur un site qui bloque la copie ?). Remplace-la via « Modifier » pour l\'avoir sur la carte.');
    else dire('');
  }

  /* ---------- Publication directe (api/instagram.js) ---------- */

  async function preparerInstagram(ev){
    const bloc = champ('ciBlocIg'), info = champ('ciIg'), bouton = champ('ciPublierBtn'), dl = champ('ciTelecharger');
    bloc.hidden = true; bouton.hidden = true; bouton.disabled = false;
    champ('ciDm').hidden = true;
    bouton.textContent = 'Publier sur Instagram'; bouton.dataset.etape = '';
    dl.classList.replace('btn-ghost', 'btn-primary');
    info.textContent = '';
    const data = window.EBOK_DATA;
    if(!data || !data.getInstagram) return;
    const moi = etat;
    let st;
    try{ st = await data.getInstagram(ev.id); }catch(e){ return; }
    if(moi !== etat) return;
    bloc.hidden = false;
    const lignes = [];
    if(!st.configure){
      lignes.push("Publication directe pas encore branchée : ajoute IG_ACCESS_TOKEN dans Vercel (voir README).");
    }else if(!st.valide){
      lignes.push(st.message || "Connexion Instagram à vérifier.");
    }else{
      bouton.hidden = false;
      dl.classList.replace('btn-primary', 'btn-ghost');
      let l = `Publication sur @${st.compte || 'compte EBOK'}`;
      if(st.quota && st.quota.utilise != null) l += ` · ${st.quota.utilise}${st.quota.max ? '/' + st.quota.max : ''} publication(s) via le site sur 24 h`;
      lignes.push(l);
    }
    if(st.posts && st.posts.length){
      const d = new Date(st.posts[0].published_at);
      lignes.push(`⚠️ Déjà publié le ${d.toLocaleDateString('fr-FR')}${st.posts.length > 1 ? ` (${st.posts.length} fois)` : ''}.`);
    }
    info.textContent = lignes.join(' ');
    champ('ci-tag').disabled = !st.valide;
    champ('ci-collab').disabled = !st.valide;
    // Déjà publié : le message à l'organisateur reste disponible.
    if(st.posts && st.posts.length && st.posts[0].permalink) afficherMessage(st.posts[0].permalink, false);
  }

  /* Message privé à l'organisateur, prêt à copier (pas d'envoi automatique :
     Instagram ne permet pas d'écrire en premier à un compte via l'API). */
  function texteMessage(permalink, collab){
    const ev = etat.ev, d = lireChamps();
    const nom = (ev.org && ev.org.name) || (d.insta ? '@' + d.insta : '');
    const lignes = [
      `Salut${nom ? ' ' + nom : ''} 👋`,
      '',
      `On vient de mettre en avant ton événement « ${d.titre} » sur notre Instagram et sur ebok.fr, l'agenda du basket en France 🏀`,
      '',
      permalink ? `📸 La publication : ${permalink}` : '',
      `📍 La fiche : https://ebok.fr/evenement/${encodeURIComponent(ev.id)}`,
      '',
      "Ta fiche est gratuite. Pour la modifier ou la supprimer, crée ton compte sur ebok.fr et réponds-nous ici avec l'adresse e-mail utilisée : on te la rattache.",
    ];
    if(collab) lignes.push('', "On t'a aussi envoyé une invitation à collaborer sur la publication : en l'acceptant, elle apparaît sur ton profil et touche tes abonnés en plus des nôtres 💪");
    lignes.push('', 'Belle réussite pour ton événement !', "L'équipe EBOK");
    return lignes.filter((l, i, a)=> !(l === '' && a[i-1] === '')).join('\n');
  }
  function afficherMessage(permalink, collab){
    if(!etat) return;
    const d = lireChamps();
    champ('ci-dm-texte').value = texteMessage(permalink, collab);
    const lien = champ('ciDmOuvrir');
    if(d.insta){
      lien.href = 'https://ig.me/m/' + encodeURIComponent(d.insta);
      lien.textContent = `Ouvrir la conversation avec @${d.insta}`;
      lien.hidden = false;
    }else{
      lien.hidden = true;
    }
    champ('ciDm').hidden = false;
  }
  async function copierMessage(){
    const zone = champ('ci-dm-texte');
    try{ await navigator.clipboard.writeText(zone.value); dire('Message copié : colle-le dans la conversation Instagram.'); }
    catch(e){ zone.focus(); zone.select(); dire('Sélectionné : fais Ctrl+C (ou Copier) pour le copier.'); }
  }

  let minuterieConfirm = 0;
  function annulerConfirmation(){
    const b = fen && champ('ciPublierBtn');
    if(!b || b.dataset.etape !== 'confirmer') return;
    b.dataset.etape = ''; b.textContent = 'Publier sur Instagram';
    clearTimeout(minuterieConfirm);
  }

  async function publier(){
    if(!etat || !etat.pret) return;
    const b = champ('ciPublierBtn');
    // Première pression : on demande confirmation (publication publique, définitive).
    if(b.dataset.etape !== 'confirmer'){
      b.dataset.etape = 'confirmer';
      b.textContent = 'Confirmer : publier maintenant';
      dire("La publication sera visible tout de suite sur Instagram. Appuie encore pour confirmer.");
      clearTimeout(minuterieConfirm);
      minuterieConfirm = setTimeout(annulerConfirmation, 8000);
      return;
    }
    clearTimeout(minuterieConfirm);
    b.dataset.etape = 'envoi'; b.disabled = true; b.textContent = 'Publication…';
    const moi = etat;
    try{
      dire("Envoi de l'image…");
      const blob = await enJpeg();
      const url = await window.EBOK_DATA.uploadCarteInsta(blob, nomFichier());
      dire('Publication sur Instagram… (quelques secondes)');
      const d = lireChamps();
      const r = await window.EBOK_DATA.publierInstagram({
        eventId: moi.ev.id, imageUrl: url, caption: champ('ci-legende').value,
        compte: d.insta,
        tag: !!(d.insta && champ('ci-tag').checked),
        collab: !!(d.insta && champ('ci-collab').checked)
      });
      if(moi !== etat) return;
      b.textContent = 'Publié ✓';
      const notes = [];
      if(r.tagIgnore) notes.push("identification refusée");
      if(r.collabIgnore) notes.push("invitation à collaborer refusée");
      dire(notes.length ? `Publié ! (${notes.join(', ')} par Instagram : compte introuvable ou privé)` : 'Publié sur Instagram !', r.permalink);
      afficherMessage(r.permalink, !!(d.insta && champ('ci-collab').checked && !r.collabIgnore));
    }catch(e){
      if(moi !== etat) return;
      b.disabled = false; b.dataset.etape = ''; b.textContent = 'Publier sur Instagram';
      dire(e && e.message && !/^http_|^upload_/.test(e.message) ? e.message : "La publication a échoué. Réessaie, ou télécharge l'image pour la publier à la main.");
    }
  }

  function fermer(){
    if(!fen) return;
    fen.classList.remove('open');
    fen.setAttribute('aria-hidden', 'true');
    etat = null;
  }

  function enJpeg(){
    return new Promise((ok, ko)=>{
      try{ champ('ciCanvas').toBlob(b=> b ? ok(b) : ko(new Error('vide')), 'image/jpeg', 0.92); }
      catch(e){ ko(e); }
    });
  }
  function nomFichier(){ return `ebok-${slug(lireChamps().titre)}.jpg`; }

  async function telecharger(){
    if(!etat || !etat.pret) return;
    try{
      const blob = await enJpeg();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nomFichier();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=> URL.revokeObjectURL(url), 4000);
      dire('Image téléchargée : ' + nomFichier());
    }catch(e){
      dire('Export impossible : l\'affiche vient d\'un site qui interdit sa copie. Remplace-la via « Modifier », puis réessaie.');
    }
  }
  async function partager(){
    if(!etat || !etat.pret) return;
    try{
      const fichier = new File([await enJpeg()], nomFichier(), { type: 'image/jpeg' });
      if(!navigator.canShare({ files: [fichier] })){ return telecharger(); }
      await navigator.share({ files: [fichier] });
    }catch(e){
      if(e && e.name === 'AbortError') return;
      telecharger();
    }
  }
  async function copierLegende(){
    const zone = champ('ci-legende');
    try{
      await navigator.clipboard.writeText(zone.value);
      dire('Légende copiée.');
    }catch(e){
      zone.focus(); zone.select();
      dire('Sélectionnée : fais Ctrl+C (ou Copier) pour la copier.');
    }
  }

  window.EbokCarteInsta = { ouvrir, fermer, _tarifCourt: tarifCourt, _compteInsta: compteInsta, _dates: datesCourtes };
})();
