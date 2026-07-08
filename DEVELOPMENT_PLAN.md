# 🚀 EBOK Event — Plan de Développement pour Claude Code

## 📍 Contexte du Projet

**EBOK Event** est un agenda collaboratif du basketball français. MVP actuel = HTML/CSS/JS pur, 22 événements en hardcode, interface complète mais sans backend.

**État actuel :**
- ✅ Design complet (mode sombre)
- ✅ Tous les filtres fonctionnels (carte, recherche, calendrier)
- ✅ Carrousel "À la une" (Netflix-style)
- ✅ Formulaire publication événement
- ✅ Page détail événement avec compteur de visites
- ❌ Pas de backend (données hardcodées)
- ❌ Pas d'authentification
- ❌ Pas de paiement
- ❌ Pas de géolocalisation réelle

---

## 🎯 Objectifs pour Cette Session

### Phase 1 : Préparation Projet (2-3h)
**Objectif :** transformer HTML monolithique en structure professionnelle

```bash
# 1. Créer structure de projet
mkdir ebok-event
cd ebok-event

# 2. Créer les dossiers
mkdir -p src/{html,css,js,assets} public backend

# 3. Initialiser Git (optionnel mais recommandé)
git init

# 4. Initialiser npm
npm init -y
```

### Phase 2 : Refactoriser le Code (4-5h)
**Objectif :** séparer HTML/CSS/JS, le rendre maintenable

**À faire :**

1. **Créer `index.html`** (structure HTML seule)
   - Retirer tout le `<style>` et `<script>`
   - Garder seulement HTML + liens vers fichiers externes
   - Placer dans `public/`

2. **Créer `styles.css`** (tous les CSS)
   - Extraire du HTML
   - Placer dans `public/css/`
   - Lier dans `<head>` : `<link rel="stylesheet" href="css/styles.css">`

3. **Créer `app.js`** (tout le JS)
   - Extraire du HTML
   - Placer dans `public/js/`
   - Lier avant `</body>` : `<script src="js/app.js"></script>`

4. **Créer `data.js`** (tableau events + constantes)
   - Séparer `const events = [...]` et `const TYPE_COLORS = {...}`
   - Placer dans `public/js/data.js`
   - Importer dans `app.js` avant utilisation

**Résultat attendu :**
```
ebok-event/
├── public/
│   ├── index.html
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   ├── app.js
│   │   └── data.js
│   └── assets/
│       └── [images si besoin]
├── backend/
│   └── [à créer]
└── package.json
```

### Phase 3 : Mettre en Place Firebase (5-6h)
**Objectif :** avoir une vraie base de données

**À faire :**

1. **Installer Firebase**
   ```bash
   npm install firebase
   ```

2. **Créer `public/js/firebase-config.js`**
   ```javascript
   import { initializeApp } from 'firebase/app';
   import { getFirestore } from 'firebase/firestore';
   import { getAuth } from 'firebase/auth';

   const firebaseConfig = {
     apiKey: "YOUR_KEY",
     authDomain: "YOUR_DOMAIN",
     projectId: "YOUR_PROJECT",
     storageBucket: "YOUR_BUCKET",
     messagingSenderId: "YOUR_ID",
     appId: "YOUR_APP_ID"
   };

   export const app = initializeApp(firebaseConfig);
   export const db = getFirestore(app);
   export const auth = getAuth(app);
   ```

3. **Créer Firebase project** (via console.firebase.google.com)
   - Nom : "ebok-event"
   - Enable Firestore Database (test mode pour MVP)
   - Enable Authentication (Email/Password)
   - Copier config dans le fichier ci-dessus

4. **Créer collections Firestore :**
   - `events` (documents des événements)
   - `users` (profils diffuseurs)
   - `views` (comptage curieux par event)

5. **Migrer les données hardcodées**
   - Créer script d'import : lire `data.js`, uploader tous les events dans Firestore
   - Ou importer manuellement (22 events = 10min)

### Phase 4 : Connecter le Frontend à Firebase (6-8h)
**Objectif :** l'app lit/écrit via Firestore au lieu de hardcode

**À faire :**

1. **Créer `public/js/services.js`** (couche API)
   ```javascript
   import { db } from './firebase-config.js';
   import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

   // Récupérer tous les events
   export async function getAllEvents() {
     const q = collection(db, 'events');
     const snapshot = await getDocs(q);
     return snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
   }

   // Ajouter un event (depuis formulaire)
   export async function createEvent(eventData) {
     return await addDoc(collection(db, 'events'), eventData);
   }

   // Mettre à jour compteur vues
   export async function incrementViews(eventId) {
     // logique...
   }

   // etc.
   ```

2. **Remplacer appels `const events = [...]` par fetch Firebase**
   ```javascript
   // Au lieu de :
   // const events = [{...}, {...}];

   // Faire :
   let events = [];
   getAllEvents().then(data => {
     events = data;
     renderFeatured();
     buildMap();
     // etc.
   });
   ```

3. **Connecter le formulaire publication**
   - Au submit, appeler `createEvent(formData)`
   - Afficher confirmation + redirection

4. **Tester :** ajouter un event via formulaire, vérifier dans Firestore, ça apparaît sur la carte

### Phase 5 : Authentification Diffuseurs (4-5h)
**Objectif :** les diffuseurs se connectent

**À faire :**

1. **Créer page "Connexion" (`login.html`)**
   - Email + password
   - Bouton "S'inscrire"
   - Appeler Firebase Auth

2. **Créer page "Inscription"`
   - Email + password (x2)
   - Infos organisateur (nom, insta, etc.)
   - Créer user + document dans collection `users`

3. **Ajouter état authentification globale**
   ```javascript
   import { onAuthStateChanged } from 'firebase/auth';
   import { auth } from './firebase-config.js';

   let currentUser = null;
   onAuthStateChanged(auth, (user) => {
     currentUser = user;
     updateUIBasedOnAuth();
   });
   ```

4. **Protéger le formulaire création event**
   - Afficher seulement si connecté
   - Au submit, ajouter `userId: currentUser.uid` à l'event

5. **Créer "Mes événements" pour diffuseurs**
   - Lire events où `userId === currentUser.uid`
   - Afficher liste + boutons éditer/supprimer

### Phase 6 : Géolocalisation (3-4h)
**Objectif :** "événements près de moi" qui marche vraiment

**À faire :**

1. **Demander permission géolocalisation**
   ```javascript
   navigator.geolocation.getCurrentPosition(position => {
     const userLat = position.coords.latitude;
     const userLng = position.coords.longitude;
     // Sauvegarder localStorage
   });
   ```

2. **Ajouter lat/lng aux events (Firestore)**
   - Chaque event a `latitude`, `longitude`
   - Ou utiliser API Google Maps Geocoding pour convertir "Montpellier" → lat/lng

3. **Remplacer logique rayon km approximatif**
   - Utiliser Haversine formula (distance réelle entre deux points géo)
   - Filtrer events dans rayon de l'utilisateur

4. **Autocomplete ville avec Maps API**
   ```javascript
   // Utiliser Google Places API pour sugg. villes
   ```

---

## 📋 Checklist Étape par Étape

### Session 1 : Setup (2-3h)
- [ ] Créer dossiers projet
- [ ] Séparer HTML/CSS/JS en fichiers
- [ ] Vérifier que tout fonctionne encore

### Session 2 : Firebase Setup (3-4h)
- [ ] Créer Firebase project
- [ ] Installer SDK
- [ ] Créer collections Firestore
- [ ] Importer les 22 events

### Session 3 : Frontend → Firebase (4-5h)
- [ ] Créer `services.js`
- [ ] Remplacer `const events` par `getAllEvents()`
- [ ] Tester carte/recherche avec données Firestore

### Session 4 : Auth Diffuseurs (3-4h)
- [ ] Pages login/signup
- [ ] Auth Firebase
- [ ] "Mes événements" dashboard

### Session 5 : Géolocalisation (2-3h)
- [ ] Demander permission + stocker position
- [ ] Calcul distance réelle
- [ ] Autocomplete villes

### Session 6 : Polish (1-2h)
- [ ] Tester sur mobile
- [ ] Fixer bugs responsive
- [ ] Optimiser images
- [ ] Deploy (Firebase Hosting recommandé)

---

## 🔧 Commandes Utiles

```bash
# Installer dépendances
npm install firebase

# Développement local (si besoin serveur)
npm install -D http-server
npx http-server public/

# Build (optionnel, avec bundler plus tard)
# npm install -D vite
# npx vite build

# Deploy sur Firebase
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

---

## 📁 Fichiers à Créer/Modifier

### À créer :
- `public/index.html` (séparé)
- `public/css/styles.css` (tout le CSS)
- `public/js/app.js` (tout le JS)
- `public/js/data.js` (events + constantes)
- `public/js/firebase-config.js` (config Firebase)
- `public/js/services.js` (API Firebase)
- `public/login.html` (page connexion)
- `public/signup.html` (page inscription)
- `.gitignore` (ignorer `node_modules/`, `.env`)
- `.env` ou `firebase-config.js` (secrets Firebase)

### À modifier :
- `package.json` (ajouter scripts)

---

## ⚙️ Configuration Recommandée

### Firebase (Test Mode)
```
Rules :
allow read, write: if true;  // DANGER : prod seulement pour MVP

Collections :
- events {id, title, type, city, ...}
- users {id, email, name, insta, ...}
- views {eventId, count}
```

### Déploiement (optionnel pour MVP)
- **Frontend :** Firebase Hosting (gratuit, deploy en 1 sec)
- **Backend :** Firebase Cloud Functions (si besoin logique)

---

## 🚨 Pièges à Éviter

❌ **Ne pas :** Laisser clés Firebase en public → utiliser `.env` + variables d'env  
❌ **Ne pas :** Oublier index sur Firestore → ajouter si requêtes lentes  
❌ **Ne pas :** Pusher les events un par un → batch import si 100+  
❌ **Ne pas :** Async sans await → tous les fetch Firebase doivent être attendus

---

## 🎯 Points de Contrôle (Tester Après Chaque Phase)

1. **Après Phase 1** : HTML séparé charge, styles appliqués, JS exécuté
2. **Après Phase 2** : Firebase connecté, events chargent depuis Firestore
3. **Après Phase 3** : Formulaire crée un event dans Firestore, apparaît sur carte
4. **Après Phase 4** : Login/signup works, utilisateur peut créer event
5. **Après Phase 5** : Géolocalisation demandée, filtre rayon fonctionne
6. **Après Phase 6** : Tout sur mobile, page rapide, pas d'erreurs console

---

## 📚 Ressources Utiles

- **Firebase Docs :** https://firebase.google.com/docs
- **Firestore Data Model :** https://firebase.google.com/docs/firestore/data-model
- **Firebase Auth :** https://firebase.google.com/docs/auth/web/start
- **Haversine Distance :** https://www.movable-type.co.uk/scripts/latlong.html
- **Google Maps API :** https://developers.google.com/maps/documentation

---

## 🎬 Commandes Initiales à Exécuter Tout de Suite

```bash
# 1. Créer structure
mkdir -p ebok-event/public/{css,js,assets} ebok-event/backend
cd ebok-event

# 2. Init npm
npm init -y

# 3. Installer Firebase
npm install firebase

# 4. Créer .gitignore
echo "node_modules/" > .gitignore
echo ".env" >> .gitignore

# 5. Créer fichier config vide
touch public/js/firebase-config.js

# 6. Vérifier structure
tree  # ou : ls -R
```

---

## ✅ Validation Finale

Quand tout est fait :
- [ ] Tous les 22 events chargent depuis Firestore
- [ ] Filtres fonctionnent (carte, recherche, calendrier, géo)
- [ ] Diffuseurs peuvent créer/éditer/supprimer leurs events
- [ ] Compteur curieux s'incrémente (pas de dépendance localStorage)
- [ ] Mobile responsive et rapide
- [ ] Code séparé en modules logiques
- [ ] Déployé sur Firebase Hosting ou serveur personnel

---

**Bon développement ! 🚀 Claude Code va pouvoir exécuter ce plan étape par étape.**
