/* EBOK — interrupteur de la proposition de design « v2 ».
   Chargé dans <head>, avant le premier affichage, pour éviter un clignotement.

     ebok.fr/?apercu=v2   → active la v2 sur CE navigateur (mémorisé)
     ebok.fr/?apercu=off  → revient au site actuel

   Sans ce réglage, rien ne change : css/v2.css et js/v2.js restent inertes. */
(function(){
  var CLE = 'ebok-ui';
  try{
    var demande = new URLSearchParams(location.search).get('apercu');
    if(demande === 'v2') localStorage.setItem(CLE, 'v2');
    else if(demande === 'off') localStorage.removeItem(CLE);
    if(localStorage.getItem(CLE) === 'v2') document.documentElement.setAttribute('data-ui', 'v2');
  }catch(e){ /* stockage indisponible : on reste sur le site actuel */ }
})();
