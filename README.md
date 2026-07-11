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

2. **Être admin** : les emails propriétaires sont admins **d'office**. Ils sont
   déclarés à **deux** endroits, qui doivent rester synchronisés :
   - `public/js/services.js` → constante `ADMIN_EMAILS` (badge et écran admin) ;
   - `firestore.rules` → fonction `isAdminEmail` (droits réels de validation /
     suppression).

   Connecte-toi avec cet email (par mot de passe **ou** Google, peu importe l'UID) :
   le badge **Admin** apparaît dans la barre du haut. Pour ajouter un admin,
   ajoute son email aux **deux** listes puis republie les règles Firestore.

   > Alternative sans toucher au code : créer une collection `admins` et y ajouter
   > un document dont l'**ID est l'UID** du compte (Authentication → Users). L'email
   > reste le plus simple car il ne dépend pas de l'UID (qui change entre un compte
   > email/mot de passe et un compte Google).

> La sécurité (qui peut créer / modifier / supprimer) est verrouillée par `firestore.rules` : un diffuseur ne touche qu'à ses propres événements, seul l'admin peut tout gérer.

---

## 🤖 Assistant IA — import d'un événement depuis un lien

Dans l'espace **Administration**, l'admin peut coller le lien d'un événement (site web,
billetterie…). Une fonction serverless récupère la page **côté serveur**, en extrait
l'affiche et le texte, puis demande à **Claude** de structurer les infos ; le formulaire
de publication est ensuite pré-rempli (l'admin relit et publie).

- Code : `api/import-event.js` (fonction Vercel) + carte « Assistant IA » dans le profil admin.
- **Pages web ouvertes** → bien. **Facebook / Instagram** → souvent bloqués (mur de connexion) : peu fiable.

### Activer (1 variable d'environnement)

1. Crée une clé API sur **console.anthropic.com** (facturation à l'usage, quelques centimes par import).
2. Vercel → **Settings → Environment Variables** → ajoute :
   - `ANTHROPIC_API_KEY` = ta clé (obligatoire)
   - `ADMIN_EMAILS` = emails admin séparés par des virgules (optionnel, défaut : `marley.ebok@gmail.com`)
3. Redéploie. Tant que la clé n'est pas définie, l'assistant renvoie un message d'erreur clair et le reste du site fonctionne normalement.

> L'endpoint est réservé aux administrateurs : il valide le **jeton Firebase** de l'appelant et vérifie son email avant tout appel à l'IA.

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

## 🧭 Idées / prochaines étapes (backlog)

- 🗺️ **Répertoire des terrains 3x3 & playgrounds de France** — recenser les playgrounds (comme il en existe déjà ailleurs) et les afficher sur la carte avec l'option « autour de moi ». Fort potentiel communautaire.
- 🙋 **« J'y vais »** — compteur de participants intéressés par événement (preuve sociale, prépare la billetterie).
- 📅 **Ajouter à mon agenda** — export .ics (Google/Apple Agenda).
- 🔔 **Alertes email** — « préviens-moi des events *type* près de *ville* » (nécessite un backend d'envoi : Cloud Functions + service mail type SendGrid).
- 💬 **Avis / discussion** — questions à l'organisateur avant l'event, avis sur les éditions passées (nécessite de la modération admin).
- 🎟️ **Billetterie / inscriptions** (plus tard) — liens type Ticketmaster avec commission.
