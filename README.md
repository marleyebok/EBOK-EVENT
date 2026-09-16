# 🏀 EBOK Event

**L'agenda collaboratif du basket français.** Tournois, camps, 3x3, détections, clinics, matchs de gala… repérés sur une carte de France interactive.

Site web responsive, thème sombre (identité streetball/urbain), sans framework — HTML / CSS / JS pur.

---

## 📁 Structure du projet

```
EBOK-EVENT/
├── public/                   # Le site (déployable tel quel)
│   ├── index.html            # Structure HTML des 4 pages (SPA)
│   ├── compte/               # Espace compte (hors SPA)
│   │   ├── profil.html       # Profil diffuseur
│   │   └── general.html      # Identité & sécurité (composant Clerk)
│   ├── css/
│   │   └── styles.css        # Toute la mise en forme
│   ├── js/
│   │   ├── data.js           # Données de démo : événements, couleurs, carte
│   │   ├── app.js            # Logique : nav, filtres, carte, recherche…
│   │   ├── france-map.js     # Tracés SVG des régions
│   │   ├── cities-fr.js      # Villes de France (autocomplétion hors ligne)
│   │   ├── services.js       # Couche API (Neon via /api + Clerk)
│   │   ├── clerk.js          # Chargeur Clerk — ⚙️ config de l'instance
│   │   ├── clerk-init.js     # Branchement : expose EBOK_DATA / EBOK_AUTH à app.js
│   │   ├── compte-shell.js   # Coquille de l'espace compte (sidebar, portail)
│   │   ├── compte-profil.js  # Profil diffuseur
│   │   └── compte-general.js # Identité & sécurité
│   └── assets/               # Images, logo et favicons
│       ├── logo-source.png      # ⚠️ masters fournis par le client — ne pas
│       ├── favicon-source.png   #    écraser : tout le reste en dérive
│       ├── logo.png             # bandeau (généré, 560×108)
│       ├── favicon.png          # 32 px  ┐ générés depuis favicon-source,
│       ├── favicon-192.png      # 192 px ┤ fond transparent
│       └── apple-touch-icon.png # 180 px ┘ sauf iOS : fond blanc imposé
├── api/                      # Fonctions serverless Vercel (Neon + Clerk)
│   ├── _lib.js               # Client Neon, vérif token Clerk, schéma « event »
│   ├── events.js             # CRUD événements
│   ├── views.js              # Compteurs de « curieux »
│   ├── account.js            # Session, profil diffuseur, favoris, liste membres
│   ├── upload.js             # Dépôt d'images sur Vercel Blob
│   ├── evenement.js          # Métadonnées de partage par événement (Open Graph)
│   ├── migrate-posters.js    # Reprise des affiches stockées en base (ponctuel)
│   └── import-event.js       # Assistant IA (OpenRouter/Gemini) — réservé admin
├── lib/services/             # Assistant IA, indépendant du fournisseur
├── scripts/
│   └── verifier-clerk.mjs    # Contrôle l'instance Clerk (npm run clerk:check)
├── DEVELOPMENT_PLAN.md       # Feuille de route : ce qui reste à faire
├── EBOK_Event_Briefing.md    # Référence produit & design
├── package.json
├── vercel.json
├── .gitignore
└── README.md
```

Le code était initialement dans **un seul fichier HTML monolithique** ; il a été découpé en modules HTML / CSS / JS pour être maintenable, sans changer le comportement.

> **EBOK Event est un produit autonome.** Il ne dépend d'aucune autre application
> et n'en mentionne aucune. Seuls les comptes tournent encore sur une instance
> Clerk partagée — voir « Basculer vers une instance Clerk dédiée » plus bas.

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

L'app utilise une base **Neon** (Postgres serverless, schéma `event`) via des
fonctions serverless `/api/*`, et **Clerk** pour les comptes. Tant que la base
n'est pas configurée, le site fonctionne sur les **données de démo** de
`data.js` (aucune casse).

> Le schéma `event` est **entièrement isolé** : la base peut être partagée avec
> d'autres projets sans aucune conséquence pour EBOK Event. Les comptes, eux,
> tournent encore sur une instance Clerk partagée — voir « Basculer vers une
> instance Clerk dédiée ».

### Variables d'environnement (Vercel → Settings → Environment Variables)

| Variable | Rôle | Secret ? |
|---|---|---|
| `DATABASE_URL` | Chaîne de connexion Neon (base partagée) | 🔒 oui |
| `CLERK_SECRET_KEY` | Clé serveur Clerk (`sk_live_…`) — vérifie les tokens | 🔒 oui |
| `OPENROUTER_API_KEY` | Clé OpenRouter (assistant IA, fournisseur par défaut) | 🔒 oui |
| `OPENROUTER_MODEL` | *(optionnel)* modèle(s) OpenRouter, séparés par des virgules — essayés dans l'ordre, avant le repli sur le catalogue gratuit | non |
| `AI_PROVIDER` | *(optionnel)* `openrouter` (défaut) ou `gemini` | non |
| `GEMINI_API_KEY` | Clé Google AI Studio — requise seulement si `AI_PROVIDER=gemini` | 🔒 oui |
| `BLOB_READ_WRITE_TOKEN` | Stockage des affiches — **injectée automatiquement** en connectant un Blob store (Vercel → Storage) | 🔒 oui |
| `ADMIN_EMAILS` | *(optionnel)* emails admin additionnels, séparés par virgules | non |
| `RESEND_API_KEY` | Envoi des alertes e-mail (resend.com) — sans elle, aucune alerte n'est envoyée et le reste du site fonctionne | 🔒 oui |
| `ALERTS_FROM` | *(optionnel)* expéditeur des alertes (défaut : `EBOK Event <alertes@ebok.fr>`) | non |

> La clé Clerk **publishable** (`pk_live_…`) est **publique** et vit en dur dans
> `public/js/clerk.js` — c'est normal. Ne mets **jamais** `sk_…` ni `DATABASE_URL`
> dans le code ou dans le chat.

### Compteurs de « curieux »

Le compteur de chaque fiche est **public** : il doit fonctionner sans compte,
puisque la plupart des visiteurs n'en ont pas. Il est donc protégé autrement.

- Un même visiteur n'est compté **qu'une fois par jour et par événement**. Le
  chiffre affiché correspond à des curieux distincts, pas à des requêtes.
- Le navigateur ne peut plus fixer de valeur de départ : un compteur part de 1.
- Au-delà de 150 événements vus par un même visiteur dans la journée, le
  comptage s'arrête pour lui — les pages restent servies normalement.

**Vie privée :** aucune adresse IP n'est conservée. La déduplication repose sur
une empreinte SHA-256 tronquée de (jour + secret serveur + IP + navigateur),
donc non réversible et renouvelée chaque jour, purgée au bout de 7 jours. Elle
ne sert qu'à éviter les doublons et les abus, jamais à suivre quelqu'un — **à
mentionner dans la politique de confidentialité**.

### Alertes e-mail

Un membre décrit ce qui l'intéresse — régions, types d'événement, période — et
reçoit un e-mail dès qu'un événement correspondant est **validé**. Le
déclenchement est bien à la validation et non à la création : un événement de
diffuseur part « en attente », et alerter plus tôt annoncerait des événements
qu'on va peut-être refuser.

Un critère laissé vide ne filtre pas : une alerte sans région couvre toute la
France. Chaque envoi est tracé (`event.alert_sends`), donc revalider un
événement ne renvoie pas un second message. Un envoi qui échoue efface sa trace
et pourra être rejoué.

**Mettre en service :**

1. Créer un compte sur [resend.com](https://resend.com) (3 000 e-mails/mois gratuits)
2. Y ajouter **`event.ebok.fr`** comme domaine d'envoi (le sous-domaine, pas
   `ebok.fr`) : l'expéditeur reste cohérent avec le site, et la réputation
   d'envoi se construit à part du domaine principal
3. Créer chez OVH les enregistrements **SPF, DKIM et DMARC** affichés par Resend,
   tels quels — sans eux, les alertes partent en indésirables, et une réputation
   d'expéditeur abîmée est longue à réparer. Resend affiche « Verified » une fois
   la zone propagée (quelques minutes à quelques heures)
4. Créer une clé d'API en **Sending access**, la poser dans `RESEND_API_KEY` sur
   Vercel (Settings → Environment Variables, les trois environnements), puis
   redéployer

L'expéditeur par défaut est `EBOK Event <alertes@event.ebok.fr>` ; la variable
`ALERTS_FROM` permet d'en changer sans toucher au code.

Tant que la clé est absente, l'application le note dans les journaux et continue
de fonctionner normalement — aucune alerte n'est simplement envoyée.

Chaque e-mail porte un lien de désinscription à jeton, utilisable **sans être
connecté** : c'est ce qu'exige un message légitime, et ça protège la réputation
du domaine.

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

L'authentification (e-mail + Google) est **entièrement** gérée par le **widget
Clerk** (bouton « Se connecter » de la barre du haut). Il n'y a pas de
formulaire maison : inscription, connexion, vérification de l'e-mail, mot de
passe oublié et gestion des appareils viennent de Clerk. Le widget est habillé
aux couleurs du site et suit la bascule clair / sombre (voir `clerkAppearance()`
dans `public/js/clerk.js`).

Si Clerk est injoignable (bloqueur de contenu, coupure réseau), les boutons de
compte sont **grisés** et un bandeau l'explique — plutôt que des boutons qui ne
répondent pas.

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

### L'instance Clerk

EBOK Event a sa **propre instance Clerk**, indépendante. Le site pointe dessus
via `PUBLISHABLE_KEY` dans `public/js/clerk.js` (une seule ligne : le domaine de
l'instance est décodé de la clé, il n'y a pas de seconde valeur à garder
synchronisée). Le serveur utilise la clé secrète correspondante, dans la
variable d'environnement `CLERK_SECRET_KEY` sur Vercel.

L'instance est pour l'instant en **mode développement** (clé `pk_test_…`) : elle
fonctionne, mais limite le nombre de comptes et affiche un bandeau Clerk. Voir
« Passer en production » ci-dessous.

#### Changer d'instance

> ⚠️ **Les comptes ne se transfèrent pas** d'une instance Clerk à l'autre. Tous
> les membres devraient **se réinscrire**, et les événements déjà publiés
> perdraient le lien avec leur diffuseur (leur `user_id` pointerait vers un
> compte disparu). Les droits admin, eux, se retrouvent tout seuls :
> l'administrateur est reconnu par son **e-mail**, pas par son identifiant.

Réglages attendus d'une instance, sur [dashboard.clerk.com](https://dashboard.clerk.com) :

| Réglage | Valeur |
|---|---|
| Application name | `EBOK Event` |
| Email address | ✅ activé |
| Google | ✅ activé |
| Le reste (Facebook, Apple…) | ❌ laissé désactivé |

Puis, **dans cet ordre** (une seule mise en ligne, pas de coupure) :

1. **Vercel → Settings → Environment Variables** : modifier `CLERK_SECRET_KEY`
   avec la clé `sk_…` de la nouvelle instance. La coller **nue** — sans
   guillemets, sans `CLERK_SECRET_KEY=` devant. Cocher *Production*, *Preview*
   et *Development*.
2. Remplacer `PUBLISHABLE_KEY` dans `public/js/clerk.js` par la clé `pk_…`.
3. Pousser : le déploiement déclenché prend les deux changements d'un coup.

#### Passer en production *(quand le domaine est prêt)*

Une instance de développement fonctionne tout de suite, mais affiche un bandeau
« development mode » et limite le nombre de comptes. Pour passer en production :

1. Dans Clerk → **Domains**, ajouter `event.ebok.fr`.
2. Ajouter chez ton hébergeur DNS les enregistrements CNAME que Clerk indique
   (il vérifie automatiquement).
3. Reprendre la procédure « Changer d'instance » ci-dessus avec les clés
   `pk_live_…` / `sk_live_…`.

#### Vérifier

Un script contrôle l'instance à ta place :

```bash
npm run clerk:check                     # vérifie la clé actuellement dans le code
npm run clerk:check -- pk_test_xxxxx    # vérifie une clé AVANT de la coller
```

Il te dit si la clé est bien formée, si l'instance répond, si e-mail et Google
sont bien activés, si tu es en développement ou en production, et si ta clé
secrète correspond bien à ta clé publique. Chaque problème est accompagné du
chemin exact à suivre dans le tableau de bord Clerk.

Puis, à la main sur le site :

- [ ] Créer un compte depuis le site → il apparaît dans Clerk → **Users**
- [ ] Se déconnecter, se reconnecter
- [ ] Connexion avec Google
- [ ] Sur `/compte/general`, le composant Clerk s'affiche aux couleurs du site
- [ ] Avec `marley.ebok@gmail.com`, le badge **Admin** apparaît et l'assistant
      IA est visible sur la page de publication
- [ ] Publier un événement avec un compte non-admin → il part bien « en attente »

#### Et les événements déjà publiés ?

S'il y en a, leur `user_id` pointe vers des comptes disparus. Deux options :
les réattribuer en base une fois les diffuseurs réinscrits, ou les laisser
sous le compte admin (ils restent visibles et modifiables par l'admin).

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

> Le catalogue gratuit d'OpenRouter tourne sans prévenir. Quand tous les modèles de `OPENROUTER_MODEL`
> échouent, l'assistant interroge le catalogue et reprend avec d'autres modèles gratuits du moment —
> il n'y a donc normalement rien à ajuster. `OPENROUTER_MODEL` ne sert plus qu'à imposer un modèle précis.

### Si la clé est refusée

⚠️ Un message « refusé » qui **nomme un modèle** ne vient pas de la clé : certains modèles gratuits
sont réservés à des applications précises (« is only available on agentic harnesses »). L'assistant
enchaîne alors tout seul sur le suivant — il n'y a rien à faire.

Quand le motif ne nomme aucun modèle, c'est bien la clé, et les deux cas ne se règlent pas au même endroit :

- **401 — clé refusée.** La valeur lue n'est pas (ou n'est plus) une clé valable. À vérifier dans l'ordre :
  la variable s'appelle bien `OPENROUTER_API_KEY` ; elle est cochée pour l'environnement **Production**
  (pas seulement *Preview*) ; **un redéploiement a eu lieu depuis** — une variable ajoutée ne s'applique
  qu'au déploiement suivant ; la clé existe toujours dans *Keys* sur openrouter.ai. Les guillemets et
  espaces autour de la valeur sont retirés automatiquement, ce n'est plus une cause possible.
  Si le message signale que la valeur ne commence pas par `sk-or-`, c'est qu'une autre clé a été collée.
- **403 — accès bloqué.** La clé est reconnue mais l'appel est refusé. Regarde les réglages de
  confidentialité du compte OpenRouter : les modèles gratuits exigent d'autoriser l'usage des données
  (*Settings → Privacy*), sans quoi aucun point d'accès ne correspond.

### Quotas et modèles de repli

Les modèles `:free` sont **partagés entre tous les utilisateurs d'OpenRouter** : un `429` signifie
souvent que le fournisseur en amont est momentanément saturé, et **pas** que le quota du compte est
épuisé. L'assistant essaie donc les modèles de `OPENROUTER_MODEL` **dans l'ordre** jusqu'à ce que
l'un réponde, puis, s'ils échouent tous, **les modèles gratuits du catalogue** (et seulement ceux qui
lisent les images quand une affiche est envoyée). Le message d'erreur affiché reprend le motif exact
renvoyé par OpenRouter, qui permet de distinguer les deux cas.

Limites de l'offre gratuite OpenRouter : **20 requêtes/minute** et **50 requêtes/jour** (ce plafond
journalier passe à 1 000 dès 10 $ de crédits achetés une seule fois). Attention, **les requêtes en
échec comptent aussi** dans le quota journalier.

> L'endpoint valide le **jeton de session Clerk** de l'appelant et vérifie que son
> e-mail est admin : l'assistant IA est **réservé à l'administrateur**.

### Suite du plan

La feuille de route (ce qui est fait, ce qui reste, la dette technique connue)
vit dans **`DEVELOPMENT_PLAN.md`** — c'est la seule source de vérité.

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
