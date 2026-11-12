/* =========================================================
   EBOK — INTRO : la bande-son
   ---------------------------------------------------------
   Tout est fabriqué ici, à la volée (Web Audio) : aucun fichier son, aucun
   échantillon emprunté. Chargé à la demande par js/intro.js, seulement quand
   le visiteur active le son.

     - un rythme hip-hop « au loin » (grosse caisse, caisse claire, charleston,
       basse, piano électrique), étouffé comme s'il venait d'une enceinte posée
       au bord du terrain ;
     - les bruits de l'action : crissement des appuis, départ du tir, le
       « swish » du filet, les rebonds du ballon ;
     - le vent quand la caméra s'élève, une note à chaque ville qui s'allume,
       un accord à l'arrivée sur la carte.

   Le tempo est calé sur l'image : le panier tombe pile sur un temps fort.

   EbokIntroSon.composer(contexte, reperes, options) programme toute la bande
   sur l'horloge du contexte audio et rend { arreter(fondu) }.
     reperes : T_ARRET, T_TIR, T_PANIER, T_ZENITH, T_FIN, rebonds[], reveils[]
     options : origine (heure du contexte où l'intro est à t = 0),
               depuis  (t de l'intro à partir duquel on joue),
               fin     (t où la musique s'éteint)
   ========================================================= */
(function(){
'use strict';

function composer(ac, R, options){
  const o = options || {};
  const origine = o.origine != null ? o.origine : ac.currentTime;
  const depuis = o.depuis || 0;
  const fin = o.fin != null ? o.fin : R.T_FIN + 3.2;
  const h = t=> origine + t;                         // temps de l'intro → horloge audio
  const jouable = t=> t >= depuis - 0.02 && t < fin;

  /* ----- Sortie : un limiteur doux, pour ne jamais saturer ----- */
  const sortie = ac.createGain();
  sortie.gain.value = 0.9;
  const limiteur = ac.createDynamicsCompressor();
  limiteur.threshold.value = -10; limiteur.knee.value = 8; limiteur.ratio.value = 8;
  limiteur.attack.value = 0.004; limiteur.release.value = 0.18;
  sortie.connect(limiteur); limiteur.connect(ac.destination);

  /* ----- Matières premières ----- */
  let graine = 3434;
  const hasard = ()=> (graine = (graine*16807) % 2147483647) / 2147483647;
  const bruit = ac.createBuffer(1, Math.floor(ac.sampleRate*2), ac.sampleRate);
  (function(){ const d = bruit.getChannelData(0); for(let i = 0; i < d.length; i++) d[i] = hasard()*2 - 1; })();
  // Réverbération : une petite cour entre des immeubles.
  const cour = ac.createConvolver();
  (function(){
    const n = Math.floor(ac.sampleRate*1.5), b = ac.createBuffer(2, n, ac.sampleRate);
    for(let c = 0; c < 2; c++){ const d = b.getChannelData(c); for(let i = 0; i < n; i++) d[i] = (hasard()*2 - 1)*Math.pow(1 - i/n, 3.2); }
    cour.buffer = b;
  })();
  const retour = ac.createGain(); retour.gain.value = 0.55;
  cour.connect(retour); retour.connect(sortie);

  /* ----- La musique passe par un filtre : elle vient « de loin » ----- */
  const musique = ac.createGain(), lointain = ac.createBiquadFilter();
  lointain.type = 'lowpass'; lointain.Q.value = 0.5;
  musique.connect(lointain); lointain.connect(sortie);
  const echoMusique = ac.createGain(); echoMusique.gain.value = 0.22;
  lointain.connect(echoMusique); echoMusique.connect(cour);
  const bruitages = ac.createGain(); bruitages.gain.value = 1;
  bruitages.connect(sortie);
  const echoBruitages = ac.createGain(); echoBruitages.gain.value = 0.3;
  bruitages.connect(echoBruitages); echoBruitages.connect(cour);

  const d0 = Math.max(depuis, 0);
  musique.gain.setValueAtTime(0.0001, h(d0));
  musique.gain.exponentialRampToValueAtTime(0.72, h(d0 + 0.4));
  musique.gain.setValueAtTime(0.72, h(Math.max(R.T_ZENITH, d0 + 0.5)));
  musique.gain.linearRampToValueAtTime(0.6, h(Math.max(R.T_FIN, d0 + 0.6)));
  musique.gain.setValueAtTime(0.6, h(Math.max(fin - 1.6, d0 + 0.7)));
  musique.gain.linearRampToValueAtTime(0.0001, h(Math.max(fin, d0 + 0.8)));
  // Plus la caméra monte, plus la musique s'éloigne ; elle revient à l'arrivée.
  lointain.frequency.setValueAtTime(1700, h(d0));
  lointain.frequency.setValueAtTime(1700, h(Math.max(R.T_ZENITH, d0)));
  lointain.frequency.exponentialRampToValueAtTime(520, h(Math.max(R.T_ZENITH + 2, d0 + 0.1)));
  lointain.frequency.exponentialRampToValueAtTime(2600, h(Math.max(R.T_FIN + 0.3, d0 + 0.2)));

  /* ----- Instruments ----- */
  const enveloppe = (g, t, niveau, attaque, chute)=>{
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(niveau, t + attaque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attaque + chute);
  };
  function ton(vers, t, type, f0, f1, niveau, attaque, chute){
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f0, t);
    if(f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + attaque + chute*0.8);
    enveloppe(g, t, niveau, attaque, chute);
    osc.connect(g); g.connect(vers);
    osc.start(t); osc.stop(t + attaque + chute + 0.05);
    return osc;
  }
  function souffle(vers, t, type, f0, f1, q, niveau, attaque, chute){
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = bruit; src.loop = true;
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t);
    if(f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + attaque + chute);
    enveloppe(g, t, niveau, attaque, chute);
    src.connect(f); f.connect(g); g.connect(vers);
    src.start(t, hasard()*1.5); src.stop(t + attaque + chute + 0.05);
  }
  const grosseCaisse = (t, n)=>{ ton(musique, t, 'sine', 135, 46, 1.0*n, 0.004, 0.3); souffle(musique, t, 'lowpass', 900, 300, 0.5, 0.25*n, 0.002, 0.03); };
  const caisseClaire = (t, n)=>{ souffle(musique, t, 'bandpass', 1900, 1500, 0.6, 0.6*n, 0.002, 0.17); ton(musique, t, 'triangle', 210, 160, 0.3*n, 0.002, 0.09); };
  const charleston = (t, n, ouvert)=> souffle(musique, t, 'highpass', 7200, 7200, 0.7, 0.2*n, 0.002, ouvert ? 0.2 : 0.04);
  const basse = (t, f, duree)=>{ ton(musique, t, 'triangle', f, f, 0.55, 0.012, duree); ton(musique, t, 'sine', f/2, f/2, 0.4, 0.012, duree); };
  const piano = (vers, t, notes, niveau, duree)=>{
    notes.forEach((f, i)=>{
      ton(vers, t + i*0.012, 'sine', f, f, niveau, 0.008, duree);
      ton(vers, t + i*0.012, 'triangle', f*2, f*2, niveau*0.16, 0.004, duree*0.35);
    });
  };

  /* ----- Le rythme : environ 100 à la minute, le panier sur un temps fort ----- */
  const TEMPS = R.T_PANIER/6, BALANCE = 0.09;        // les contretemps traînent un peu
  const LA = 55, DO = 65.41, FA = 43.65, SOL = 49;
  const accords = [
    [220, 261.63, 329.63, 392, 493.88],              // la mineur 9
    [174.61, 220, 261.63, 329.63, 392]               // fa majeur 9
  ];
  const nbTemps = Math.ceil(fin/TEMPS) + 1;
  for(let k = 0; k < nbTemps; k++){
    const t = k*TEMPS, m = Math.floor(k/4), b = k % 4;
    const contre = t + TEMPS*(0.5 + BALANCE);
    if(jouable(t)){
      if(b === 0 || b === 2) grosseCaisse(h(t), b === 0 ? 1 : 0.85);
      if(b === 1 || b === 3) caisseClaire(h(t), 0.9);
      charleston(h(t), 0.8, false);
      if(b === 0) basse(h(t), m % 2 ? FA : LA, TEMPS*1.3);
      if(b === 2) basse(h(t), m % 2 ? SOL : DO, TEMPS*0.9);
    }
    if(jouable(contre)){
      charleston(h(contre), 0.5, b === 3);
      if(b === 0) piano(musique, h(contre), accords[m % 2], 0.085, TEMPS*2.4);
      if(b === 2) grosseCaisse(h(contre + TEMPS*0.25), 0.6);
      if(b === 1) basse(h(contre), m % 2 ? FA : LA, TEMPS*0.4);
    }
  }
  // Un peu de craquement, comme un vieux disque.
  for(let t = d0; t < fin; t += 0.05 + hasard()*0.22){
    if(jouable(t)) souffle(musique, h(t), 'highpass', 3000, 3000, 0.5, 0.03 + hasard()*0.05, 0.001, 0.008);
  }

  /* ----- Les bruits de l'action ----- */
  if(jouable(R.T_ARRET)){                            // les appuis crissent avant le saut
    ton(bruitages, h(R.T_ARRET - 0.12), 'sawtooth', 2100, 2900, 0.035, 0.01, 0.08);
    ton(bruitages, h(R.T_ARRET + 0.02), 'sawtooth', 2500, 3300, 0.03, 0.01, 0.06);
  }
  if(jouable(R.T_TIR)) souffle(bruitages, h(R.T_TIR - 0.04), 'bandpass', 700, 1700, 0.8, 0.12, 0.05, 0.22);
  if(jouable(R.T_PANIER)){                           // le swish
    const t = h(R.T_PANIER);
    souffle(bruitages, t, 'bandpass', 6400, 3000, 1.1, 0.75, 0.006, 0.34);
    souffle(bruitages, t + 0.03, 'highpass', 2600, 2000, 0.6, 0.3, 0.004, 0.2);
    souffle(bruitages, t + 0.09, 'bandpass', 1500, 900, 1.4, 0.2, 0.01, 0.22);
    ton(bruitages, t + 0.02, 'sine', 74, 36, 0.65, 0.01, 0.8);   // l'onde part du panier
  }
  (R.rebonds || []).forEach((t, i)=>{                // le ballon retombe
    if(!jouable(t)) return;
    const n = Math.pow(0.62, i);
    ton(bruitages, h(t), 'sine', 120, 58, 0.5*n, 0.003, 0.13);
    souffle(bruitages, h(t), 'lowpass', 1100, 500, 0.6, 0.28*n, 0.002, 0.05);
  });

  /* ----- Le vent de l'ascension ----- */
  if(fin > R.T_ZENITH - 0.2 && depuis < R.T_FIN){
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = bruit; src.loop = true;
    f.type = 'bandpass'; f.Q.value = 0.55;
    const a = Math.max(R.T_ZENITH - 0.15, depuis);
    f.frequency.setValueAtTime(260, h(a));
    f.frequency.exponentialRampToValueAtTime(1150, h(R.T_ZENITH + 1.3));
    f.frequency.exponentialRampToValueAtTime(480, h(R.T_FIN + 0.4));
    g.gain.setValueAtTime(0.0001, h(a));
    g.gain.exponentialRampToValueAtTime(0.38, h(R.T_ZENITH + 0.9));
    g.gain.linearRampToValueAtTime(0.24, h(R.T_FIN - 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, h(R.T_FIN + 0.7));
    // Des rafales : le souffle n'est jamais tout à fait régulier.
    const rafale = ac.createOscillator(), force = ac.createGain();
    rafale.frequency.value = 0.9; force.gain.value = 0.1;
    rafale.connect(force); force.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(bruitages);
    src.start(h(a)); src.stop(h(R.T_FIN + 0.8)); rafale.start(h(a)); rafale.stop(h(R.T_FIN + 0.8));
    if(jouable(R.T_ZENITH)) souffle(bruitages, h(R.T_ZENITH - 0.1), 'bandpass', 220, 2600, 0.7, 0.3, 0.5, 0.7);
  }

  /* ----- Les villes s'allument : une note chacune ----- */
  const gamme = [659.25, 783.99, 880, 987.77, 1174.66, 1318.5, 1567.98, 1760, 1975.5];
  (R.reveils || []).forEach((t, i)=>{
    if(!jouable(t)) return;
    ton(bruitages, h(t), 'sine', gamme[i % gamme.length], gamme[i % gamme.length], 0.07, 0.006, 0.55);
    ton(bruitages, h(t), 'triangle', gamme[i % gamme.length]*2, gamme[i % gamme.length]*2, 0.012, 0.004, 0.2);
  });

  /* ----- L'arrivée sur la carte : un accord qui s'ouvre ----- */
  const arrivee = Math.ceil((R.T_FIN + 0.05)/TEMPS)*TEMPS;
  if(jouable(arrivee) && arrivee < fin - 0.3){
    piano(bruitages, h(arrivee), [220, 329.63, 392, 493.88, 659.25], 0.07, Math.min(2.8, fin - arrivee));
    ton(bruitages, h(arrivee), 'sine', 110, 55, 0.4, 0.008, 1.1);
  }

  return {
    arreter(fondu){
      const f = fondu == null ? 0.4 : fondu, t = ac.currentTime;
      try{
        sortie.gain.cancelScheduledValues(t);
        sortie.gain.setValueAtTime(sortie.gain.value, t);
        sortie.gain.linearRampToValueAtTime(0.0001, t + f);
      }catch(e){}
    }
  };
}

window.EbokIntroSon = { composer };
})();
