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
│   └── import-event.js       # Assistant IA (OpenRouter/Gemini) — réservé admin
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
| `OPENROUTER_API_KEY` | Clé OpenRouter (assistant IA, fournisseur par défaut) | 🔒 oui |
| `OPENROUTER_MODEL` | *(optionnel)* modèle(s) OpenRouter, séparés par des virgules — essayés dans l'ordre (défaut : deux modèles gratuits avec vision) | non |
| `AI_PROVIDER` | *(optionnel)* `openrouter` (défaut) ou `gemini` | non |
| `GEMINI_API_KEY` | Clé Google AI Studio — requise seulement si `AI_PROVIDER=gemini` | 🔒 oui |
| `BLOB_READ_WRITE_TOKEN` | Stockage des affiches — **injectée automatiquement** en connectant un Blob store (Vercel → Storage) | 🔒 oui |
| `ADMIN_EMAILS` | *(optionnel)* emails admin additionnels, séparés par virgules | non |

> La clé Clerk **publishable** (`pk_live_…`) est **publique** et vit en dur dans
> `public/js/clerk.js` — c'est normal. Ne mets **jamais** `sk_…` ni `DATABASE_URL`
> dans le code ou dans le chat.

### Schéma

Le schéma `event` (tables `events`, `views`, `profiles`) est **créé
automatiquement** au premier appel API (`api/_lib.js` → `ensureSchema`). Aucun SQL
manuel à lancer.

### Hébergement des affiches (Vercel Blob)

Les affiches sont déposées comme **fichiers** sur Vercel Blob (`api/upload.js`), et non
stockées dans la base : le JSONB reste léger, et une vraie URL est indispensable à
l'aperçu au partage (`og:image` n'accepte pas un data-URI).

Pour l'activer : **Vercel → Storage** → créer un Blob store (ou ouvrir l'existant) →
le connecter au projet. `BLOB_READ_WRITE_TOKEN` est alors injectée automatiquement —
elle n'apparaît pas dans les variables saisies à la main. Redéploie ensuite.

Tant qu'aucun store n'est connecté, `/api/upload` répond 503 et l'app **retombe
proprement** sur le stockage en base : rien ne casse, les affiches s'affichent, mais
elles alourdissent la base et ne servent pas d'aperçu au partage.

Les affiches déjà enregistrées en base se rapatrient ensuite depuis
**Mon profil → Administration → Hébergement des affiches** (traitement par lots,
relançable sans risque).

---

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
fonction serverless récupère le contenu **côté serveur**, puis demande à un **modèle IA** de
structurer les infos ; le formulaire de publication est ensuite pré-rempli (le membre
relit, ajuste et publie — un événement de diffuseur reste en attente de validation).

- Code : `api/import-event.js` (fonction Vercel) + `lib/services/AIService.js` (fournisseur-agnostique) + carte « Assistant IA » en haut de la page de publication.
- **Pages web ouvertes** → bien. **Facebook / Instagram** → souvent bloqués (mur de connexion) : préfère une **capture d'écran**.
- Moteur par défaut : **OpenRouter** (modèle gratuit avec vision, voir `lib/services/providers/OpenRouterProvider.js`).
  Gemini reste disponible en alternative (`AI_PROVIDER=gemini`), mais **l'offre gratuite Gemini est bloquée pour les
  comptes UE / Royaume-Uni / Suisse** (429 dès la première requête) — OpenRouter n'a pas cette restriction car il
  interroge les modèles depuis ses propres serveurs.

### Activer (1 variable d'environnement)

1. Crée une clé **gratuite** sur **openrouter.ai** → *Keys* → *Create Key* (aucune carte bancaire requise).
2. Vercel → **Settings → Environment Variables** → ajoute `OPENROUTER_API_KEY` = ta clé.
3. Redéploie. Tant que la clé n'est pas définie, l'assistant renvoie un message d'erreur clair et le reste du site fonctionne normalement.

> Le modèle gratuit par défaut peut être retiré du catalogue OpenRouter avec le temps. Si l'assistant renvoie une
> erreur de configuration, vérifie la liste des modèles gratuits sur `openrouter.ai/models?max_price=0` et
> ajuste la variable `OPENROUTER_MODEL` en conséquence (aucune modif de code nécessaire).

### Quotas et modèles de repli

Les modèles `:free` sont **partagés entre tous les utilisateurs d'OpenRouter** : un `429` signifie
souvent que le fournisseur en amont est momentanément saturé, et **pas** que le quota du compte est
épuisé. L'assistant essaie donc les modèles de `OPENROUTER_MODEL` **dans l'ordre** jusqu'à ce que
l'un réponde ; le message d'erreur affiché reprend le motif exact renvoyé par OpenRouter, qui
permet de distinguer les deux cas.

Limites de l'offre gratuite OpenRouter : **20 requêtes/minute** et **50 requêtes/jour** (ce plafond
journalier passe à 1 000 dès 10 $ de crédits achetés une seule fois). Attention, **les requêtes en
échec comptent aussi** dans le quota journalier.

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
