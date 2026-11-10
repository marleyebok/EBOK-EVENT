# 🚀 EBOK — Plan de développement

> Feuille de route unique du projet. Le `README.md` décrit **comment ça marche**
> (architecture, variables d'environnement, déploiement) ; ce fichier décrit
> **ce qui reste à faire**. `EBOK_Event_Briefing.md` reste la référence produit
> et design (palette, types d'événements, ton).
>
> 🚦 **Avant d'ouvrir le site au public**, dérouler la checklist de lancement
> plus bas. Les points « Obligations légales » sont bloquants.

**Dernière mise à jour :** septembre 2026

---

## 📍 Où en est le projet

EBOK Event est **en ligne et fonctionnel**, avec un vrai backend. Ce n'est plus
un MVP statique.

**Pile technique**

| Couche | Choix |
|---|---|
| Front | HTML / CSS / JS pur, sans framework ni build |
| Base de données | **Neon** (Postgres serverless), schéma `event` |
| Comptes | **Clerk** (e-mail + Google) |
| Fichiers | **Vercel Blob** (affiches, galeries) |
| Hébergement | **Vercel** — statique `public/` + fonctions `/api` |
| Assistant IA | **OpenRouter** (Gemini en alternative) |

> ⚠️ **Firebase n'a jamais été utilisé.** Les anciennes versions de ce plan
> décrivaient une architecture Firebase qui n'a pas été retenue. Si tu croises
> encore ce mot quelque part, c'est une coquille à corriger.

**Produit autonome.** EBOK Event ne dépend plus d'EBOK Basketball ni des autres
applications : plus de barre de navigation commune, plus de pied de page
partagé, plus de lecture du profil du site mère. Seul reste le point ci-dessous.

---

## ✅ Ce qui est fait

- [x] Découpage HTML / CSS / JS en modules
- [x] Base Neon + schéma créé automatiquement (`api/_lib.js` → `ensureSchema`)
- [x] Comptes Clerk : inscription, connexion, e-mail + Google, widget habillé aux couleurs du site
- [x] Rôles et droits vérifiés **côté serveur** : public / diffuseur / admin
- [x] CRUD événements complet + circuit de validation (`pending` → `approved`)
- [x] Compteurs de « curieux », favoris, profil membre
- [x] Profil diffuseur (`/compte/profil`) qui pré-remplit le formulaire de publication
- [x] Questionnaire de bienvenue à la première connexion : une question par carte,
      questions propres aux joueurs et aux structures, réseaux sociaux facultatifs
- [x] Affiches hébergées sur Vercel Blob + reprise des affiches stockées en base
- [x] Aperçu au partage et indexation par événement (`api/evenement.js` → Open Graph + schema.org)
- [x] Carte de France interactive, carte du monde pour l'étranger
- [x] Assistant IA d'import depuis un lien ou une image (réservé admin)
- [x] Autocomplétion de ville hors ligne (`cities-fr.js`) + repli sur la Base Adresse Nationale
- [x] Thème clair par défaut, bascule sombre conservée et mémorisée
- [x] Barre du haut compacte sur mobile et tablette (logo, loupe, +, menu) avec
      volet latéral : compte, navigation, favoris, mes événements, thème,
      déconnexion
- [x] Échappement des données d'événement dans les rendus HTML (XSS stocké)

---

## 🔁 Bascule vers ebok.fr (10/11/2026)

La marque devient **EBOK** (« L'agenda du basket ») et le site passe de
`event.ebok.fr` à **`ebok.fr`**. Marche à suivre complète :
`BASCULE_EBOK_FR.md`.

- [x] `ebok.fr` et `www.ebok.fr` branchés sur le projet Vercel (DNS déjà
      correct chez OVH) ; `www` redirige vers `ebok.fr`.
- [x] Code : « EBOK Event » → « EBOK », `event.ebok.fr` → `ebok.fr`
      (textes, pages légales, sitemap, robots, partage, alertes) ;
      redirection permanente `event.ebok.fr` → `ebok.fr` dans `vercel.json`.
- [ ] Clerk : domaine de l'application → `ebok.fr`.
- [ ] Google Cloud : origine `https://ebok.fr` autorisée.
- [ ] Fusion de la PR de bascule, puis tests.

## 🎯 Chantier en cours : passer Clerk en production

- [x] ~~Instance Clerk dédiée~~ — créée le 15/09/2026
      (`normal-shiner-4060.clerk.accounts.dev`). EBOK Event ne partage plus
      l'instance d'ebok.fr.
- [ ] **Passer cette instance en production** sur le domaine `event.ebok.fr` —
      clé `pk_live_…` posée dans le code (domaine technique `clerk.ebok.fr`) ;
      reste : DNS vérifiés dans Clerk, `sk_live_…` sur Vercel, mise en ligne
      (clés `pk_live_…` / `sk_live_…`). Tant qu'elle reste en développement,
      Clerk affiche un bandeau « development mode » et limite le nombre de
      comptes : **impossible d'ouvrir le site au public dans cet état.**

**⚠️ Même conséquence qu'un changement d'instance :** chez Clerk, l'instance de
production est **distincte** de celle de développement. Les comptes créés en
développement **ne passent pas** en production : leurs titulaires devront se
réinscrire, et leurs événements perdront le lien avec leur diffuseur. Les
droits admin se retrouvent seuls (reconnus par e-mail).

> 👉 **Tant qu'il n'y a aucun diffuseur inscrit, l'opération est gratuite.**
> Plus on attend, plus la réinscription coûte cher. Marche à suivre : README,
> « Passer en production » puis « Changer d'instance ».
>
> ⚠️ **Google en production :** l'instance de développement utilise des
> identifiants Google fournis par Clerk ; en production, il faut créer les
> siens (Google Cloud Console → client OAuth « Application Web ») et les coller
> dans Clerk → SSO connections → Google. Sans eux, le bouton Google ne
> fonctionne pas.

---

## 🔜 Prochaines étapes

### 1. Géolocalisation réelle *(prioritaire)*

Le filtre « autour de moi » repose encore sur un rayon approximatif.

> ℹ️ **À savoir avant de commencer :** `app.js` contient déjà la logique
> (`initGeoloc`, `setGeoUI`, `showGeoStatus`, le curseur de rayon), mais les
> éléments correspondants — `geoBtn`, `geoStatus`, `radiusFilter`,
> `radiusValue` — **n'existent pas dans `index.html`**. L'interface a été
> retirée sans le code. Tout est protégé par des `if(!el) return;`, donc rien
> ne casse : il reste à remettre l'interface et à brancher le calcul réel.

- [ ] Demander la position au navigateur et la mémoriser
- [ ] Stocker `latitude` / `longitude` sur chaque événement (les coordonnées des
      villes sont déjà dans `cities-fr.js` — la moitié du travail est faite)
- [x] Ville du membre et ses coordonnées, collectées au questionnaire de
      bienvenue (`ville`, `villeLat`, `villeLng`) — le point de départ du
      filtre « autour de moi » est donc déjà en base
- [ ] Remplacer le rayon approximatif par la **formule de Haversine**
- [ ] Trier les résultats par distance réelle

### 2. Popularité des événements ✅

- [x] **Compteur public de favoris** — plutôt qu'un second bouton « Ça
      m'intéresse » à côté de « Enregistrer », qui aurait divisé le signal et
      fait hésiter, le favori existant SERT d'indicateur d'intérêt et son total
      devient public. Le total est calculé par la vue `event.events_lecture` et
      voyage avec la fiche : pas de requête supplémentaire. Masqué à zéro, et
      il bouge dès le clic sans attendre le serveur.
- [ ] Afficher aussi le total dans le tableau de bord du diffuseur

### 3. Tableau de bord diffuseur & mesure d'audience

Les favoris et « Mes événements publiés » existent déjà, mais enfouis dans la
page « Mon profil ». Il faut en faire des destinations à part entière, et leur
adjoindre des statistiques exploitables par un organisateur.

- [x] **Compteurs sécurisés** — un visiteur n'est compté qu'une fois par jour et
      par événement (empreinte salée, non réversible, purgée à 7 jours) ; le
      paramètre `seed` envoyé par le navigateur, qui permettait de fixer un
      compteur à la valeur de son choix, est ignoré ; un garde-fou stoppe le
      comptage au-delà de 150 événements par visiteur et par jour.
- [ ] **Remettre à zéro les compteurs déjà gonflés** — décidé : on repart de
      zéro. Requête prête dans `scripts/reset-compteurs.sql`, à exécuter dans
      la console Neon (SQL Editor).
- [ ] **Statistiques par événement** — vues, et clics sur chaque canal de contact
- [ ] **Comptage des clics sur les contacts.** Décision prise : **téléphone et
      e-mail sont masqués et révélés au clic** (ce qui bloque au passage les
      robots collecteurs de spam) ; **les réseaux sociaux restent affichés en
      lien direct**, mais tous les clics sont comptés. Cacher n'est pas
      nécessaire pour mesurer — c'est un choix séparé, justifié seulement pour
      le téléphone et l'e-mail.
- [ ] **Modification d'un événement depuis le tableau de bord**

### 3 bis. Alertes e-mail ✅

- [x] Page « Mes alertes » : régions, types, période, jusqu'à 10 par membre
- [x] Déclenchement à la **validation** d'un événement, pas à sa création
- [x] Envoi par Resend, désinscription par jeton sans connexion
- [x] Trace des envois : revalider n'envoie pas deux fois ; un envoi raté est rejouable
- [ ] **Reste à faire par toi :** créer le compte Resend, configurer SPF/DKIM sur
      le domaine, et poser `RESEND_API_KEY` sur Vercel (voir README)

### 3 ter. Assistant IA d'import — ouvert aux organisateurs ✅

- [x] Testé sur de vraies affiches par l'admin : résultats jugés très bons.
- [x] **Ouvert à tout membre connecté** (9/11/2026), avec un quota de
      **5 imports par jour et par organisateur** (`AI_IMPORTS_PAR_JOUR`,
      table `event.ai_imports`) ; un import raté ne consomme pas le quota,
      l'admin n'a pas de limite.
- [x] Survivre à la saturation des modèles gratuits — repli automatique sur
      d'autres modèles gratuits du catalogue OpenRouter.
- [ ] **Si la saturation devient gênante** — créditer le compte OpenRouter de
      quelques euros (modèles payants, environ un centime par affiche). Décision
      à prendre au vu de l'usage réel.

### 3 quinquies. Publication en étapes ✅

- [x] Le formulaire de 30 champs est devenu un **parcours en cartes**
      (`public/js/create-wizard.js`) : départ (IA ou saisie), l'essentiel,
      voyage (si ce type), lieu, public, affiche, infos pratiques (facultatif),
      contact, récapitulatif. Barre de progression, contrôle à chaque étape
      (champs obligatoires, dates incohérentes, e-mail), **aperçu de la fiche
      en direct** sur ordinateur, et dans le récapitulatif sur mobile.
- [x] Après un import IA, direction le récapitulatif : tout se relit et se
      corrige d'un clic sur « Modifier ».

### 3 sexies. Détection automatique d'événements ✅ (premier jet)

Chaque lundi à 9 h UTC (10 h à Paris l'hiver, 11 h l'été), toutes les pages
surveillées (agenda de ligue, calendrier 3x3, page d'organisateur…) sont lues
par l'IA, en parallèle ; les événements de basket qu'elle
annonce sont créés **en attente**, avec le badge « 🤖 Détecté » et un lien
vers la source. Rien n'est publié sans validation.

- [x] Moteur `lib/detection.js` : extraction de plusieurs événements par page,
      filtres (titre, ville, date, à venir), empreinte anti-doublon (titre +
      date + ville), géocodage (Base Adresse Nationale), affiche jamais
      recopiée, 25 événements max par analyse. Tests : `npm run test:detection`.
- [x] Route `api/detection.js` + tâche Vercel hebdomadaire (`vercel.json` →
      `crons`, lundi 9 h UTC) : une analyse par source, lancées en parallèle,
      chacune dans son propre appel (limite d'une minute par appel).
- [x] **Sources ciblées** (10/11/2026) : circuit 3x3 FFBB (calendriers
      Superleague et Juniorleague, Opens de France), ligues Occitanie,
      Auvergne-Rhône-Alpes (Lyon), Île-de-France (Paris), Pays de la Loire
      (Nantes).
- [ ] **Play FIBA 3x3** — c'est là que sont inscrits tous les tournois
      « Open Start » ; le site est construit en JavaScript, il faudra passer
      par ses données plutôt que par la page.
- [ ] Comités départementaux du Rhône, de Paris et de Loire-Atlantique :
      sites à identifier.
- [x] Espace admin : ajouter / mettre en pause / retirer une page, « Analyser
      maintenant », dernier résultat de chaque page.
- [x] Un événement détecté puis supprimé (= refusé) ne revient jamais
      (table `event.detections`).
- [ ] **Constituer la liste des pages à surveiller** — les meilleures sont des
      pages d'agenda en HTML classique. Les pages construites en JavaScript
      (beaucoup de sites modernes, HelloAsso) sont lues vides : l'admin le voit
      dans le résultat (« page sans contenu exploitable »).
- [ ] **Poser `CRON_SECRET`** sur Vercel (voir README).
- [ ] Plus tard : recherche web automatique (API de recherche, payante au-delà
      d'un quota) pour découvrir de nouvelles pages sans les saisir à la main.

### 4. Ajouter à mon agenda *(petit effort)*

- [ ] Génération d'un fichier `.ics` (Google / Apple Agenda), côté navigateur

### 5. Répertoire des playgrounds 3x3 *(gros chantier)*

Recenser les terrains de France et les afficher sur la carte. Fort potentiel
communautaire, mais dépend de la géolocalisation.

- [ ] Entité « terrain » en base (distincte des événements)
- [ ] Affichage sur la carte + filtre « autour de moi »
- [ ] Contribution communautaire avec modération admin

> 💡 Les réseaux sociaux des membres (`socials`) sont collectés mais ne sont
> affichés nulle part côté public : ils attendent la brique « communauté ».
> Pour les structures, Instagram et LinkedIn sont recopiés dans le profil
> diffuseur et apparaissent donc sur les fiches événement.

### 6. Plus tard

- [ ] **Alertes par ville + rayon** — la zone se choisit aujourd'hui par région,
      ce qui reste large. Le rayon autour d'une ville demande les coordonnées
      des événements, donc le chantier géolocalisation.
- [ ] **Alertes par SMS** — écartées pour l'instant : environ 0,05 € par envoi,
      et surtout il faudrait vérifier le numéro par code, sans quoi la
      plateforme servirait à spammer des tiers.
- [ ] **Avis / discussion** — questions à l'organisateur, retours sur les
      éditions passées (demande de la modération)
- [ ] **Agent réseaux sociaux** *(idée validée, à construire)* — chaque
      semaine, préparer à partir des événements validés des posts Instagram
      (carrousel « les événements du week-end » par région, stories) et
      LinkedIn (ton plus pro, pour clubs et partenaires), dans le ton de la
      marque. D'abord des brouillons à valider ; publication automatique
      ensuite, une fois les accès API Instagram (Meta) et LinkedIn obtenus.
      Pré-requis : comptes Instagram et LinkedIn d'EBOK Event créés.

### 7. Offres payantes — *seulement avec un statut professionnel*

> 🧭 **Décision du 9/11/2026 : démarrage sans statut professionnel.** EBOK Event
> est édité par un particulier, à titre non professionnel et **entièrement
> gratuit** (CGU, article 7). Toute mention de vente a été retirée du site.
> Rien de ce qui suit ne doit être remis en ligne avant d'avoir créé une
> structure (micro-entreprise envisagée) **et** mis à jour les CGU :
> identité de l'éditeur, SIRET, prix, droit de rétractation, médiateur de la
> consommation.

Idées mises de côté, déjà esquissées dans le code par le passé :

- [ ] Mise en avant payante sur le site (bandeau « à la une »)
- [ ] Story ou publication Instagram sponsorisée
- [ ] Campagne e-mail ciblée — sélection des destinataires en réutilisant la
      mécanique de correspondance des alertes (`lib/alertes.js`)
- [ ] Vente d'espaces publicitaires
- [ ] Billetterie / inscriptions — avec commission

---

## 🚦 Avant le lancement public

Checklist de mise en ligne. Les cases déjà cochées l'ont été après vérification
dans le code — le reste est à faire.

### ⚖️ Obligations légales *(bloquant — ne pas lancer sans)*

- [x] ~~Page « Politique de confidentialité » (RGPD)~~ — `public/confidentialite.html`,
      servie sur `/confidentialite`. Décrit les données réellement collectées,
      les bases légales, les durées de conservation, les sous-traitants (Vercel,
      Neon, Clerk, Resend, OpenRouter) et les droits RGPD.
- [x] ~~Page « Conditions générales d'utilisation »~~ — `public/cgu.html`, servie
      sur `/cgu`. Les **mentions légales** y figurent en article 1.
- [x] ~~Lien vers ces pages dans le pied de page~~
- [x] ~~Mentions légales adaptées à un éditeur **particulier non
      professionnel**~~ (9/11/2026) — l'éditeur garde l'anonymat permis par la
      LCEN, son identité étant communiquée à l'hébergeur. Plus de SIRET, de TVA
      ni de médiateur : ils ne s'imposent qu'avec une activité commerciale.
- [x] ~~Région de la base Neon~~ — Londres (`aws-eu-west-2`), couverte par la
      décision d'adéquation UE du Royaume-Uni.
- [x] ~~Adresses des hébergeurs~~ (9/11/2026) — recopiées des pages
      officielles : `vercel.com/legal/terms` (Vercel Inc., qui ne publie pas
      de téléphone : renvoi vers son support) et `databricks.com/legal/mcsa`
      (Neon, LLC appartient à Databricks, Inc.). Plus aucun `[À COMPLÉTER]`.
- [ ] **Faire relire par un juriste** avant le lancement public. Les pages sont
      rédigées à partir de ce que le code fait réellement, ce qui est la partie
      difficile — mais une relecture professionnelle reste nécessaire, en
      particulier sur l'accueil des mineurs et l'anonymat de l'éditeur.
- [ ] **Le jour d'une première offre payante** — créer d'abord le statut,
      puis réécrire les CGU (identité de l'éditeur, SIRET, prix, rétractation,
      médiateur). Voir « 7. Offres payantes ».
- [ ] **Bandeau cookies** — à calibrer une fois l'outil de mesure choisi. Les
      cookies de Clerk sont *strictement nécessaires* (pas de consentement
      requis) ; un outil de mesure sans cookie (voir plus bas) évite le bandeau
      de consentement. À trancher avec le point « Mesure d'audience ». En
      l'état, la politique de confidentialité affirme qu'aucun traceur tiers
      n'est utilisé : **elle devra être mise à jour en même temps.**

### 🔎 Référencement & partage

- [x] **Titre et description** — présents, et **personnalisés par événement**
      (`api/evenement.js` injecte titre, description, Open Graph et
      schema.org/Event)
- [x] **Favicon** — SVG + PNG + icône Apple, en place
- [x] ~~**Image de partage réseaux sociaux**~~ — `assets/og-image.jpg`
      (1200 × 630), utilisée par l'accueil et, en repli, par les fiches sans
      affiche ; `twitter:card` passe à `summary_large_image`.
- [x] ~~**`robots.txt`**~~ — `public/robots.txt`, exclut `/compte/` et `/api/`.
- [x] ~~**`sitemap.xml`**~~ — généré à la demande par `api/sitemap.js` depuis
      les événements validés. **Reste à faire par toi :** le déclarer dans
      Google Search Console (voir ci-dessous).
- [ ] **Google Search Console** — ajouter `ebok.fr` (vérification par
      enregistrement DNS TXT chez OVH), puis y déclarer
      `https://ebok.fr/sitemap.xml`. Sans ça, Google découvre les fiches
      beaucoup plus lentement.

### ⚡ Performance & accessibilité

- [ ] **Poids des pages** — `cities-fr.js` pèse **244 Ko** et `france-map.js`
      **88 Ko**. `cities-fr.js` est déjà chargé à la demande ; vérifier que rien
      d'autre ne bloque le premier affichage.
- [ ] **Compression des images** — `demo-ligue-c.jpg` fait 136 Ko et les trois
      favicons 64 Ko à eux seuls. Les affiches déposées sont déjà compressées à
      l'envoi (`compressImage`, 1200 px / qualité 0.8) ✅, mais servir aussi du
      **WebP** allégerait nettement.
- [ ] **Contraste** — à mesurer au contrastomètre. `--chalk-dim` (#ACA79A) sur
      `--asphalt` (#17171A) passe, mais les petits textes gris du thème clair
      sont à vérifier (viser AA : 4.5:1).
- [x] **Textes alternatifs** — toutes les balises `<img>` du HTML ont un `alt`.
      Reste à vérifier celles générées en JS (affiches, galeries).
- [x] **Site responsive** — 14 requêtes média, testé sur mobile. À revalider
      après chaque nouvelle page.

### 🛡️ Robustesse & confiance

- [x] **API hors du front** — déjà le cas : aucune clé secrète dans le
      navigateur, tout passe par les fonctions `/api`. Seule la clé Clerk
      *publishable* est exposée, et c'est son usage prévu.
- [x] ~~**En-têtes de sécurité**~~ — HTTPS et HSTS assurés par Vercel ;
      `vercel.json` ajoute `X-Content-Type-Options`, `Referrer-Policy`,
      `X-Frame-Options`, `Permissions-Policy`.
- [ ] **Passer la Content-Security-Policy en mode bloquant** — elle est posée en
      `Content-Security-Policy-Report-Only` : le navigateur signale les
      écarts dans sa console sans rien bloquer. Après une semaine sans
      signalement (connexion, Google, publication avec affiche, autocomplétion
      de ville), renommer l'en-tête en `Content-Security-Policy`.
- [x] ~~**Page 404 personnalisée**~~ — `public/404.html`, aux couleurs du site.
- [ ] **Liens cassés** — à passer au crible avant lancement, y compris les liens
      externes des diffuseurs (site, Instagram).
- [x] ~~**Validation des formulaires**~~ — le parcours de publication vérifie
      chaque étape avec des messages clairs (obligatoires, e-mail, dates).
      Reste le formulaire de modification d'un événement (fenêtre admin).
- [ ] **Anti-spam** — ⚠️ rien aujourd'hui. La publication exige un compte et
      passe en modération, ce qui limite déjà beaucoup les dégâts. À renforcer
      si besoin : limitation du nombre de publications par compte et par jour.
      Voir aussi `/api/views`, en écriture ouverte (cf. dette technique).
- [ ] **Mesure d'audience** — rien aujourd'hui. **Recommandation :** Vercel Web
      Analytics ou Plausible — sans cookie, donc **pas de bandeau de
      consentement** et conformes RGPD. Google Analytics imposerait le bandeau.

### 🎨 Finitions

- [x] ~~Barre du haut sur mobile~~ — refaite : une seule rangée, plus de
      chevauchement, plus de navigation défilante à l'horizontale
- [x] ~~Remplacer le logo~~ — fait : `logo.png` et les déclinaisons du favicon
      sont générés depuis les fichiers d'origine (`*-source.png`, conservés
      comme masters dans `public/assets/`).
- [x] ~~Refondre le pied de page~~ — fait : quatre rubriques en colonnes
      (présentation, Le site, Mentions légales, Contact) sur un fond distinct,
      chaque titre souligné d'un filet orange. Les rubriques légales sont
      annoncées avec la mention « bientôt » tant que les pages n'existent pas :
      pas de lien mort. Une cinquième colonne « Suivez-nous » est prête et
      masquée tant que `RESEAUX_EBOK` (dans `public/js/app.js`) est vide.
- [x] ~~**Contact**~~ — l'adresse n'est plus écrite dans le HTML de
      l'accueil : elle est reconstituée au clic (`initContactFooter`). Elle
      reste en clair dans les CGU et la politique de confidentialité, où la loi
      demande un contact joignable.
- [ ] **Créer les comptes Instagram et LinkedIn**, puis coller les adresses des
      profils dans `RESEAUX_EBOK` (`public/js/app.js`) : la rubrique
      « Suivez-nous » du pied de page apparaît alors toute seule. Une adresse
      laissée vide masque sa ligne, les deux vides masquent la rubrique.

> 🚫 **Règle :** aucun lien ni aucune mention renvoyant vers les anciennes
> applications EBOK (forum, mercato, playbook…). EBOK se présente comme un
> produit seul, sur `ebok.fr` (depuis le 10/11/2026). Les redirections après
> connexion sont verrouillées côté code (`redirectionOptions()` dans
> `public/js/clerk.js`) pour qu'un réglage du tableau de bord Clerk ne puisse
> pas envoyer un visiteur ailleurs.

### 🎯 Conversion

- [ ] **Un seul appel à l'action** — la barre du haut propose aujourd'hui
      « Se connecter », « S'inscrire » et « Publier un événement ». Décider ce
      qu'on attend d'un premier visiteur et hiérarchiser en conséquence.

---

## 🧹 Dette technique connue

| Sujet | Détail | Urgence |
|---|---|---|
| `public/js/app.js` | 144 Ko dans un seul fichier. À découper par domaine (carte, filtres, publication, compte, admin) avant qu'il ne devienne intenable. | moyenne |
| Compteurs hérités | Les valeurs déjà en base ont démarré à 120 par événement et ont pu être manipulées avant la sécurisation. À remettre à zéro si elles doivent servir d'argument commercial. | moyenne |
| Liste publique | `LIMIT 1000` en dur, sans pagination. Suffisant aujourd'hui ; à revoir vers quelques centaines d'événements. | basse |
| `api/migrate-posters.js` | Migration ponctuelle data-URI → Blob. Supprimable une fois qu'il ne reste plus d'affiche en base (le mode `?dry=1` permet de le vérifier sans rien écrire). | basse |
| Aucun test | Le projet n'a aucun test automatisé. Les régressions se voient en production. | à décider |

---

## 🔒 Règles à ne pas enfreindre

- **Jamais** de `sk_…`, de `DATABASE_URL` ni de clé d'API dans le code ou dans
  une conversation. Ces valeurs vivent dans les variables d'environnement Vercel.
- La clé Clerk **publishable** (`pk_…`) est publique : sa place est bien dans
  `public/js/clerk.js`.
- Les droits se vérifient **côté serveur**, dans `/api`. Un contrôle côté
  navigateur est un confort d'affichage, jamais une sécurité.
- Toute donnée saisie par un membre est **échappée** avant d'être injectée dans
  du HTML (cf. `esc()` dans `app.js`).
- « Zéro miroir » : l'e-mail et le nom réel sont lus en direct depuis Clerk,
  jamais recopiés en base.

---

## 🛠️ Commandes utiles

```bash
npm start                  # serveur local sur http://localhost:8080
npx vercel dev             # idem, avec les fonctions /api (nécessite les variables d'env)
npm run clerk:check        # vérifie que l'instance Clerk est bien configurée
node --check public/js/app.js   # contrôle de syntaxe rapide
```

> Le site est **statique** : pas d'étape de build, pas de bundler. Un fichier
> modifié est actif au rechargement de la page.
