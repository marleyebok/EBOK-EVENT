/* =========================================================
   EBOK — INTRO (plan-séquence d'ouverture)
   ---------------------------------------------------------
   Un seul plan, sans coupe, dessiné au trait bordeaux sur fond beige :
     1. un playground de Montpellier ; le n°8 dribble, s'arrête et prend un
        tir en reculant (fadeaway) par-dessus son défenseur ;
     2. la caméra quitte le sol et suit le ballon jusqu'au panier ;
     3. elle bascule à la verticale et s'élève comme un drone : le terrain
        devient un point, le point devient Montpellier sur la carte de France ;
     4. une onde part du panier, révèle les régions et « réveille » les autres
        villes, dont les points vibrent comme de petites secousses.
   On arrive sur la carte : un clic (ou « Entrer ») ouvre le site ; un clic sur
   une région ouvre directement la recherche de cette région, sur sa carte.

   Tout est calculé : pas de vidéo, pas d'image. La scène est en 3D (mètres,
   terrain aux cotes FIBA), projetée dans un <canvas> par une caméra virtuelle.
   Repère : x = longueur du terrain (le panier visé est en +x), y = largeur,
   z = hauteur.

   Affichage décidé par js/intro-boot.js (classe `intro-on` sur <html>).
   Pour tout couper : retirer les balises intro-boot.js / intro.js / intro.css
   d'index.html.

   Réglage image par image : /?intro=1&t=3.2 fige l'intro à 3,2 s.
   ========================================================= */
(function(){
'use strict';
const html = document.documentElement;
const boite = document.getElementById('intro');
if(!boite || !html.classList.contains('intro-on')) return;
if(typeof FRANCE_REGIONS === 'undefined'){ html.classList.remove('intro-on'); return; }

try{ lancer(); }
catch(e){ html.classList.remove('intro-on'); if(window.console) console.error('Intro EBOK :', e); }

function lancer(){

/* ---------- Couleurs (thème clair du site) ---------- */
const BEIGE = '#F4F0E7';
const BORDEAUX = '#9B1C2C';
const trait = a => `rgba(155,28,44,${a})`;

/* ---------- Petits outils ---------- */
const add = (a,b)=> [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const sub = (a,b)=> [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const mul = (a,k)=> [a[0]*k, a[1]*k, a[2]*k];
const dot = (a,b)=> a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b)=> [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const len = a=> Math.hypot(a[0], a[1], a[2]);
const mix = (a,b,t)=> a + (b-a)*t;
const mix3 = (a,b,t)=> [mix(a[0],b[0],t), mix(a[1],b[1],t), mix(a[2],b[2],t)];
const borne = (x,a,b)=> x < a ? a : x > b ? b : x;
const rampe = (x,a,b)=> borne((x-a)/(b-a), 0, 1);
const doux = u=> u*u*(3-2*u);                       // départ et arrivée en douceur
const pente = (x,a,b)=> doux(rampe(x,a,b));

/* Piste d'animation : valeur lissée passant par des clés [temps, valeur]. */
function piste(cles){
  const n = cles.length;
  return function(t){
    if(t <= cles[0][0]) return cles[0][1];
    if(t >= cles[n-1][0]) return cles[n-1][1];
    let i = 0; while(cles[i+1][0] < t) i++;
    const t0 = cles[i][0], t1 = cles[i+1][0], h = t1-t0, u = (t-t0)/h;
    const a = cles[i][1], b = cles[i+1][1];
    const p = cles[i > 0 ? i-1 : i], q = cles[i+2 < n ? i+2 : i+1];
    const u2 = u*u, u3 = u2*u;
    const h00 = 2*u3-3*u2+1, h10 = u3-2*u2+u, h01 = -2*u3+3*u2, h11 = u3-u2;
    const un = (a,b,pa,qb)=>{
      const m0 = i > 0 ? (b-pa)/(t1-p[0]) : (b-a)/h;
      const m1 = i+2 < n ? (qb-a)/(q[0]-t0) : (b-a)/h;
      return h00*a + h10*h*m0 + h01*b + h11*h*m1;
    };
    if(typeof a === 'number') return un(a, b, p[1], q[1]);
    return a.map((_,k)=> un(a[k], b[k], p[1][k], q[1][k]));
  };
}

/* ---------- Dimensions (mètres, règlement FIBA) ---------- */
const DEMI_L = 14, DEMI_l = 7.5;                    // terrain 28 × 15
const PANIER_X = DEMI_L - 1.575;                    // centre du cercle
const PLANCHE_X = DEMI_L - 1.2;
const CERCLE_Z = 3.05, CERCLE_R = 0.225;
const BALLON_R = 0.12;

/* ---------- Le terrain : lignes au sol ---------- */
function arc(cx, cy, r, a0, a1, n){
  const pts = [];
  for(let i = 0; i <= n; i++){ const a = mix(a0, a1, i/n); pts.push([cx + r*Math.cos(a), cy + r*Math.sin(a), 0]); }
  return pts;
}
const lignesSol = [];
(function(){
  const L = pts=> lignesSol.push(pts);
  L([[-DEMI_L,-DEMI_l,0],[DEMI_L,-DEMI_l,0],[DEMI_L,DEMI_l,0],[-DEMI_L,DEMI_l,0],[-DEMI_L,-DEMI_l,0]]);
  L([[0,-DEMI_l,0],[0,DEMI_l,0]]);
  L(arc(0, 0, 1.8, 0, Math.PI*2, 48));
  for(const e of [1,-1]){
    const bx = e*PANIER_X;
    // Raquette (4,90 × 5,80) et cercle des lancers francs.
    L([[e*DEMI_L,-2.45,0],[e*8.2,-2.45,0],[e*8.2,2.45,0],[e*DEMI_L,2.45,0]]);
    L(arc(e*8.2, 0, 1.8, 0, Math.PI*2, 40));
    // Ligne à trois points : 6,75 m, à 0,90 m des touches dans les coins.
    const a = Math.asin(6.6/6.75);
    const courbe = arc(bx, 0, 6.75, e > 0 ? Math.PI - a : -a, e > 0 ? Math.PI + a : a, 56);
    L([[e*DEMI_L, e > 0 ? 6.6 : -6.6, 0]].concat(courbe, [[e*DEMI_L, e > 0 ? -6.6 : 6.6, 0]]));
    // Demi-cercle de non-charge (1,25 m).
    L(arc(bx, 0, 1.25, e > 0 ? Math.PI/2 : -Math.PI/2, e > 0 ? Math.PI*1.5 : Math.PI/2, 20));
  }
})();
// Longueurs cumulées : le terrain se trace à la craie au début.
const longueurs = lignesSol.map(pts=>{
  const c = [0];
  for(let i = 1; i < pts.length; i++) c.push(c[i-1] + len(sub(pts[i], pts[i-1])));
  return c;
});
function portion(i, f){
  const pts = lignesSol[i];
  if(f >= 1) return pts;
  const c = longueurs[i], cible = c[c.length-1]*f, out = [pts[0]];
  for(let k = 1; k < pts.length; k++){
    if(c[k] <= cible) out.push(pts[k]);
    else{ out.push(mix3(pts[k-1], pts[k], (cible - c[k-1])/(c[k] - c[k-1]))); break; }
  }
  return out;
}

/* Grillage du playground : une lisse haute et des poteaux. */
const grillage = [];
(function(){
  const X = 17.5, Y = 10.5, H = 3.2;
  const coins = [[-X,-Y],[X,-Y],[X,Y],[-X,Y]];
  grillage.push(coins.concat([coins[0]]).map(c=> [c[0], c[1], 0]));
  grillage.push(coins.concat([coins[0]]).map(c=> [c[0], c[1], H]));
  for(let k = 0; k < 4; k++){
    const a = coins[k], b = coins[(k+1)%4], n = Math.round(Math.hypot(b[0]-a[0], b[1]-a[1])/3.5);
    for(let i = 0; i < n; i++){
      const x = mix(a[0], b[0], i/n), y = mix(a[1], b[1], i/n);
      grillage.push([[x,y,0],[x,y,H]]);
    }
  }
})();

/* Panier : planche, potence, cercle. Le filet est animé à part. */
function lignesPanier(e){
  const px = e*PLANCHE_X, L = [];
  L.push([[px,-0.9,2.9],[px,0.9,2.9],[px,0.9,3.95],[px,-0.9,3.95],[px,-0.9,2.9]]);
  L.push([[px,-0.295,3.05],[px,0.295,3.05],[px,0.295,3.5],[px,-0.295,3.5],[px,-0.295,3.05]]);
  L.push([[e*15.1,0,0],[e*15.1,0,2.55],[e*14.5,0,3.3],[px,0,3.35]]);
  L.push([[px,0,CERCLE_Z],[e*(PANIER_X + CERCLE_R),0,CERCLE_Z]]);
  const cercle = [];
  for(let i = 0; i <= 28; i++){ const a = i/28*Math.PI*2; cercle.push([e*PANIER_X + CERCLE_R*Math.cos(a), CERCLE_R*Math.sin(a), CERCLE_Z]); }
  L.push(cercle);
  return L;
}
const panierPres = lignesPanier(1), panierLoin = lignesPanier(-1);

/* ---------- Le temps : l'action ralentit au moment du tir ---------- */
const TAU_0 = 0.45;                                 // l'action commence ballon en main, juste avant le tir
const TAU_TIR = 1.72;                               // le ballon quitte la main
const VOL = 1.15;                                   // durée (réelle) du vol du ballon
const TAU_PANIER = TAU_TIR + VOL;
const vitesse = tau=> tau < 1.3 ? 1
  : tau < TAU_PANIER ? mix(1, 0.55, pente(tau, 1.3, 1.5))
  : mix(0.55, 1, pente(tau, TAU_PANIER, TAU_PANIER + 0.25));
const PAS_T = 1/120, tableTau = [];
(function(){
  let tau = TAU_0;
  for(let i = 0; i < 120*24; i++){ tableTau.push(tau); tau += vitesse(tau)*PAS_T; }
})();
function tauDe(t){
  const x = borne(t/PAS_T, 0, tableTau.length-1.001), i = Math.floor(x);
  return mix(tableTau[i], tableTau[i+1], x-i);
}
function tDe(tau){ let i = 0; while(i < tableTau.length-1 && tableTau[i] < tau) i++; return i*PAS_T; }

const T_ARRET = tDe(1.3), T_TIR = tDe(TAU_TIR), T_PANIER = tDe(TAU_PANIER);
const T_ZENITH = T_PANIER + 0.5;                    // la caméra est à la verticale
const MONTEE = 3.5;                                 // durée de l'ascension
const T_FIN = T_ZENITH + MONTEE;

/* ---------- Le ballon ---------- */
const DEPART_TIR = [6.98, -0.04, 2.76];
const V_TIR = [(PANIER_X - DEPART_TIR[0])/VOL, (0 - DEPART_TIR[1])/VOL, (CERCLE_Z - DEPART_TIR[2] + 4.905*VOL*VOL)/VOL];
// En main : positions clés [temps, [x,y,z]] — ballon devant le ventre, une feinte,
// puis il monte au-dessus de la tête.
const BALLON_MAIN = [
  [ 0.45,[7.52,0.02,1.00]],
  [ 0.82,[7.54,0.02,1.22],'io'],
  [ 1.10,[7.50,0.00,1.02],'io'],
  [ 1.28,[7.46,-0.04,1.10],'io'],
  [ 1.46,[7.30,-0.08,1.78],'io'],
  [ 1.62,[7.06,-0.06,2.44],'io'],
  [TAU_TIR, DEPART_TIR]
];
// Après le panier : traversée du filet, chute, rebonds — simulés une fois.
const PAS_B = 1/240, apresPanier = [], rebondsTau = [];
(function(){
  let p = [PANIER_X, 0, CERCLE_Z], v = [V_TIR[0], 0, V_TIR[2] - 9.81*VOL];
  for(let i = 0; i < 240*8; i++){
    apresPanier.push(p);
    const dansFilet = p[2] > 2.5 && p[2] < CERCLE_Z + 0.02;
    v = [v[0]*Math.exp(-(dansFilet ? 16 : 0.25)*PAS_B), 0, (v[2] - 9.81*PAS_B)*(dansFilet ? Math.exp(-5*PAS_B) : 1)];
    p = [p[0] + v[0]*PAS_B, 0, p[2] + v[2]*PAS_B];
    if(p[2] < BALLON_R && v[2] < 0){ if(v[2] < -1) rebondsTau.push(TAU_PANIER + i*PAS_B); p[2] = BALLON_R; v[2] = -v[2]*0.62; v[0] *= 0.8; if(v[2] < 0.5) v[2] = 0; }
  }
})();
function ballon(tau){
  if(tau >= TAU_PANIER){
    const x = borne((tau - TAU_PANIER)/PAS_B, 0, apresPanier.length-1.001), i = Math.floor(x);
    return mix3(apresPanier[i], apresPanier[i+1], x-i);
  }
  if(tau >= TAU_TIR){
    const d = tau - TAU_TIR;
    return [DEPART_TIR[0] + V_TIR[0]*d, DEPART_TIR[1] + V_TIR[1]*d, DEPART_TIR[2] + V_TIR[2]*d - 4.905*d*d];
  }
  if(tau <= BALLON_MAIN[0][0]) return BALLON_MAIN[0][1];
  let i = 0; while(BALLON_MAIN[i+1][0] < tau) i++;
  let u = (tau - BALLON_MAIN[i][0])/(BALLON_MAIN[i+1][0] - BALLON_MAIN[i][0]);
  const allure = BALLON_MAIN[i+1][2];
  if(allure === 'in') u = u*u; else if(allure === 'out') u = 1-(1-u)*(1-u); else if(allure === 'io') u = doux(u);
  const a = BALLON_MAIN[i][1], b = BALLON_MAIN[i+1][1];
  // Le déplacement au sol reste régulier, seule la hauteur suit l'allure.
  const ul = (tau - BALLON_MAIN[i][0])/(BALLON_MAIN[i+1][0] - BALLON_MAIN[i][0]);
  const plat = allure === 'io' ? u : ul;
  return [mix(a[0],b[0],plat), mix(a[1],b[1],plat), mix(a[2],b[2],u)];
}

/* ---------- Les joueurs : un squelette, posé par clés ---------- */
const CUISSE = 0.47, TIBIA = 0.46, BRAS = 0.31, AVANT_BRAS = 0.28, CHEVILLE = 0.085;

/* Articulation intermédiaire (genou, coude) entre a et c. */
function plier(a, c, l1, l2, pole){
  let d = sub(c, a), L = len(d);
  const max = l1 + l2 - 0.002;
  if(L > max){ d = mul(d, max/L); L = max; c = add(a, d); }
  const dir = mul(d, 1/L);
  const x = (l1*l1 - l2*l2 + L*L)/(2*L), h = Math.sqrt(Math.max(l1*l1 - x*x, 0));
  let n = sub(pole, mul(dir, dot(pole, dir)));
  const nl = len(n);
  n = nl > 1e-6 ? mul(n, 1/nl) : [0,0,1];
  return [add(add(a, mul(dir, x)), mul(n, h)), c];
}

/* Un pas : le pied part de sa position, décolle, se repose plus loin. */
function pas(tau, x0, liste){
  let x = x0;
  for(const [a, b, x1, h] of liste){
    if(tau >= b){ x = x1; continue; }
    if(tau > a){ const u = (tau-a)/(b-a); return [mix(x, x1, doux(u)), h*Math.sin(Math.PI*u)]; }
    break;
  }
  return [x, 0];
}
const saut = (tau, t0, t1, h)=>{ const u = rampe(tau, t0, t1); return 4*h*u*(1-u); };

/* Milieu des épaules, pour placer les mains par rapport au buste. */
function epaules(P, penche, sens){ return [P[0] + sens*Math.sin(penche)*0.49, P[1] + Math.cos(penche)*0.49]; }

/* --- L'attaquant, n°8 : ballon en main, une feinte, tir en reculant --- */
const A_X = piste([[0.45,7.22],[1.28,7.2],[1.42,7.2],[2.12,6.46],[2.5,6.4],[5,6.4]]);
const A_Z = piste([[0.45,0.9],[0.82,0.93],[1.08,0.88],[1.28,0.76],[1.42,1.0],[2.12,0.98],[2.32,0.82],[2.8,0.96],[5,0.97]]);
const A_PENCHE = piste([[0.45,0.3],[0.82,0.22],[1.1,0.3],[1.28,0.2],[1.45,-0.08],[1.75,-0.42],[2.12,-0.26],[2.4,0.12],[3,0.06],[5,0.05]]);
function poseAttaquant(tau, b){
  const j = saut(tau, 1.42, 2.12, 0.6);
  const P = [A_X(tau), A_Z(tau) + j], penche = A_PENCHE(tau), E = epaules(P, penche, 1);
  const enLair = pente(tau, 1.42, 1.56)*(1 - pente(tau, 1.98, 2.12));
  const coup = Math.sin(Math.PI*rampe(tau, 1.45, 2.1));          // la jambe droite part vers l'avant
  const g = pas(tau, 7.15, [[1.6,1.9,6.3,0]]), d = pas(tau, 7.38, [[1.6,1.9,6.66,0]]);
  const sol = z=> Math.max(z, 0);
  const pg = [mix(g[0], P[0]-0.16, enLair), sol(mix(g[1], P[1]-0.93-CHEVILLE, enLair))];
  const pd = [mix(d[0], P[0]+mix(-0.02, 0.26, coup), enLair), sol(mix(d[1], P[1]-mix(0.92, 0.74, coup)-CHEVILLE, enLair))];
  // Main droite sous le ballon, main gauche en guide ; poignet cassé après le tir.
  let md, mg;
  if(tau < TAU_TIR){
    md = [b[0]-0.07, b[1]-0.03, b[2]-0.09];
    mg = [b[0]+0.03, b[1]+0.13, b[2]-0.02];
  }else{
    const geste = pente(tau, TAU_TIR, TAU_TIR+0.2), repos = pente(tau, 3.3, 4.3);
    const r = mix3(mix3([0.24,-0.16,0.6],[0.42,-0.16,0.36], geste), [0.22,-0.24,-0.5], repos);
    md = [E[0]+r[0], r[1], E[1]+r[2]];
    const l = mix3([0.2,0.14,0.44],[0.2,0.24,-0.42], pente(tau, TAU_TIR+0.04, 2.3));
    mg = [E[0]+l[0], l[1], E[1]+l[2]];
  }
  return { P, penche, tete: -0.12*pente(tau, 1.4, 1.8), ecart: 0.17, haut: j,
    piedG: pg, piedD: pd, pointeG: borne(pg[1]*3, 0, 0.7), pointeD: borne(pd[1]*3, 0, 0.7), mainG: mg, mainD: md };
}

/* --- Le défenseur : en appuis, mord un peu à la feinte, saute un temps trop tard --- */
const D_X = piste([[0.45,8.42],[1.3,8.42],[1.54,8.38],[2.14,8.08],[2.5,8.04],[5,8.04]]);
const D_Z = piste([[0.45,0.84],[0.86,0.9],[1.12,0.83],[1.3,0.84],[1.44,0.76],[1.54,0.99],[2.14,0.97],[2.34,0.83],[2.8,0.95],[5,0.95]]);
const D_PENCHE = piste([[0.45,0.34],[1.3,0.3],[1.6,0.1],[1.85,0.05],[2.14,0.15],[2.5,0.24],[5,0.2]]);
function poseDefenseur(tau){
  const j = saut(tau, 1.54, 2.14, 0.42);
  const P = [D_X(tau), D_Z(tau) + j], penche = D_PENCHE(tau), E = epaules(P, penche, -1);
  const enLair = pente(tau, 1.54, 1.66)*(1 - pente(tau, 2.02, 2.14));
  const g = pas(tau, 8.14, [[1.7,1.95,7.86,0]]), d = pas(tau, 8.6, [[1.7,1.95,8.32,0]]);
  const sol = z=> Math.max(z, 0);
  const pg = [mix(g[0], P[0]-0.08, enLair), sol(mix(g[1], P[1]-0.93-CHEVILLE, enLair))];
  const pd = [mix(d[0], P[0]+0.16, enLair), sol(mix(d[1], P[1]-0.9-CHEVILLE, enLair))];
  const feinte = 0.35*Math.sin(Math.PI*rampe(tau, 0.6, 1.15));
  const contre = Math.max(feinte, pente(tau, 1.46, 1.76)*(1 - pente(tau, 2.15, 2.8)));
  const mg = mix3([E[0]-0.38, -0.3, E[1]-0.28], [E[0]-0.3, -0.16, E[1]+0.62], contre);
  const md = mix3([E[0]-0.2, 0.44, E[1]-0.3], [E[0]-0.15, 0.32, E[1]-0.08], contre);
  return { P, penche, tete: -0.1*contre, ecart: 0.24, haut: j,
    piedG: pg, piedD: pd, pointeG: borne(pg[1]*3, 0, 0.6), pointeD: borne(pd[1]*3, 0, 0.6), mainG: mg, mainD: md };
}

/* Pose → articulations en 3D. sens = +1 : regarde vers +x ; −1 : vers −x. */
function squelette(po, sens){
  const s = Math.sin(po.penche), c = Math.cos(po.penche);
  const dos = [sens*s, 0, c], avant = [sens*c, 0, -s];
  const P = [po.P[0], 0, po.P[1]];
  const cou = add(P, mul(dos, 0.53)), poitrine = add(P, mul(dos, 0.36)), taille = add(P, mul(dos, 0.15));
  const it = po.penche*0.35 + (po.tete || 0);
  const tete = add(cou, [sens*Math.sin(it)*0.17, 0, Math.cos(it)*0.17]);
  const J = { P, cou, poitrine, taille, tete, dos, avant,
    haut: po.haut || 0,
    menton: add(tete, [sens*Math.cos(it)*0.04 - sens*Math.sin(it)*0.045, 0, -Math.sin(it)*0.04 - Math.cos(it)*0.045]) };
  for(const [cote, y] of [['G', sens], ['D', -sens]]){
    const epaule = add(add(P, mul(dos, 0.49)), [0, y*0.215, 0]);
    const hanche = [P[0], y*0.105, P[2] - 0.03];
    const pied = po['pied'+cote];
    const cheville = [pied[0], y*po.ecart, pied[1] + CHEVILLE];
    const [genou, chev] = plier(hanche, cheville, CUISSE, TIBIA, [sens, y*0.22, 0.1]);
    const pt = po['pointe'+cote] || 0;
    const orteil = [chev[0] + sens*Math.cos(pt)*0.22, chev[1], Math.max(chev[2] - 0.04 - Math.sin(pt)*0.22, 0.05)];
    const talon = [chev[0] - sens*0.06, chev[1], Math.max(chev[2] - 0.035, 0.055)];
    const main = po['main'+cote];
    const dm = sub(main, epaule);
    const [coude, poignet] = plier(epaule, main, BRAS, AVANT_BRAS, [sens*dm[2], y*0.6, -sens*dm[0]]);
    const av = sub(poignet, coude), al = len(av) || 1;
    J['epaule'+cote] = epaule; J['hanche'+cote] = hanche; J['genou'+cote] = genou; J['cheville'+cote] = chev;
    J['orteil'+cote] = orteil; J['talon'+cote] = talon; J['coude'+cote] = coude; J['poignet'+cote] = poignet;
    J['main'+cote] = add(poignet, mul(av, 0.05/al)); J['doigts'+cote] = add(poignet, mul(av, 0.13/al));
    J['mollet'+cote] = add(mix3(genou, chev, 0.3), [-sens*0.012, 0, 0]);
  }
  return J;
}

/* ---------- La carte de France ---------- */
// La carte du site (js/france-map.js) est en « unités carte » : 1 unité ≈ 1,88 km.
const KM = 1880;
const VILLES = ['Montpellier','Paris','Lille','Lyon','Nantes','Bordeaux','Toulouse','Marseille','Strasbourg','Clermont-Ferrand']
  .map(nom=>{
    if(typeof CITY_COORDS !== 'undefined' && CITY_COORDS[nom]) return CITY_COORDS[nom];
    return [354.9, 336.2];                           // Clermont-Ferrand (45,777° N, 3,087° E)
  });
const MTP = VILLES[0];
// Le terrain est tourné par rapport au nord : la caméra pivote en montant.
const CAP = -143*Math.PI/180;                      // le terrain suit l'axe de l'hôtel de ville
function carteVersTerrain(mx, my){
  const E = (mx - MTP[0])*KM, N = -(my - MTP[1])*KM;
  return [E*Math.sin(CAP) + N*Math.cos(CAP), -E*Math.cos(CAP) + N*Math.sin(CAP)];
}
const regions = FRANCE_REGIONS.map(r=> ({ nom: r.name, trace: new Path2D(r.d) }));
const cadre = (function(){
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for(const r of FRANCE_REGIONS){
    const re = /(-?[\d.]+)[ ,](-?[\d.]+)/g; let m;
    while((m = re.exec(r.d))){ const x = +m[1], y = +m[2]; if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y; }
  }
  return { x0, x1, y0, y1, cx: (x0+x1)/2, cy: (y0+y1)/2, w: x1-x0, h: y1-y0 };
})();
const villes = VILLES.map((v, i)=>{
  const p = carteVersTerrain(v[0], v[1]);
  return { carte: v, sol: [p[0], p[1], 0], dist: Math.hypot(p[0], p[1]), phase: (i*0.37)%1, eveil: -1 };
});

/* Le vrai plan de Montpellier autour de l'hôtel de ville (js/intro-montpellier.js,
   données IGN) : chargé à part, pendant le tir. S'il n'arrive pas à temps,
   l'ascension se fait simplement sans lui. Repère des tracés : mètres, est/nord. */
let plan = null;
function lirePlan(d){
  const couche = (nom, ferme)=>{
    const chemin = new Path2D(), pas = d.pas[nom];
    for(const ligne of d[nom].split(';')){
      const n = ligne.split(',');
      let x = +n[0], y = +n[1];
      chemin.moveTo(x*pas, y*pas);
      for(let i = 2; i < n.length; i += 2){ x += +n[i]; y += +n[i+1]; chemin.lineTo(x*pas, y*pas); }
      if(ferme) chemin.closePath();
    }
    return chemin;
  };
  plan = { bati: couche('bati', true), chemins: couche('chemins'), rues: couche('rues'),
           grandes: couche('grandes'), eau: couche('eau', true), axes: couche('axes') };
}
(function(){
  if(window.EBOK_INTRO_MTP){ lirePlan(window.EBOK_INTRO_MTP); return; }
  const sc = document.createElement('script');
  sc.src = '/js/intro-montpellier.js'; sc.async = true;
  sc.onload = ()=>{ try{ if(window.EBOK_INTRO_MTP) lirePlan(window.EBOK_INTRO_MTP); }catch(e){} };
  document.head.appendChild(sc);
})();

/* ---------- Toile et caméra ---------- */
const cv = document.getElementById('introCanvas'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, FOCALE = 1000, large = true;
const C = { pos: [0,0,0], r: [0,-1,0], u: [0,0,1], f: [1,0,0] };   // caméra : position et axes
let finale = null;                                                  // cadrage d'arrivée sur la carte

function mesurer(){
  W = boite.clientWidth || window.innerWidth; H = boite.clientHeight || window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(W*DPR); cv.height = Math.round(H*DPR);
  large = W >= 860;
  // Champ : assez large pour tenir le tireur et le panier, même en portrait.
  FOCALE = Math.min(W/(2*Math.tan(29*Math.PI/180)), H/(2*Math.tan(17*Math.PI/180)));
  if(W < H) FOCALE = W/(2*Math.tan(26*Math.PI/180));
  // Arrivée : la France tient dans la zone laissée libre par le texte.
  let zone = { x: W*0.44, y: H*0.06, w: W*0.52, h: H*0.88 };
  if(!large){
    // Téléphone : la carte tient entre le titre du haut et le texte du bas, sans jamais passer dessous.
    const texte = boite.querySelector('[data-intro-carton]'), haut = 84;
    const limite = texte && texte.offsetHeight ? texte.getBoundingClientRect().top - boite.getBoundingClientRect().top : H - 330;
    zone = { x: W*0.05, y: haut, w: W*0.9, h: Math.max(limite - haut - 22, H*0.3) };
  }
  const S = Math.min(zone.w/cadre.w, zone.h/cadre.h);                // pixels par unité carte
  const s = S/KM, r = [Math.sin(CAP), -Math.cos(CAP)], u = [Math.cos(CAP), Math.sin(CAP)];
  const p = carteVersTerrain(cadre.cx, cadre.cy);
  const dx = (zone.x + zone.w/2 - W/2)/s, dy = (zone.y + zone.h/2 - H/2)/s;
  finale = { s, S, c: [p[0] - dx*r[0] + dy*u[0], p[1] - dx*r[1] + dy*u[1]], zone };
}

function viser(pos, cible){
  const d = sub(cible, pos), h = Math.hypot(d[0], d[1]);
  const tangage = Math.atan2(d[2], h), lacet = Math.atan2(d[1], d[0])*borne(h/0.6, 0, 1);
  const cp = Math.cos(tangage), sp = Math.sin(tangage), cy = Math.cos(lacet), sy = Math.sin(lacet);
  C.pos = pos; C.f = [cp*cy, cp*sy, sp]; C.u = [-sp*cy, -sp*sy, cp]; C.r = cross(C.f, C.u);
}
/* Vue du dessus : centre visé au sol, échelle (px par mètre), orientation. */
let dessus = null;
function surplomb(c, s, angle){
  C.pos = [c[0], c[1], FOCALE/s]; C.f = [0,0,-1];
  C.u = [Math.cos(angle), Math.sin(angle), 0]; C.r = [Math.sin(angle), -Math.cos(angle), 0];
  dessus = { c, s, angle };
}
function versEcran(p){
  const d = sub(p, C.pos), z = dot(d, C.f);
  if(z < 0.05) return null;
  return [W/2 + FOCALE*dot(d, C.r)/z, H/2 - FOCALE*dot(d, C.u)/z, z];
}
const profondeur = p=> dot(sub(p, C.pos), C.f);

/* Ajoute une ligne 3D au tracé en cours (coupée si elle passe derrière la caméra). */
function ligne(pts){
  const PROCHE = 0.08;
  let avant = null, avantOk = false;
  for(const p of pts){
    const d = sub(p, C.pos), c = [dot(d, C.r), dot(d, C.u), dot(d, C.f)], ok = c[2] > PROCHE;
    if(avant){
      if(ok && avantOk) tracer(c, false);
      else if(ok && !avantOk){ tracer(mix3(avant, c, (PROCHE - avant[2])/(c[2] - avant[2])), true); tracer(c, false); }
      else if(!ok && avantOk) tracer(mix3(avant, c, (PROCHE - avant[2])/(c[2] - avant[2])), false);
    }else if(ok) tracer(c, true);
    avant = c; avantOk = ok;
  }
}
function tracer(c, debut){
  const x = W/2 + FOCALE*c[0]/c[2], y = H/2 - FOCALE*c[1]/c[2];
  if(debut) ctx.moveTo(x, y); else ctx.lineTo(x, y);
}
function trait3D(lignes, epaisseur, alpha){
  ctx.beginPath();
  for(const l of lignes) ligne(l);
  ctx.lineWidth = epaisseur; ctx.strokeStyle = trait(alpha); ctx.stroke();
}

/* ---------- Silhouettes ---------- */
/* Contour d'un volume fait de boules (centre, rayon) : leur enveloppe à l'écran. */
function enveloppe(boules){
  const pts = [];
  for(const [p, r] of boules){
    const q = versEcran(p);
    if(!q) return null;
    const rr = r*FOCALE/q[2];
    for(let k = 0; k < 14; k++){ const a = k/14*Math.PI*2; pts.push([q[0] + rr*Math.cos(a), q[1] + rr*Math.sin(a)]); }
  }
  pts.sort((a,b)=> a[0]-b[0] || a[1]-b[1]);
  const vect = (o,a,b)=> (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
  const bas = [], haut = [];
  for(const p of pts){ while(bas.length > 1 && vect(bas[bas.length-2], bas[bas.length-1], p) <= 0) bas.pop(); bas.push(p); }
  for(let i = pts.length-1; i >= 0; i--){ const p = pts[i]; while(haut.length > 1 && vect(haut[haut.length-2], haut[haut.length-1], p) <= 0) haut.pop(); haut.push(p); }
  bas.pop(); haut.pop();
  return bas.concat(haut);
}
/* Un groupe de volumes = une seule silhouette : on trace épais, puis on
   remplit par-dessus ; il ne reste que le contour extérieur.
   `hachures` : remplit en plus la forme de traits obliques (maillot du défenseur). */
let ancreHachures = 0;
function silhouette(volumes, epaisseur, fond, bord, hachures){
  ctx.beginPath();
  let vu = false, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for(const v of volumes){
    const poly = enveloppe(v);
    if(!poly || poly.length < 3) continue;
    vu = true;
    ctx.moveTo(poly[0][0], poly[0][1]);
    for(let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath();
    if(hachures) for(const q of poly){ if(q[0] < x0) x0 = q[0]; if(q[0] > x1) x1 = q[0]; if(q[1] < y0) y0 = q[1]; if(q[1] > y1) y1 = q[1]; }
  }
  if(!vu) return;
  ctx.lineJoin = 'round'; ctx.lineWidth = epaisseur*2; ctx.strokeStyle = bord; ctx.stroke();
  ctx.fillStyle = fond; ctx.fill();
  if(hachures){
    const pas = Math.max(epaisseur*2.7, 2.6), h = y1 - y0;
    ctx.save(); ctx.clip();
    ctx.beginPath();
    for(let x = x0 - h - ((x0 - ancreHachures) % pas + pas) % pas; x < x1; x += pas){ ctx.moveTo(x, y1); ctx.lineTo(x + h, y0); }
    ctx.lineWidth = Math.max(epaisseur*0.62, 0.5); ctx.strokeStyle = hachures; ctx.stroke();
    ctx.restore();
  }
}

/* Deux écritures, comme sur une affiche : le tireur en aplat bordeaux, découpé
   d'un filet beige ; le défenseur au trait, maillot hachuré. */
const STYLE_TIREUR = { peau: BORDEAUX, tenue: BORDEAUX, bord: BEIGE, finesse: 0.55, numero: '8', encre: BEIGE };
const STYLE_DEFENSEUR = { peau: BEIGE, tenue: BEIGE, bord: BORDEAUX, finesse: 1, hachures: trait(0.8) };

function dessinerJoueur(J, st){
  const z = profondeur(J.poitrine);
  if(z < 0.3) return;
  const e = borne(FOCALE/z*0.014, 0.45, 2.1)*st.finesse;
  const ancre = versEcran(J.P); if(ancre) ancreHachures = ancre[0] + ancre[1];
  const loin = profondeur(J.epauleG) > profondeur(J.epauleD) ? 'G' : 'D', pres = loin === 'G' ? 'D' : 'G';
  const bras = c=> silhouette([
    [[J['epaule'+c], 0.07], [J['coude'+c], 0.052]],
    [[J['coude'+c], 0.054], [J['poignet'+c], 0.039]],
    [[J['main'+c], 0.044], [J['doigts'+c], 0.03]]], e, st.peau, st.bord);
  const jambe = c=>{
    silhouette([
      [[J['hanche'+c], 0.1], [J['genou'+c], 0.066]],
      [[J['genou'+c], 0.062], [J['mollet'+c], 0.071], [J['cheville'+c], 0.043]],
      [[J['talon'+c], 0.058], [J['cheville'+c], 0.052], [J['orteil'+c], 0.05]]], e, st.peau, st.bord);
    // Short long et ample, façon playground.
    silhouette([[[J['hanche'+c], 0.14], [mix3(J['hanche'+c], J['genou'+c], 0.74), 0.132]]], e, st.tenue, st.bord, st.hachures);
  };
  // Un bras dont la main est plus loin que le buste passe DERRIÈRE lui : vu de
  // dos, un joueur qui tient le ballon devant son ventre ne montre pas ses bras.
  const zBuste = profondeur(J.poitrine);
  const devant = c=> profondeur(J['main'+c]) < zBuste - 0.02 && profondeur(J['coude'+c]) < zBuste + 0.12;
  if(!devant(pres)) bras(pres);
  if(!devant(loin)) bras(loin);
  jambe(loin);
  silhouette([[[J.hancheG, 0.13], [J.hancheD, 0.13], [J.taille, 0.118]]], e, st.tenue, st.bord, st.hachures);
  jambe(pres);
  silhouette([
    [[J.epauleG, 0.082], [J.epauleD, 0.082], [J.cou, 0.07], [J.poitrine, 0.155], [J.taille, 0.12]],
    [[J.taille, 0.12], [J.hancheG, 0.116], [J.hancheD, 0.116]]], e, st.tenue, st.bord, st.hachures);
  if(st.numero) ecrireNumero(J, st.numero, st.encre);
  silhouette([[[J.cou, 0.062], [J.tete, 0.058]], [[J.tete, 0.097], [J.menton, 0.078]]], e, st.peau, st.bord);
  if(devant(loin)) bras(loin);
  if(devant(pres)) bras(pres);
}
/* Ombre portée au sol : elle se resserre quand le joueur décolle. */
function ombre(x, y, rx, ry, alpha){
  ctx.beginPath();
  const c = [];
  for(let k = 0; k <= 24; k++){ const a = k/24*Math.PI*2; c.push([x + rx*Math.cos(a), y + ry*Math.sin(a), 0]); }
  ligne(c);
  ctx.fillStyle = trait(alpha); ctx.fill();
}
/* Le numéro, plaqué sur le dos ou la poitrine selon ce que voit la caméra. */
function ecrireNumero(J, texte, couleur){
  const vue = sub(C.pos, J.poitrine);
  const face = dot(J.avant, vue) > 0 ? 1 : -1;
  const centre = add(add(J.poitrine, mul(J.avant, face*0.13)), mul(J.dos, -0.07));
  if(Math.abs(dot(J.avant, vue))/len(vue) < 0.18) return;          // vu par la tranche
  const c = versEcran(centre), a = versEcran(add(centre, [0, 0.1, 0])), b = versEcran(add(centre, mul(J.dos, 0.1)));
  if(!c || !a || !b) return;
  let ex = [(a[0]-c[0])*10, (a[1]-c[1])*10];
  const ey = [(b[0]-c[0])*10, (b[1]-c[1])*10];
  if(ex[0]*(-ey[1]) - ex[1]*(-ey[0]) < 0) ex = [-ex[0], -ex[1]];   // jamais en miroir
  if(Math.hypot(ex[0], ex[1]) < 14) return;
  const k = 0.19/72;
  ctx.save();
  ctx.transform(ex[0]*k, ex[1]*k, -ey[0]*k, -ey[1]*k, c[0], c[1]);
  ctx.font = "100px Anton, 'Arial Narrow', Impact, sans-serif";
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = couleur; ctx.fillText(texte, 0, 6);
  ctx.restore();
}

/* Le ballon : un disque et ses coutures, qui tournent (effet rétro). */
const coutures = (function(){
  const L = [];
  for(const f of [a=> [Math.cos(a), 0, Math.sin(a)], a=> [0, Math.cos(a), Math.sin(a)],
                  a=> [0.62, 0.785*Math.cos(a), 0.785*Math.sin(a)], a=> [-0.62, 0.785*Math.cos(a), 0.785*Math.sin(a)]]){
    const l = []; for(let i = 0; i <= 36; i++) l.push(f(i/36*Math.PI*2)); L.push(l);
  }
  return L;
})();
function dessinerBallon(p, rot){
  const q = versEcran(p);
  if(!q) return;
  const r = BALLON_R*FOCALE/q[2];
  if(r < 0.6) return;
  const e = borne(r*0.1, 0.5, 1.7);
  ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, Math.PI*2);
  ctx.fillStyle = BORDEAUX; ctx.fill();
  ctx.lineWidth = e*1.2; ctx.strokeStyle = BEIGE; ctx.stroke();
  if(r < 4) return;
  const vue = sub(C.pos, p), cr = Math.cos(rot), sr = Math.sin(rot);
  ctx.beginPath();
  for(const l of coutures){
    let pen = false;
    for(const v of l){
      const w = [v[0]*cr + v[2]*sr, v[1], -v[0]*sr + v[2]*cr];      // rotation autour de l'axe y
      if(dot(w, vue) <= 0){ pen = false; continue; }
      const s = versEcran(add(p, mul(w, BALLON_R*0.97)));
      if(!s){ pen = false; continue; }
      if(pen) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]);
      pen = true;
    }
  }
  ctx.lineWidth = e*0.8; ctx.stroke();
}

/* Le filet : il se gonfle au passage du ballon, puis se balance. */
function filet(q, b){
  const L = [], n = 12;
  const pousse = q < 0 ? 0 : 0.13*Math.exp(-3.2*q)*Math.cos(9*q);
  const etire = q < 0 ? 0 : -0.09*Math.exp(-4*q)*Math.cos(15*q);
  const dedans = b && b[2] > 2.48 && b[2] < CERCLE_Z + 0.1 && Math.abs(b[0] - PANIER_X) < 0.3;
  const anneau = (k, r, z)=>{
    const a = k/n*Math.PI*2, bas = (CERCLE_Z - z)/0.45;
    let rr = r;
    if(dedans) rr = Math.max(r, (BALLON_R + 0.02)*Math.max(0, 1 - Math.abs(z - b[2])/0.22) + r*0.4);
    return [PANIER_X + pousse*bas*bas + rr*Math.cos(a), rr*Math.sin(a), z + etire*bas];
  };
  for(let k = 0; k < n; k++){
    L.push([anneau(k, CERCLE_R, CERCLE_Z), anneau(k+0.5, 0.185, 2.88), anneau(k, 0.15, 2.73), anneau(k+0.5, 0.135, 2.6)]);
    L.push([anneau(k, CERCLE_R, CERCLE_Z), anneau(k-0.5, 0.185, 2.88), anneau(k, 0.15, 2.73), anneau(k-0.5, 0.135, 2.6)]);
  }
  return L;
}

/* ---------- Caméra : la trajectoire du plan-séquence ---------- */
let camPos, camCible;
function reglerCamera(){
  // En portrait, la caméra passe davantage dans le dos du tireur.
  const p = large || W > H ? 0 : 1;
  const v = (a, b)=> mix3(a, b, p);
  camPos = piste([
    [0,               v([2.1,-4.5,1.4],   [2.5,-3.0,1.5])],
    [T_ARRET,         v([2.4,-4.4,1.5],   [2.7,-3.0,1.6])],
    [T_TIR,           v([2.8,-4.3,1.75],  [3.0,-3.0,1.85])],
    [T_TIR + 0.9,     v([4.5,-3.6,2.9],   [4.6,-2.6,3.0])],
    [T_PANIER - 0.7,  [8.6,-1.5,5.4]],
    [T_PANIER,        [11.0,-0.35,7.6]],
    [T_ZENITH,        [12.0,0,11]]
  ]);
  camCible = piste([
    [0,               v([8.4,0.5,1.35],   [8.5,0.3,1.45])],
    [T_ARRET,         v([8.5,0.4,1.5],    [8.6,0.2,1.6])],
    [T_TIR,           v([8.7,0.3,2.05],   [8.8,0.1,2.15])],
    [T_PANIER,        [PANIER_X,0,3.0]],
    [T_PANIER + 0.3,  [12.15,0,0]],
    [T_ZENITH,        [12.0,0,0]]
  ]);
}
const ALT_0 = 11;                                    // altitude au début de l'ascension
function cadrage(t, b){
  if(t < T_ZENITH){
    dessus = null;
    const suivi = pente(t, T_TIR - 0.1, T_TIR + 0.7)*(1 - pente(t, T_PANIER - 0.05, T_PANIER + 0.3));
    viser(camPos(t), mix3(camCible(t), b, suivi));
    return 0;
  }
  // Ascension : l'altitude croît de façon exponentielle (zoom régulier), la
  // caméra file en ligne droite vers son point d'arrivée au-dessus de la France.
  const u = rampe(t, T_ZENITH, T_FIN);
  const e = doux(u) + 0.3*u*(1-u)*(1-u);
  const s0 = FOCALE/ALT_0, s = Math.exp(mix(Math.log(s0), Math.log(finale.s), e));
  const angle = CAP*pente(u, 0.03, 0.82);
  const r = [Math.sin(angle), -Math.cos(angle)], h = [Math.cos(angle), Math.sin(angle)];
  // Point suivi : le panier d'abord, puis le centre du terrain (= Montpellier).
  // Il reste au milieu de l'image, puis glisse vers sa place sur la carte.
  const ancre = 12*(1 - pente(u, 0, 0.3)), g = pente(u, 0.34, 0.94);
  const rf = [Math.sin(CAP), -Math.cos(CAP)], hf = [Math.cos(CAP), Math.sin(CAP)];
  const ox = -finale.s*(finale.c[0]*rf[0] + finale.c[1]*rf[1])*g, oy = finale.s*(finale.c[0]*hf[0] + finale.c[1]*hf[1])*g;
  surplomb([ancre - (ox/s)*r[0] + (oy/s)*h[0], -(ox/s)*r[1] + (oy/s)*h[1]], s, angle);
  return u;
}

/* ---------- Rendu d'une image ---------- */
function carteVersEcran(){
  // Matrice qui amène les unités carte à l'écran, pour le cadrage du dessus.
  const { c, s, angle } = dessus, sn = Math.sin(angle), cs = Math.cos(angle);
  const f = (mx, my)=>{
    const p = carteVersTerrain(mx, my), x = p[0] - c[0], y = p[1] - c[1];
    return [W/2 + s*(sn*x - cs*y), H/2 - s*(cs*x + sn*y)];
  };
  const o = f(0,0), a = f(1,0), b = f(0,1);
  return [a[0]-o[0], a[1]-o[1], b[0]-o[0], b[1]-o[1], o[0], o[1]];
}
const solVersEcran = p=> { const q = versEcran(p); return q || [-9999,-9999,1]; };

let survol = null;                                   // région sous le pointeur (carte de fin)

function rendre(t){
  const tau = tauDe(t), b = ballon(tau);
  const u = cadrage(t, b);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = BEIGE; ctx.fillRect(0, 0, W, H);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  const s = dessus ? dessus.s : 0;                   // px par mètre, vue du dessus
  const proche = dessus ? pente(s, 0.9, 2.6) : 1;    // 1 tant que le terrain se lit

  /* --- La carte : révélée par l'onde partie de Montpellier --- */
  if(dessus){
    const S = s*KM, mtp = solVersEcran([0,0,0]);
    const onde = Math.max(W, H)*1.25*Math.pow(rampe(u, 0.46, 0.9), 1.5);
    if(S < 500 && onde > 0){
      const M = carteVersEcran();
      const plein = pente(u, 0.82, 1);
      ctx.save();
      ctx.beginPath(); ctx.arc(mtp[0], mtp[1], onde, 0, Math.PI*2); ctx.clip();
      ctx.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
      ctx.lineWidth = 1.05/S; ctx.lineJoin = 'round';
      for(const r of regions){
        if(plein > 0){ ctx.fillStyle = r === survol ? trait(0.13) : `rgba(226,202,196,${0.36*plein})`; ctx.fill(r.trace); }
        ctx.strokeStyle = trait(0.9); ctx.stroke(r.trace);
      }
      ctx.restore();
      if(u < 0.96){                                  // le front de l'onde, et deux échos
        for(let i = 0; i < 3; i++){
          const r = onde - i*46;
          if(r <= 2) continue;
          ctx.beginPath(); ctx.arc(mtp[0], mtp[1], r, 0, Math.PI*2);
          ctx.lineWidth = 1.4 - i*0.4; ctx.strokeStyle = trait((0.5 - i*0.16)*(1 - pente(u, 0.84, 0.95))); ctx.stroke();
        }
      }
      for(const v of villes){                        // l'onde réveille les villes
        const q = solVersEcran(v.sol);
        if(v.eveil < 0 && Math.hypot(q[0]-mtp[0], q[1]-mtp[1]) <= onde) v.eveil = t;
        if(v.eveil > t) v.eveil = -1;                // retour en arrière (réglage)
      }
    }else{ for(const v of villes) if(v.eveil > t || u <= 0.46) v.eveil = -1; }

    /* --- Montpellier : bâtiments, rues, le Lez, puis les grands axes --- */
    if(plan && s < 45 && s > 0.0011){
      const { c, angle } = dessus, sn = Math.sin(angle), cs = Math.cos(angle);
      const proches = pente(s, 40, 13), a = v=> v > 0.01;
      const aBati = proches*pente(s, 0.3, 0.75), aEau = proches*pente(s, 0.035, 0.09);
      const aRues = pente(s, 30, 9)*pente(s, 0.05, 0.13), aGrandes = pente(s, 30, 9)*pente(s, 0.016, 0.045);
      const aAxes = pente(s, 0.3, 0.09)*pente(s, 0.0013, 0.0032);
      ctx.save();
      ctx.transform(s*sn, -s*cs, -s*cs, -s*sn, W/2 - s*(sn*c[0] - cs*c[1]), H/2 + s*(cs*c[0] + sn*c[1]));
      ctx.transform(Math.sin(CAP), -Math.cos(CAP), Math.cos(CAP), Math.sin(CAP), 0, 0);   // est/nord → repère du terrain
      ctx.lineJoin = 'round';
      if(a(aEau)){ ctx.fillStyle = trait(0.1*aEau); ctx.fill(plan.eau); ctx.lineWidth = 0.9/s; ctx.strokeStyle = trait(0.42*aEau); ctx.stroke(plan.eau); }
      if(a(aBati)){
        ctx.fillStyle = trait(0.055*aBati); ctx.fill(plan.bati);
        ctx.lineWidth = 0.8/s; ctx.strokeStyle = trait(0.5*aBati); ctx.stroke(plan.bati);
        ctx.setLineDash([3/s, 4/s]); ctx.strokeStyle = trait(0.4*aBati); ctx.stroke(plan.chemins); ctx.setLineDash([]);
      }
      if(a(aRues)){ ctx.lineWidth = borne(0.5 + s*1.4, 0.6, 1.3)/s; ctx.strokeStyle = trait(0.42*aRues); ctx.stroke(plan.rues); }
      if(a(aGrandes)){ ctx.lineWidth = borne(0.9 + s*2.6, 1.1, 2.4)/s; ctx.strokeStyle = trait(0.62*aGrandes); ctx.stroke(plan.grandes); }
      if(a(aAxes)){ ctx.lineWidth = 1.1/s; ctx.strokeStyle = trait(0.5*aAxes); ctx.stroke(plan.axes); }
      ctx.restore();
    }
  }

  /* --- Le playground --- */
  if(proche > 0.01){
    const eSol = dessus ? borne(0.4 + s*0.06, 0.55, 1.6) : 1.6;
    ctx.globalAlpha = proche;
    // La vue du dessus pose le terrain sur le plan : un fond clair le détache des rues.
    if(dessus){
      ctx.beginPath(); ligne([[-17.5,-10.5,0],[17.5,-10.5,0],[17.5,10.5,0],[-17.5,10.5,0],[-17.5,-10.5,0]]);
      ctx.fillStyle = BEIGE; ctx.fill();
    }
    // Les raquettes et le rond central en aplat léger.
    const aplat = pente(t, 0.35, 1.0);
    if(aplat > 0){
      ctx.beginPath();
      for(const e of [1,-1]) ligne([[e*DEMI_L,-2.45,0],[e*8.2,-2.45,0],[e*8.2,2.45,0],[e*DEMI_L,2.45,0],[e*DEMI_L,-2.45,0]]);
      ligne(lignesSol[2]);
      ctx.fillStyle = trait(0.085*aplat); ctx.fill();
    }
    // Le terrain se trace à la craie pendant la première seconde.
    ctx.beginPath();
    for(let i = 0; i < lignesSol.length; i++){
      const f = pente(t, 0.02 + i*0.04, 0.5 + i*0.04);
      if(f > 0) ligne(portion(i, f));
    }
    ctx.lineWidth = eSol; ctx.strokeStyle = trait(0.82); ctx.stroke();
    trait3D(grillage, 1, 0.22*pente(t, 0.2, 0.9));

    const q = tau - TAU_PANIER;
    const aPanier = pente(t, 0.15, 0.7);
    const dessinerPanier = (lignes, avecFilet)=>{
      trait3D(lignes, borne(eSol*1.15, 0.6, 1.9), 0.95*aPanier);
      if(avecFilet) trait3D(filet(q, b), borne(eSol*0.6, 0.4, 0.9), 0.75*aPanier);
    };
    const pA = poseAttaquant(tau, b), pD = poseDefenseur(tau);
    const A = squelette(pA, 1), D = squelette(pD, -1);
    const dansFilet = q > 0 && b[2] > 2.45 && b[2] < CERCLE_Z;
    const rot = -tau*9;

    // Ombres portées.
    for(const J of [A, D]){
      const k = 1/(1 + J.haut*1.6);
      ombre((J.chevilleG[0] + J.chevilleD[0])/2, 0, 0.5*k, 0.3*k, 0.16*k*aPanier);
    }
    ombre(b[0], b[1], 0.13, 0.1, 0.2/(1 + b[2]*0.8)*aPanier);

    // La trajectoire du tir, en pointillés, comme sur un tableau de coach.
    if(tau > TAU_TIR){
      const fin = Math.min(tau, TAU_PANIER), pts = [];
      for(let x = TAU_TIR; x < fin; x += 0.02) pts.push(ballon(x));
      pts.push(ballon(fin));
      ctx.beginPath(); ligne(pts);
      ctx.setLineDash([2, 7]); ctx.lineWidth = 1.6; ctx.strokeStyle = trait(0.6*(1 - pente(q, 0.1, 0.9))); ctx.stroke(); ctx.setLineDash([]);
    }

    const objets = [
      { z: profondeur([-PANIER_X,0,3]), f: ()=> dessinerPanier(panierLoin, false) },
      { z: profondeur([PANIER_X,0,3]),  f: ()=>{ if(dansFilet) dessinerBallon(b, rot); dessinerPanier(panierPres, true); } },
      { z: profondeur(D.poitrine), f: ()=> dessinerJoueur(D, STYLE_DEFENSEUR) },
      { z: profondeur(A.poitrine), f: ()=> dessinerJoueur(A, STYLE_TIREUR) }
    ];
    // Tenu devant le buste, le ballon est caché par le tireur vu de dos : on ne le
    // découvre que lorsqu'il monte au-dessus de l'épaule.
    if(!dansFilet) objets.push({ z: tau < TAU_TIR ? profondeur(A.poitrine) + 0.05 : profondeur(b), f: ()=> dessinerBallon(b, rot) });
    objets.sort((a, c)=> c.z - a.z);
    for(const o of objets) o.f();
    ctx.globalAlpha = 1;

    // Le panier : une onde part du cercle et court sur le sol.
    if(q > 0){
      for(let i = 0; i < 3; i++){
        const v = rampe(t - T_PANIER - i*0.16, 0, 1.5);
        if(v <= 0 || v >= 1) continue;
        const rayon = 0.3 + 15*Math.pow(v, 0.8), c = [];
        for(let k = 0; k <= 64; k++){ const a = k/64*Math.PI*2; c.push([PANIER_X + rayon*Math.cos(a), rayon*Math.sin(a), 0]); }
        trait3D([c], 1.6 - i*0.3, 0.65*(1-v)*proche);
      }
    }
  }

  /* --- Les points : Montpellier d'abord, puis chaque ville réveillée --- */
  if(dessus){
    const naissance = 1 - pente(s, 0.5, 2.2);        // le terrain devient un point
    for(let i = 0; i < villes.length; i++){
      const v = villes[i];
      const a = i === 0 ? naissance : (v.eveil < 0 ? 0 : pente(t, v.eveil, v.eveil + 0.25));
      if(a <= 0.01) continue;
      const q = solVersEcran(v.sol);
      dessinerPoint(q[0], q[1], t, i === 0 ? T_ZENITH : v.eveil, v.phase, a, i === 0);
    }
  }
  return u;
}

/* Un point d'événement : il tremble par salves et émet des ondes, comme un
   sismographe — « ça joue ici ». */
function dessinerPoint(x, y, t, depuis, phase, alpha, principal){
  const cycle = 1.9, age = Math.max(t - depuis, 0), k = ((age/cycle) + phase*0.999) % 1;
  for(const dec of [0, 0.18, 0.36]){
    const v = k - dec;
    if(v < 0 || v > 0.62 || age < dec*cycle) continue;
    const w = v/0.62;
    ctx.beginPath(); ctx.arc(x, y, 4 + (principal ? 26 : 19)*Math.pow(w, 0.7), 0, Math.PI*2);
    ctx.lineWidth = 1.2; ctx.strokeStyle = trait(0.55*(1-w)*alpha); ctx.stroke();
  }
  // Secousse : forte au début de chaque salve, puis elle s'amortit.
  const force = Math.exp(-k*7)*1.5;
  const dx = Math.sin(t*61 + phase*40)*force, dy = Math.cos(t*53 + phase*17)*force*0.7;
  const r = (principal ? 4.6 : 3.3)*(1 + 0.25*Math.exp(-k*9));
  if(principal){
    ctx.beginPath(); ctx.arc(x + dx, y + dy, r + 5.5, 0, Math.PI*2);
    ctx.fillStyle = trait(0.16*alpha); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI*2);
  ctx.fillStyle = trait(alpha); ctx.fill();
}

/* ---------- Habillage : repères, bouton, carton de fin ---------- */
const hud = document.getElementById('introHud'), hudLieu = document.getElementById('introLieu'), hudAlt = document.getElementById('introAlt');
const btnPasser = document.getElementById('introPasser'), btnEntrer = document.getElementById('introEntrer');
const bulle = document.getElementById('introBulle');
let dernierHud = '';
function majHud(t){
  if(!hud) return;
  hud.classList.toggle('visible', t > 0.25 && t < T_FIN - 0.5);
  let txt = '';
  if(dessus){
    const alt = FOCALE/dessus.s*0.62;
    txt = alt < 1000 ? Math.round(alt/5)*5 + ' m'
      : alt < 20000 ? (alt/1000).toFixed(1).replace('.', ',') + ' km'
      : Math.round(alt/1000) + ' km';
    txt = 'Alt. ' + txt;
  }
  if(txt !== dernierHud){ dernierHud = txt; hudAlt.textContent = txt; }
}

/* ---------- Déroulé ---------- */
let t = 0, dernier = 0, image = 0, fini = false, sorti = false, fige = false;
const DUREE = T_FIN + 0.25;

function boucle(maintenant){
  if(sorti) return;
  image = requestAnimationFrame(boucle);
  const dt = Math.min((maintenant - dernier)/1000, 0.05);
  dernier = maintenant;
  if(!fige) t += dt;                                   // à l'arrivée, le temps continue : les points vivent
  if(!fini && t >= DUREE) arriver();
  rendre(fini ? Math.max(t, DUREE) : t);
  majHud(t);
}
function arriver(){
  if(fini) return;
  fini = true;
  if(t < DUREE){                                      // « Passer » : on réveille tout, d'un coup
    if(bande){ bande.arreter(0.35); bande = null; }
    t = DUREE;
    villes.forEach((v, i)=> v.eveil = DUREE - 0.4 + i*0.03);
  }
  boite.classList.add('fin');
  if(btnEntrer) setTimeout(()=>{ try{ btnEntrer.focus({ preventScroll: true }); }catch(e){} }, 350);
}

/* Entrée sur le site. `region` : ouvre directement la recherche de cette région. */
function sortir(region, x, y){
  if(sorti) return;
  sorti = true;
  try{ localStorage.setItem('ebok-intro', '1'); }catch(e){}
  if(/[?&]intro=1/.test(location.search)){ try{ history.replaceState({}, '', '/'); }catch(e){} }
  if(bande){ bande.arreter(0.5); bande = null; }
  if(audio){ const a = audio; setTimeout(()=>{ try{ a.close(); }catch(e){} }, 800); }
  if(x != null) cv.style.transformOrigin = x + 'px ' + y + 'px';
  boite.classList.add('sortie');
  // Région choisie : on ouvre tout de suite, sous le voile qui s'efface, la
  // recherche filtrée sur cette région avec sa carte (comme un clic sur une
  // région de la carte du site, js/app.js → openRegionSearch).
  if(region && typeof window.openRegionSearch === 'function'){
    try{
      window.openRegionSearch(region);
      // Droit sur la carte de la région, sous la barre du haut (qui reste collée).
      const carte = document.getElementById('resultsMap');
      if(carte && carte.offsetHeight){
        const barre = document.querySelector('.topbar'), marge = (barre ? barre.offsetHeight : 0) + 14;
        window.scrollTo({ top: Math.max(carte.getBoundingClientRect().top + window.scrollY - marge, 0), behavior: 'instant' });
      }
    }catch(e){ if(window.console) console.error('Intro EBOK :', e); }
  }else{
    // Sinon le site apparaît dessous : on rejoue l'entrée de l'accueil (titre).
    const accueil = document.getElementById('page-home');
    if(accueil && accueil.classList.contains('active')){
      accueil.classList.remove('active'); void accueil.offsetWidth; accueil.classList.add('active');
    }
  }
  setTimeout(()=>{
    cancelAnimationFrame(image);
    html.classList.remove('intro-on');
    boite.classList.remove('sortie', 'fin');
    window.removeEventListener('resize', surRedimension);
    document.removeEventListener('keydown', surTouche, true);
  }, 620);
}

/* Région sous un point de l'écran (carte de fin). */
function regionSous(x, y){
  if(!dessus) return null;
  const M = carteVersEcran();
  ctx.save();
  ctx.setTransform(DPR*M[0], DPR*M[1], DPR*M[2], DPR*M[3], DPR*M[4], DPR*M[5]);
  let trouve = null;
  for(const r of regions){ if(ctx.isPointInPath(r.trace, x*DPR, y*DPR)){ trouve = r; break; } }
  ctx.restore();
  return trouve;
}
function surPointeur(ev){
  if(!fini || sorti) return;
  const r = regionSous(ev.clientX, ev.clientY);
  survol = ev.pointerType === 'touch' ? null : r;
  if(bulle){
    bulle.classList.toggle('visible', !!survol);
    if(survol){
      bulle.textContent = survol.nom;
      bulle.style.transform = `translate(${Math.min(ev.clientX + 16, W - 220)}px, ${ev.clientY + 18}px)`;
    }
  }
}
function surClic(ev){
  if(!fini){ return; }
  const r = regionSous(ev.clientX, ev.clientY);
  sortir(r ? r.nom : null, ev.clientX, ev.clientY);
}
function surTouche(ev){
  if(sorti) return;
  if(ev.key === 'Escape'){ ev.preventDefault(); if(fini) sortir(); else arriver(); }
  else if(ev.key === 'Enter' && fini && document.activeElement !== btnEntrer){ ev.preventDefault(); sortir(); }
  else if(ev.key === 'Tab'){                          // le focus reste dans l'intro
    ev.preventDefault();
    const son = document.getElementById('introSon');
    const cible = fini ? btnEntrer : (document.activeElement === btnPasser && son ? son : btnPasser);
    if(cible) cible.focus();
  }
}
function surRedimension(){ mesurer(); reglerCamera(); }

mesurer(); reglerCamera();
cv.addEventListener('pointermove', surPointeur);
cv.addEventListener('pointerleave', ()=>{ survol = null; if(bulle) bulle.classList.remove('visible'); });
cv.addEventListener('click', surClic);
if(btnPasser) btnPasser.addEventListener('click', arriver);
if(btnEntrer) btnEntrer.addEventListener('click', ()=> sortir());
document.addEventListener('keydown', surTouche, true);
window.addEventListener('resize', surRedimension);
// Molette ou balayage vers le haut sur la carte de fin : on entre.
boite.addEventListener('wheel', ev=>{ if(fini && ev.deltaY > 20) sortir(); }, { passive: true });
if(document.fonts && document.fonts.load) document.fonts.load("100px Anton").catch(()=>{});


// Réglage : /?intro=1&t=3.2 fige l'image à 3,2 s.
const mT = /[?&]t=([\d.]+)/.exec(location.search);
if(mT){ fige = true; t = parseFloat(mT[1]); if(t >= DUREE) arriver(); }

/* ---------- Le son (js/intro-son.js) ----------
   Les navigateurs interdisent de jouer du son avant un geste du visiteur : le
   bouton « Son » (ou un simple toucher sur l'image) le lance, calé sur l'image. */
const btnSon = document.getElementById('introSon');
let audio = null, bande = null, sonActif = false;
/* Instant où chaque ville s'allume (mêmes calculs que l'image), pour les notes. */
function calculerReveils(){
  const faits = villes.map(()=> -1);
  for(let x = T_ZENITH; x <= T_FIN; x += 1/90){
    const u = cadrage(x, [0,0,0]);
    const onde = Math.max(W, H)*1.25*Math.pow(rampe(u, 0.46, 0.9), 1.5);
    if(onde <= 0 || dessus.s*KM >= 500) continue;
    const mtp = solVersEcran([0,0,0]);
    villes.forEach((v, i)=>{
      if(i === 0 || faits[i] >= 0) return;
      const q = solVersEcran(v.sol);
      if(Math.hypot(q[0]-mtp[0], q[1]-mtp[1]) <= onde) faits[i] = x;
    });
  }
  return faits.filter(x=> x >= 0).sort((a, b)=> a - b);
}
const reperesSon = ()=> ({ T_ARRET, T_TIR, T_PANIER, T_ZENITH, T_FIN,
  reveils: calculerReveils() });
function majBoutonSon(){
  if(!btnSon) return;
  btnSon.classList.toggle('actif', sonActif);
  btnSon.setAttribute('aria-pressed', sonActif ? 'true' : 'false');
  const texte = btnSon.querySelector('span');
  if(texte) texte.textContent = sonActif ? 'Son activé' : 'Activer le son';
}
function lancerBande(){
  if(!audio || !window.EbokIntroSon || sorti || !sonActif || fige) return;
  if(bande) bande.arreter(0.05);
  bande = null;
  if(t > T_FIN + 2.5) return;                          // l'intro est finie : rien à jouer
  bande = window.EbokIntroSon.composer(audio, reperesSon(), { origine: audio.currentTime - t, depuis: t, fin: T_FIN + 3.2 });
}
function activerSon(){
  if(sorti) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return;
  try{
    if(!audio) audio = new AC();
    sonActif = true; majBoutonSon();
    const pret = ()=>{ if(audio.state === 'running' && !bande) lancerBande(); };
    const p = audio.resume(); if(p && p.then) p.then(pret).catch(()=>{});
    pret();
  }catch(e){ sonActif = false; majBoutonSon(); }
}
function couperSon(fondu){
  sonActif = false; majBoutonSon();
  if(bande){ bande.arreter(fondu); bande = null; }
}
(function(){
  let choix = '1';
  try{ choix = localStorage.getItem('ebok-intro-son') || '1'; }catch(e){}
  const charger = document.createElement('script');
  charger.src = '/js/intro-son.js'; charger.async = true;
  charger.onload = ()=>{ if(sonActif && audio && audio.state === 'running' && !bande) lancerBande(); };
  document.head.appendChild(charger);
  if(btnSon) btnSon.addEventListener('click', ()=>{
    if(sonActif) couperSon(0.2); else activerSon();
    try{ localStorage.setItem('ebok-intro-son', sonActif ? '1' : '0'); }catch(e){}
  });
  // Un toucher sur l'image pendant l'action lance aussi le son (sauf s'il a été coupé).
  cv.addEventListener('pointerdown', ()=>{ if(!fini && !sonActif && choix !== '0') activerSon(); });
  // Si le navigateur l'autorise déjà (visiteur habitué du site), le son part seul.
  if(choix !== '0' && !mT){
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      if(AC){ audio = new AC(); if(audio.state === 'running'){ sonActif = true; majBoutonSon(); } }
    }catch(e){}
  }
})();

window.EbokIntro = {
  duree: DUREE, reperes: { T_ARRET, T_TIR, T_PANIER, T_ZENITH, T_FIN }, reperesSon,
  aller(x){ fige = true; fini = false; boite.classList.remove('fin'); t = x; if(t >= DUREE) arriver(); },
  /* Dessine tout de suite l'image de l'instant x (montage de vidéos, réglages). */
  image(x){ fige = true; t = x; rendre(x); majHud(x); },
  passer: arriver, entrer: sortir
};
dernier = performance.now();
image = requestAnimationFrame(boucle);

} // lancer
})();
