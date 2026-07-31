/* =========================================================
   EBOK Event — DONNÉES
   Constantes de données pures : posters, événements, couleurs,
   silhouette de la carte. Chargé AVANT app.js.
   ========================================================= */
/* Affiche de démonstration. Elle était encodée en base64 dans ce fichier :
   181 des 198 Ko de data.js, téléchargés par chaque visiteur avant le premier
   affichage, pour une image qui ne sert qu'au mode démo. */
const POSTER_LIGUE_C = "/assets/demo-ligue-c.jpg";

const TODAY = new Date().toISOString().slice(0,10);

const VIEW_SEEDS = {
  "ligue-c":1842, "asg-idf":634, "camp-lyon":512, "trip-nice":389,
  "summer-toulouse":701, "camp-nantes":276, "show-strasbourg":458,
  "spring-cup-bordeaux":940, "winter-jam-lille":612,
  "3x3-open-paris":2156, "3x3-start-lyon":687, "3x3-growth-marseille":845,
  "camp-asvel-lyon":1203, "camp-cholet-womens":456, "clinic-parker-nba":3890,
  "detection-nbb":1567, "gala-match-all-stars":5234, "handibasket-toulouse":234,
  "tournoi-nantes-juniors":789, "voyage-basket-corse":412
};

const TYPE_COLORS = {
  "Tournoi":"#FF5722",
  "Camp":"#1F8F6B",
  "Voyage":"#FFC93C",
  "All-Star Game":"#E8483A",
  "Show":"#9D6FFF",
  "Détections":"#FF9800",
  "Clinic Coachs":"#2196F3",
  "Circuit 3x3":"#4CAF50",
  "Handibasket":"#9C27B0",
  "Matchs de Gala":"#F44336",
  "Divers":"#607D8B"
};

// `let` (et non `const`) : la liste peut être remplacée au chargement
// par les données venues de Firebase (voir app.js → renderAll / EBOK.setEvents).
let events = [
  {
    id:"ligue-c",
    title:"La Ligue C",
    type:"Tournoi",
    featured:true,
    city:"Montpellier",
    lieu:"Gymnase Jean Bouin, Montpellier",
    region:"Occitanie",
    x:383, y:459,
    dateStart:"2026-06-27",
    dateEnd:"2026-07-04",
    sexe:"Masculin",
    age:"Séniors",
    niveau:"Confirmé",
    poster:POSTER_LIGUE_C,
    description:"Tournoi ligue d'été qui se joue du 27 juin au 4 juillet 2026 au gymnase Jean Bouin de Montpellier. Phases de qualification tous les soirs à 19h, demi-finales le 3 juillet et finale le 4 juillet. Organisé par Courtcuts x Mosson Basket, en partenariat avec Montpellier Basket, la Fédération Française de Basketball, B5 et Sport Basket.",
    infos:{
      adresse:"Gymnase Jean Bouin, Montpellier",
      horaires:"Ouverture des portes 18h30 · Matchs tous les soirs à 19h",
      buvette:"Buvette sur place (boissons fraîches, snacks)",
      reservation:"Entrée libre, places debout — arrivée conseillée avant 18h45 les soirs de phase finale"
    },
    gallery:[
      {caption:"Ligue C — Édition 2025", color:"#FF5722"},
      {caption:"Finale 2025", color:"#1F8F6B"},
      {caption:"Ambiance Jean Bouin", color:"#9D6FFF"}
    ],
    org:{name:"Ligue C — by Courtcuts x Mosson Basket", insta:"LigueCourcuts", site:"http://taap.it/Qb1jJQx", tel:"", email:""}
  },
  {
    id:"asg-idf",
    title:"All-Star Game Île-de-France",
    type:"All-Star Game",
    city:"Paris",
    lieu:"COSEC Binet, Paris 19e",
    region:"Île-de-France",
    x:322, y:148,
    dateStart:"2026-07-11",
    dateEnd:"2026-07-11",
    sexe:"Mixte",
    age:"Séniors",
    niveau:"Confirmé",
    poster:null,
    description:"Soirée all-star game réunissant les meilleurs profils street d'Île-de-France : concours de dunks, 3 points contest et match des étoiles devant le public parisien.",
    infos:{
      adresse:"COSEC Binet, 135 rue Curial, 75019 Paris",
      horaires:"Portes 19h · Concours 19h30 · Match des étoiles 21h",
      buvette:"",
      reservation:"Billetterie en ligne conseillée, places limitées"
    },
    gallery:[
      {caption:"Dunk Contest 2025", color:"#E8483A"},
      {caption:"Public COSEC Binet", color:"#FFC93C"}
    ],
    org:{name:"Paris Street Basket", insta:"parisstreetbasket", site:"https://parisstreetbasket.fr", tel:"", email:"contact@parisstreetbasket.fr"}
  },
  {
    id:"camp-lyon",
    title:"Camp d'été Ballers Academy",
    type:"Camp",
    city:"Lyon",
    lieu:"Halle Diagana, Lyon",
    region:"Auvergne-Rhône-Alpes",
    x:422, y:331,
    dateStart:"2026-07-13",
    dateEnd:"2026-07-17",
    sexe:"Mixte",
    age:"Ados",
    niveau:"Amateur",
    poster:null,
    description:"Camp d'entraînement sur 5 jours pour ados : fondamentaux, ateliers tir, préparation physique et tournoi de clôture le vendredi.",
    infos:{
      adresse:"Halle Diagana, 2 rue de la Poudrette, 69003 Lyon",
      horaires:"9h - 17h chaque jour, pause déjeuner incluse",
      buvette:"Repas du midi inclus dans l'inscription",
      reservation:"Inscription obligatoire — places limitées à 40 stagiaires"
    },
    gallery:[],
    org:{name:"Ballers Academy Lyon", insta:"ballersacademy.lyon", site:"", tel:"06 12 34 56 78", email:"academy@ballers.fr"}
  },
  {
    id:"trip-nice",
    title:"Basket Trip Riviera",
    type:"Voyage",
    city:"Nice",
    lieu:"Plages du Prado & terrains extérieurs, Nice",
    region:"Provence-Alpes-Côte d'Azur",
    x:520, y:453,
    dateStart:"2026-08-03",
    dateEnd:"2026-08-08",
    sexe:"Mixte",
    age:"Séniors",
    niveau:"Loisir",
    poster:null,
    description:"Une semaine sur la Côte d'Azur mêlant basket outdoor, plage et soirées : tournois 3x3 en journée, sessions libres et activités entre joueurs venus de toute la France.",
    infos:{
      adresse:"Départ groupé — hébergement communiqué à l'inscription",
      horaires:"Séjour du 3 au 8 août, sessions basket en matinée",
      buvette:"Petits-déjeuners et pots d'équipe inclus",
      reservation:"Sur inscription, places limitées à 24 participants"
    },
    gallery:[
      {caption:"Trip 2025 — Plage", color:"#FFC93C"},
      {caption:"3x3 outdoor", color:"#1F8F6B"},
      {caption:"Groupe 2025", color:"#FF5722"}
    ],
    org:{name:"HoopTrip France", insta:"hooptrip.fr", site:"https://hooptrip.fr", tel:"", email:"voyage@hooptrip.fr"}
  },
  {
    id:"summer-toulouse",
    title:"Summer League Toulouse",
    type:"Tournoi",
    city:"Toulouse",
    lieu:"Gymnase du Mirail, Toulouse",
    region:"Occitanie",
    x:285, y:459,
    dateStart:"2026-07-20",
    dateEnd:"2026-07-26",
    sexe:"Masculin",
    age:"Séniors",
    niveau:"Semi-pro / Pro",
    poster:null,
    description:"Compétition en poules puis phase finale à élimination directe, ouverte aux équipes régionales confirmées. Retransmission des demi-finales et de la finale en direct sur Instagram.",
    org:{name:"TLS Basket Events", insta:"tls.basket.events", site:"https://tlsbasket.fr", tel:"", email:""}
  },
  {
    id:"camp-nantes",
    title:"Camp Filles Ouest Basket",
    type:"Camp",
    city:"Nantes",
    lieu:"Complexe sportif Beaulieu, Nantes",
    region:"Pays de la Loire",
    x:164, y:245,
    dateStart:"2026-07-06",
    dateEnd:"2026-07-09",
    sexe:"Féminin",
    age:"Ados",
    niveau:"Amateur",
    poster:null,
    description:"Camp dédié aux jeunes joueuses : renforcement technique, préparation mentale et rencontre avec des joueuses professionnelles de la région.",
    org:{name:"Ouest Basket Filles", insta:"ouestbasketfilles", site:"", tel:"", email:"contact@ouestbasketfilles.fr"}
  },
  {
    id:"show-strasbourg",
    title:"Streetball Show Strasbourg",
    type:"Show",
    city:"Strasbourg",
    lieu:"Place Kléber, Strasbourg",
    region:"Grand Est",
    x:540, y:165,
    dateStart:"2026-07-18",
    dateEnd:"2026-07-18",
    sexe:"Mixte",
    age:"Séniors",
    niveau:"Loisir",
    poster:null,
    description:"Exhibition en plein cœur de ville : freestyle, dunks et animations musicales pour un show basket ouvert à tous les publics.",
    org:{name:"East Street Culture", insta:"eaststreetculture", site:"https://eaststreetculture.com", tel:"", email:""}
  },
  {
    id:"spring-cup-bordeaux",
    title:"Spring Cup Bordeaux",
    type:"Tournoi",
    city:"Bordeaux",
    lieu:"Palais des Sports, Bordeaux",
    region:"Nouvelle-Aquitaine",
    x:203, y:386,
    dateStart:"2026-05-09",
    dateEnd:"2026-05-10",
    sexe:"Mixte",
    age:"Séniors",
    niveau:"Amateur",
    poster:null,
    description:"Tournoi de printemps en 5x5, deux jours de poules et phase finale. Édition passée — les résultats et les photos restent consultables.",
    infos:{
      adresse:"Palais des Sports, Bordeaux",
      horaires:"9h - 19h les deux jours",
      buvette:"Buvette associative sur place",
      reservation:"Inscriptions closes pour cette édition"
    },
    gallery:[
      {caption:"Finale Spring Cup", color:"#1F8F6B"},
      {caption:"Remise des prix", color:"#FFC93C"}
    ],
    org:{name:"Bordeaux Basket Events", insta:"bxbasketevents", site:"", tel:"", email:"contact@bxbasketevents.fr"}
  },
  {
    id:"winter-jam-lille",
    title:"Winter Jam Lille",
    type:"Show",
    city:"Lille",
    lieu:"Grand Palais, Lille",
    region:"Hauts-de-France",
    x:350, y:44,
    dateStart:"2026-02-14",
    dateEnd:"2026-02-14",
    sexe:"Mixte",
    age:"Séniors",
    niveau:"Loisir",
    poster:null,
    description:"Show hivernal indoor avec concours de dunks et animations DJ. Édition passée.",
    org:{name:"North Street Culture", insta:"northstreetculture", site:"", tel:"", email:""}
  },
  {
    id:"3x3-open-paris",
    title:"3x3 FIBA Open — Paris Streetball",
    type:"Circuit 3x3",
    featured:true,
    city:"Paris",
    lieu:"Parc des Buttes-aux-Cailles, Paris 13e",
    region:"Île-de-France",
    x:322, y:148,
    dateStart:"2026-07-25",
    dateEnd:"2026-07-26",
    sexe:"Mixte",
    age:"Séniors",
    niveau:"Confirmé",
    poster:null,
    description:"Tournoi 3x3 FIBA Open de niveau élevé réunissant les meilleures équipes d'Île-de-France. Pools de poule puis phases finales dimanche. Diffusion live sur les réseaux.",
    infos:{
      adresse:"Parc des Buttes-aux-Cailles, Rue Daviel, 75013 Paris",
      horaires:"Samedi 9h-18h · Dimanche 9h-17h",
      buvette:"Bar sur place",
      reservation:"Équipes pré-inscrites, public libre"
    },
    gallery:[],
    org:{name:"Paris Streetball", insta:"parisstreetball3x3", site:"https://parisstreetball.fr", tel:"", email:""}
  },
  {
    id:"3x3-start-lyon",
    title:"3x3 Start Lyon — Découverte",
    type:"Circuit 3x3",
    city:"Lyon",
    lieu:"Parc de la Tête d'Or, Lyon",
    region:"Auvergne-Rhône-Alpes",
    x:422, y:331,
    dateStart:"2026-08-08",
    dateEnd:"2026-08-09",
    sexe:"Mixte",
    age:"Ados",
    niveau:"Amateur",
    poster:null,
    description:"Circuit 3x3 START pour débuter en compétition 3x3. Équipes mixtes bienvenues, ambiance fun et accessible. Initiation avant d'accéder aux niveaux supérieurs.",
    org:{name:"Lyon 3x3 Academy", insta:"lyon3x3", site:"", tel:"", email:"contact@lyon3x3.fr"}
  },
  {
    id:"3x3-growth-marseille",
    title:"3x3 Growth Tour — Marseille",
    type:"Circuit 3x3",
    city:"Marseille",
    lieu:"Plage du Prado, Marseille",
    region:"Provence-Alpes-Côte d'Azur",
    x:444, y:477,
    dateStart:"2026-07-11",
    dateEnd:"2026-07-12",
    sexe:"Mixte",
    age:"Séniors",
    niveau:"Amateur",
    poster:null,
    description:"3x3 Growth Tour sur les plages du Prado — compétition de milieu de gamme, tremplin vers l'Open. Format allégé, ambiance estivale.",
    org:{name:"Marseille Street Basket", insta:"marseillestreetbasket", site:"", tel:"", email:""}
  },
  {
    id:"camp-asvel-lyon",
    title:"Camp d'été ASVEL — Perfectionnement",
    type:"Camp",
    featured:true,
    city:"Lyon",
    lieu:"Pôle France ASVEL, Villeurbanne",
    region:"Auvergne-Rhône-Alpes",
    x:422, y:331,
    dateStart:"2026-07-27",
    dateEnd:"2026-07-31",
    sexe:"Mixte",
    age:"Ados",
    niveau:"Confirmé",
    poster:null,
    description:"Camp d'été du centre de formation ASVEL. Entraînement intensif avec les coachs du club, matchs amicaux, préparation physique et mentale pour les jeunes joueurs confirmés.",
    infos:{
      adresse:"Pôle France, 45 rue de la Tour, 69100 Villeurbanne",
      horaires:"8h-17h du lundi au vendredi",
      buvette:"Repas inclus",
      reservation:"Inscription obligatoire — sélection sur dossier"
    },
    gallery:[],
    org:{name:"ASVEL Basket", insta:"asvelbasket", site:"https://asvel.com", tel:"04 78 00 00 00", email:"formation@asvel.com"}
  },
  {
    id:"camp-cholet-womens",
    title:"Camp Feminin Cholet Basket",
    type:"Camp",
    city:"Cholet",
    lieu:"Aréna Metz Handball, Cholet",
    region:"Pays de la Loire",
    x:127, y:268,
    dateStart:"2026-08-10",
    dateEnd:"2026-08-14",
    sexe:"Féminin",
    age:"Ados",
    niveau:"Amateur",
    poster:null,
    description:"Camp d'entraînement féminin spécialisé. Développement technique, équipe encadrement des jeunes filles, renforcement de la confiance et du collectif.",
    org:{name:"Cholet Basket Féminin", insta:"choletbasketfem", site:"", tel:"", email:"camp@choletbasket.fr"}
  },
  {
    id:"clinic-parker-nba",
    title:"Clinic NBA avec Tony Parker",
    type:"Clinic Coachs",
    featured:true,
    city:"Villeurbanne",
    lieu:"Astroballe ASVEL, Villeurbanne",
    region:"Auvergne-Rhône-Alpes",
    x:422, y:331,
    dateStart:"2026-07-06",
    dateEnd:"2026-07-06",
    sexe:"Mixte",
    age:"Séniors",
    niveau:"Confirmé",
    poster:null,
    description:"Masterclass exceptionnelle avec la légende Tony Parker. Techniques de passes, lectures de jeu, gestion du leadership. Séance questions-réponses exclusive.",
    infos:{
      adresse:"Astroballe, 45 rue Garibaldi, 69100 Villeurbanne",
      horaires:"14h-17h",
      buvette:"Accès à la cafétéria",
      reservation:"Inscription en ligne limité à 150 places"
    },
    gallery:[],
    org:{name:"ASVEL Basketball", insta:"asvelbasket", site:"https://asvel.com", tel:"", email:""}
  },
  {
    id:"detection-nbb",
    title:"Détection NBB — Scouts Pro",
    type:"Détections",
    city:"Limoges",
    lieu:"Complexe Beaulieu, Limoges",
    region:"Nouvelle-Aquitaine",
    x:261, y:346,
    dateStart:"2026-06-20",
    dateEnd:"2026-06-20",
    sexe:"Mixte",
    age:"Séniors",
    niveau:"Confirmé",
    poster:null,
    description:"Séance de détection organisée par les scouts des clubs professionnels de la NBB. Évaluation des jeunes joueuses et joueurs en vue de contrats amateurs ou semi-pros.",
    org:{name:"Ligue Nationale de Basketball", insta:"lnboff", site:"https://nba.fr", tel:"", email:""}
  },
  {
    id:"gala-match-all-stars",
    title:"Matchs de Gala — Choc des Générations",
    type:"Matchs de Gala",
    city:"Paris",
    lieu:"AccorHotels Arena, Paris",
    region:"Île-de-France",
    x:322, y:148,
    dateStart:"2026-09-12",
    dateEnd:"2026-09-12",
    sexe:"Mixte",
    age:"Séniors",
    niveau:"Semi-pro / Pro",
    poster:null,
    description:"Soirée de gala avec matchs opposant les légendes du basketball français aux jeunes talents. Spectacle, dunks, tirs 3 points. Ambiance festive.",
    infos:{
      adresse:"AccorHotels Arena, 8 Boulevard Bercy, 75012 Paris",
      horaires:"19h-22h",
      buvette:"Restaurant et bar ouvert",
      reservation:"Billetterie en ligne disponible"
    },
    gallery:[],
    org:{name:"France Basketball Events", insta:"francebasketballevents", site:"", tel:"", email:""}
  },
  {
    id:"handibasket-toulouse",
    title:"Tournoi Handibasket — Open Sud",
    type:"Handibasket",
    city:"Toulouse",
    lieu:"Palais des Sports de Toulouse",
    region:"Occitanie",
    x:285, y:459,
    dateStart:"2026-06-12",
    dateEnd:"2026-06-14",
    sexe:"Mixte",
    age:"Séniors",
    niveau:"Confirmé",
    poster:null,
    description:"Tournoi régional handbasket réunissant les équipes du sud. Format inclusif, matchs compétitifs mais dans l'esprit du handbasket français.",
    org:{name:"Toulouse Handbasket", insta:"toulousehandbasket", site:"", tel:"", email:"contact@toulousehandbasket.fr"}
  },
  {
    id:"tournoi-nantes-juniors",
    title:"Tournoi Juniors Atlantique",
    type:"Tournoi",
    city:"Nantes",
    lieu:"Complexe des Oiseaux, Nantes",
    region:"Pays de la Loire",
    x:164, y:245,
    dateStart:"2026-07-19",
    dateEnd:"2026-07-21",
    sexe:"Mixte",
    age:"Ados",
    niveau:"Amateur",
    poster:null,
    description:"Tournoi U18 interrégional réunissant les meilleures équipes juniors. Trois jours de compétition intense, repas inclus, hébergement collectif possible.",
    infos:{
      adresse:"Complexe des Oiseaux, Boulevard de l'Université, 44000 Nantes",
      horaires:"Samedi 9h-20h · Dimanche/Lundi 9h-18h",
      buvette:"Restauration sur place",
      reservation:"Inscription par club obligatoire"
    },
    gallery:[],
    org:{name:"Nantes Métropole Basket", insta:"nantesmetroplebasket", site:"https://nmbasket.fr", tel:"", email:""}
  },
  {
    id:"voyage-basket-corse",
    title:"Voyage Basketball — Semaine Corse",
    type:"Voyage",
    featured:true,
    city:"Bastia",
    lieu:"Multisports Sporting, Bastia",
    region:"Corse",
    x:475, y:432,
    dateStart:"2026-08-16",
    dateEnd:"2026-08-22",
    sexe:"Mixte",
    age:"Séniors",
    niveau:"Loisir",
    poster:null,
    description:"Une semaine en Corse mêlant basketball, plage et découverte. Matchs amicaux contre des équipes locales, entraînements en plein air, sorties culturelles.",
    infos:{
      adresse:"Départ groupé de Paris",
      horaires:"Séjour 6 nuits / 7 jours",
      buvette:"Demi-pension incluse",
      reservation:"Inscription avant fin juin — places limitées à 25"
    },
    gallery:[],
    org:{name:"Baskettrip France", insta:"baskettripfr", site:"https://baskettrip.fr", tel:"", email:"voyage@baskettrip.fr"}
  }
];

// La silhouette et les villes de la carte sont désormais définies dans
// france-map.js (régions officielles projetées), chargé avant data.js.
