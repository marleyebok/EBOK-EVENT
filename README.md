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
│   │   ├── data.js           # Données de démo : événements, couleurs, carte
│   │   ├── app.js            # Logique : nav, filtres, carte, recherche…
│   │   ├── services.js       # Couche API (Neon via /api + Clerk) — mêmes signatures
│   │   ├── clerk.js          # Chargeur Clerk (identité unique de la galaxie EBOK)
│   │   └── clerk-init.js     # Branchement : expose EBOK_DATA / EBOK_AUTH à app.js
│   └── assets/               # Images
├── api/                      # Fonctions serverless Vercel (Neon + Clerk)
│   ├── _lib.js               # Client Neon, vérif token Clerk, schéma « event »
│   ├── events.js             # CRUD événements
│   ├── views.js              # Compteurs de « curieux »
│   ├── account.js            # Session, profil diffuseur, favoris, liste membres
│   ├── migrate.js            # Migration ponctuelle Firestore → Neon (admin)
│   └── import-event.js       # Assistant IA (Gemini) — réservé admin
├── package.json
├── vercel.json
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

> Ouvrir `public/index.html` directement (`file://`) fonctionne aussi, mais un serveur local évite les surprises de cache. Les fonctions `/api` (Neon/Clerk) ne tournent que sur Vercel (ou `vercel dev`).

---

## 🗺️ Ce qui fonctionne aujourd'hui

- **Accueil** : carrousel « à la une » (5 événements), carte de France SVG interactive (pins par type, tooltips, clic → détail), bascule Carte / Liste.
- **Filtres** : statut (À venir / Archives), ville, rayon, période (calendrier plage ou jour unique), type d'événement.
- **Recherche** : formulaire multi-critères + grille de résultats.
- **Publier** : formulaire diffuseur complet (infos, affiche, galerie, contact, options de visibilité). **L'événement publié apparaît immédiatement** sur la carte, dans la liste et la recherche (en mémoire tant que Neon n'est pas branché ; enregistré en base ensuite).
- **Détail événement** : affiche, infos pratiques, galerie photos (lightbox), compteur de « curieux », boutons se renseigner / partager.

**Données actuelles** : 20 événements en dur dans `public/js/data.js`, 5 en avant.

---

## 🔌 Base de données : Neon + Clerk

L'app utilise la **base Neon partagée de la galaxie EBOK** (schéma `event`) via des
fonctions serverless `/api/*`, et **Clerk** pour l'identité (compte unique de la
galaxie, `clerk.ebok.fr`). Tant que la base n'est pas configurée, le site
fonctionne sur les **données de démo** de `data.js` (aucune casse).

### Variables d'environnement (Vercel → Settings → Environment Variables)

| Variable | Rôle | Secret ? |
|---|---|---|
| `DATABASE_URL` | Chaîne de connexion Neon (base partagée) | 🔒 oui |
| `CLERK_SECRET_KEY` | Clé serveur Clerk (`sk_live_…`) — vérifie les tokens | 🔒 oui |
| `GEMINI_API_KEY` | Clé Google AI Studio (assistant IA) | 🔒 oui |
| `ADMIN_EMAILS` | *(optionnel)* emails admin additionnels, séparés par virgules | non |

> La clé Clerk **publishable** (`pk_live_…`) est **publique** et vit en dur dans
> `public/js/clerk.js` — c'est normal. Ne mets **jamais** `sk_…` ni `DATABASE_URL`
> dans le code ou dans le chat.

### Schéma

Le schéma `event` (tables `events`, `views`, `profiles`) est **créé
automatiquement** au premier appel API (`api/_lib.js` → `ensureSchema`). Aucun SQL
manuel à lancer.

### Migrer les événements existants (depuis Firestore)

Une fois les variables d'env en place et connecté en admin, un `POST /api/migrate`
rapatrie automatiquement les fiches `events` + compteurs `views` depuis l'ancien
Firestore (lecture publique) vers Neon. Idempotent (relançable sans risque).

```bash
# token = jeton de session Clerk (voir README, section migration)
curl -X POST https://<preview>.vercel.app/api/migrate \
  -H "Authorization: Bearer <TOKEN_CLERK_ADMIN>"
```

## 👤 Comptes diffuseurs & administration

L'authentification (email + Google) est gérée par le **widget Clerk** (bouton
« Se connecter » de la barre du haut).

- **Diffuseur** : se connecte via Clerk, publie des événements (mis **en attente de
  validation**), les gère dans **« Mes événements »**.
- **Public** : ne voit que les événements **validés** (`status: approved`).
- **Admin** : voit **tous** les événements, peut les **valider** / **supprimer**, et
  publie directement en ligne.

### Être admin

Les droits admin sont reconnus **côté serveur** à partir de l'e-mail Clerk. L'email
propriétaire `marley.ebok@gmail.com` est admin **d'office** (constante
`ADMIN_EMAILS` dans `api/_lib.js`). Pour ajouter un admin, ajoute son email à la
variable d'env `ADMIN_EMAILS` sur Vercel (aucune modif de code).

> La sécurité (qui peut créer / modifier / supprimer) est vérifiée dans les
> fonctions `/api` : un diffuseur ne touche qu'à ses propres événements, seul
> l'admin peut tout gérer. « Zéro miroir » : e-mail et nom sont lus en direct
> depuis Clerk, jamais copiés en base.

---

## 🤖 Assistant IA — import d'un événement depuis un lien

Sur la page **« Publie ton événement »**, tout membre connecté peut coller le **lien** d'un
événement (site web, billetterie…) **ou déposer une image** (affiche, capture d'écran). Une
fonction serverless récupère le contenu **côté serveur**, puis demande à **Google Gemini**
de structurer les infos ; le formulaire de publication est ensuite pré-rempli (le membre
relit, ajuste et publie — un événement de diffuseur reste en attente de validation).

- Code : `api/import-event.js` (fonction Vercel, sans dépendance npm) + carte « Assistant IA » en haut de la page de publication.
- **Pages web ouvertes** → bien. **Facebook / Instagram** → souvent bloqués (mur de connexion) : préfère une **capture d'écran**.
- Moteur : **Gemini Flash** via Google AI Studio — **gratuit** dans les limites quotidiennes de l'offre gratuite.

### Activer (1 variable d'environnement)

1. Crée une clé **gratuite** sur **aistudio.google.com** → *Get API key* (aucune carte bancaire requise).
2. Vercel → **Settings → Environment Variables** → ajoute `GEMINI_API_KEY` = ta clé.
3. Redéploie. Tant que la clé n'est pas définie, l'assistant renvoie un message d'erreur clair et le reste du site fonctionne normalement.

> L'endpoint valide le **jeton de session Clerk** de l'appelant et vérifie que son
> e-mail est admin : l'assistant IA est **réservé à l'administrateur**.

### Étape suivante du plan

**Géolocalisation réelle** (distance Haversine + autocomplétion de ville) — détaillé dans `DEVELOPMENT_PLAN.md`.

### Déploiement

Déployé sur **Vercel** (site statique `public/` + fonctions `/api`). Cible : `event.ebok.fr`.

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
