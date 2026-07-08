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
- **Publier** : formulaire diffuseur complet (infos, affiche, galerie, contact, options de visibilité). **L'événement publié apparaît immédiatement** sur la carte, dans la liste et la recherche (en mémoire tant que Firebase n'est pas branché ; enregistré en base ensuite).
- **Détail événement** : affiche, infos pratiques, galerie photos (lightbox), compteur de « curieux », boutons se renseigner / partager.

**Données actuelles** : 20 événements en dur dans `public/js/data.js`, 5 en avant.

---

## 🔌 Brancher Firebase (base de données réelle)

L'app est **déjà prête pour Firebase** : elle fonctionne sur les données locales tant que Firebase n'est pas activé, et bascule automatiquement dessus dès que tu ajoutes tes clés. Aucune réécriture nécessaire.

### Étapes (≈ 10 min)

1. **Créer le projet** sur [console.firebase.google.com](https://console.firebase.google.com) :
   - « Ajouter un projet » → nom `ebok-event`.
   - Menu **Firestore Database** → « Créer une base » → mode production, région `europe-west`.
   - Onglet **Règles** : coller le contenu de [`firestore.rules`](firestore.rules) → Publier.

2. **Récupérer tes clés** : Paramètres du projet (⚙️) → « Tes applications » → icône Web `</>` → copier l'objet `firebaseConfig`.

3. **Configurer le code** :
   ```bash
   cp public/js/firebase-config.example.js public/js/firebase-config.js
   ```
   Colle tes 6 valeurs dans `public/js/firebase-config.js` (ce fichier est ignoré par git — tes clés ne partent pas sur GitHub).

4. **Activer** : dans `public/index.html`, décommenter la ligne :
   ```html
   <script type="module" src="js/firebase-init.js"></script>
   ```

5. **Importer les 20 événements** (une seule fois) : ouvrir le site, puis dans la **console du navigateur** (F12) taper :
   ```js
   EBOK_IMPORT()
   ```
   Recharger : l'app lit désormais depuis Firebase. Le formulaire de publication écrit en base, et le compteur de « curieux » est partagé entre tous les visiteurs.

> `public/js/services.js` contient la couche API (`getAllEvents`, `createEvent`, `incrementViews`…). `firebase-init.js` fait le branchement. Rien d'autre à modifier.

## 👤 Comptes diffuseurs & administration

L'authentification par email/mot de passe est intégrée (modale de connexion/inscription dans la barre du haut).

- **Diffuseur** : crée un compte, publie des événements (mis **en attente de validation**), les gère dans **« Mes événements »** (voir, supprimer).
- **Public** : ne voit que les événements **validés** (`status: approved`).
- **Admin** : voit **tous** les événements (y compris en attente), peut les **valider** ou les **supprimer**, et publie directement en ligne.

### Activer côté Firebase (2 actions)

1. **Activer la connexion par email** : console Firebase → **Authentication** → « Get started » → onglet **Sign-in method** → activer **Email/Password**.

2. **Te déclarer admin** : console → **Firestore Database** → onglet **Données** →
   - crée une collection `admins`,
   - ajoute un document dont l'**ID est ton UID** (visible dans Authentication → Users après ta première connexion),
   - contenu du document : peu importe (ex. champ `email` = le tien).
   Recharge le site : le badge **Admin** apparaît dans la barre du haut.

> La sécurité (qui peut créer / modifier / supprimer) est verrouillée par `firestore.rules` : un diffuseur ne touche qu'à ses propres événements, seul l'admin peut tout gérer, et le statut admin ne se donne que via la console.

### Étape suivante du plan

**Géolocalisation réelle** (distance Haversine + autocomplétion de ville) — détaillé dans `DEVELOPMENT_PLAN.md`.

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
