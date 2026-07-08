# 🏀 EBOK Event

**L'agenda collaboratif du basket français.** Tournois, camps, 3x3, détections, clinics, matchs de gala… repérés sur une carte de France interactive.

Site web responsive, thème sombre (identité streetball/urbain), sans framework — HTML / CSS / JS pur.

---

## 📁 Structure du projet

```
EBOK-EVENT/
├── public/                  # Le site (déployable tel quel)
│   ├── index.html           # Structure HTML des 4 pages (SPA)
│   ├── css/
│   │   └── styles.css        # Toute la mise en forme
│   ├── js/
│   │   ├── data.js           # Données : événements, couleurs, carte
│   │   ├── app.js            # Logique : nav, filtres, carte, recherche…
│   │   ├── services.js       # Couche API Firestore (prête, non branchée)
│   │   └── firebase-config.example.js  # Modèle de config Firebase
│   └── assets/               # Images (à venir)
├── backend/                 # Réservé (Cloud Functions, scripts d'import…)
├── package.json
├── .gitignore
└── README.md
```

Le code était initialement dans **un seul fichier HTML monolithique** ; il a été découpé en modules HTML / CSS / JS pour être maintenable, sans changer le comportement.

---

## 🚀 Lancer en local

Le site est 100 % statique — n'importe quel serveur de fichiers suffit.

```bash
# Option 1 : npm (télécharge http-server à la volée)
npm start                     # ouvre http://localhost:8080

# Option 2 : Python (aucune dépendance)
cd public && python3 -m http.server 8080
```

> Ouvrir `public/index.html` directement (`file://`) fonctionne aussi, mais un serveur local évite les surprises de cache et prépare le branchement Firebase.

---

## 🗺️ Ce qui fonctionne aujourd'hui

- **Accueil** : carrousel « à la une » (5 événements), carte de France SVG interactive (pins par type, tooltips, clic → détail), bascule Carte / Liste.
- **Filtres** : statut (À venir / Archives), ville, rayon, période (calendrier plage ou jour unique), type d'événement.
- **Recherche** : formulaire multi-critères + grille de résultats.
- **Publier** : formulaire diffuseur complet (infos, affiche, galerie, contact, options de visibilité).
- **Détail événement** : affiche, infos pratiques, galerie photos (lightbox), compteur de « curieux », boutons se renseigner / partager.

**Données actuelles** : 20 événements en dur dans `public/js/data.js`, 5 en avant.

---

## 🔜 Prochaines étapes (backend)

Le plan complet est dans `DEVELOPMENT_PLAN.md`. Résumé pour brancher Firebase :

1. **Créer un projet Firebase** (console.firebase.google.com) : activer Firestore + Authentication (Email/Password).
2. **Config** : copier `public/js/firebase-config.example.js` → `firebase-config.js` et y coller tes clés (le vrai fichier est ignoré par git).
3. **Migrer les données** : importer les 20 événements de `data.js` dans la collection `events`.
4. **Brancher la lecture** : dans `app.js`, remplacer l'usage direct de `const events` par `getAllEvents()` (voir `services.js`).
5. **Auth diffuseurs** puis **géolocalisation réelle** (Haversine) — phases 5 et 6 du plan.

`public/js/services.js` contient déjà les fonctions Firestore (`getAllEvents`, `createEvent`, `incrementViews`…) prêtes à l'emploi.

### Déploiement

Site statique → déployable sur **Firebase Hosting**, **GitHub Pages**, **Netlify** ou **Vercel** (dossier racine = `public/`).

---

## 🎨 Repères design

| | |
|---|---|
| Fond | `#17171A` (asphalte) |
| Texte | `#F3EEE2` (craie) |
| Accent | `#FF5722` (orange) |
| Titres | Anton · Corps : Work Sans · Labels : Space Mono |

Palette complète et code couleur par type d'événement : voir `EBOK_Event_Briefing.md`.
