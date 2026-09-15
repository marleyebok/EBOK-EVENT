# 🚀 EBOK Event — Plan de développement

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
- [x] Thème clair / sombre
- [x] Barre du haut compacte sur mobile et tablette (logo, loupe, +, menu) avec
      volet latéral : compte, navigation, favoris, mes événements, thème,
      déconnexion
- [x] Échappement des données d'événement dans les rendus HTML (XSS stocké)

---

## 🎯 Chantier en cours : instance Clerk dédiée

Côté code, **tout est prêt** : la connexion repose entièrement sur le widget
Clerk (plus de formulaire maison), le widget est habillé aux couleurs du site,
une panne du service est signalée à l'utilisateur, et la bascule d'instance ne
demande qu'**une seule ligne**. Il reste l'étape qui se fait sur le tableau de
bord Clerk : **créer l'instance dédiée** — marche à suivre détaillée dans le
README (« Basculer vers une instance Clerk dédiée »).

**⚠️ Conséquence à assumer :** les comptes ne se transfèrent pas d'une instance
Clerk à l'autre. Tous les membres devront **se réinscrire**, et les événements
déjà publiés perdront le lien avec leur diffuseur (leur `user_id` pointera vers
un compte qui n'existe plus). L'admin étant reconnu par **e-mail** et non par
identifiant, les droits d'administration, eux, se retrouvent automatiquement.

> 👉 **Tant qu'il n'y a aucun diffuseur inscrit, l'opération est gratuite.**
> Plus on attend, plus la réinscription coûte cher. La marche à suivre complète
> (réglages Clerk, clés, passage en production, liste de vérification) est dans
> le README — elle n'est pas recopiée ici pour éviter que les deux versions
> divergent.

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

### 2. « J'y vais » *(petit effort, fort impact)*

Compteur de participants intéressés : preuve sociale, et première brique vers la
billetterie.

- [ ] Table `event.attendees` (`event_id`, `user_id`), ou un champ dans `profiles`
- [ ] Bouton sur la fiche événement, réservé aux membres connectés
- [ ] Compteur affiché sur la fiche et sur les cartes

### 3. Tableau de bord diffuseur & mesure d'audience

Les favoris et « Mes événements publiés » existent déjà, mais enfouis dans la
page « Mon profil ». Il faut en faire des destinations à part entière, et leur
adjoindre des statistiques exploitables par un organisateur.

- [ ] **Sécuriser `/api/views` d'abord** — écriture ouverte aujourd'hui : pas
      d'authentification, pas de limite, n'importe qui gonfle un compteur avec
      une boucle. Tant que ce n'est pas fermé, les chiffres ne valent rien face
      à un annonceur. Prévoir une limite par IP et une déduplication par session.
- [ ] **Statistiques par événement** — vues, et clics sur chaque canal de contact
- [ ] **Comptage des clics sur les contacts.** Décision prise : **téléphone et
      e-mail sont masqués et révélés au clic** (ce qui bloque au passage les
      robots collecteurs de spam) ; **les réseaux sociaux restent affichés en
      lien direct**, mais tous les clics sont comptés. Cacher n'est pas
      nécessaire pour mesurer — c'est un choix séparé, justifié seulement pour
      le téléphone et l'e-mail.
- [ ] **Modification d'un événement depuis le tableau de bord**

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

- [ ] **Alertes e-mail** — « préviens-moi des *tournois* près de *Montpellier* »
      (nécessite un service d'envoi type Resend ou SendGrid)
- [ ] **Avis / discussion** — questions à l'organisateur, retours sur les
      éditions passées (demande de la modération)
- [ ] **Billetterie / inscriptions** — avec commission

---

## 🚦 Avant le lancement public

Checklist de mise en ligne. Les cases déjà cochées l'ont été après vérification
dans le code — le reste est à faire.

### ⚖️ Obligations légales *(bloquant — ne pas lancer sans)*

- [ ] **Page « Politique de confidentialité » (RGPD)** — quelles données sont
      collectées (compte Clerk, profil diffuseur, favoris, compteurs de vues),
      pourquoi, combien de temps, et comment les supprimer. Citer les
      sous-traitants : Clerk (comptes), Neon (base), Vercel (hébergement),
      OpenRouter (assistant IA).
- [ ] **Page « Conditions générales d'utilisation »** — qui peut publier, règles
      de modération, responsabilité sur le contenu déposé par les diffuseurs,
      droit à l'image des affiches.
- [ ] **Mentions légales** — obligatoires en France : éditeur, hébergeur (Vercel),
      contact. Souvent oubliées alors qu'elles sont exigées avec les CGU.
- [ ] **Bandeau cookies** — à calibrer une fois l'outil de mesure choisi. Les
      cookies de Clerk sont *strictement nécessaires* (pas de consentement
      requis) ; un outil de mesure sans cookie (voir plus bas) évite le bandeau
      de consentement. À trancher avec le point « Mesure d'audience ».
- [ ] **Lien vers ces pages dans le pied de page**

### 🔎 Référencement & partage

- [x] **Titre et description** — présents, et **personnalisés par événement**
      (`api/evenement.js` injecte titre, description, Open Graph et
      schema.org/Event)
- [x] **Favicon** — SVG + PNG + icône Apple, en place
- [ ] **Image de partage réseaux sociaux** — ⚠️ aujourd'hui `og:image` pointe
      vers `favicon-192.png` : une icône de 192 px, que WhatsApp, LinkedIn et
      Facebook affichent en minuscule ou ignorent. Il faut une vraie image
      **1200 × 630**. Passer aussi `twitter:card` de `summary` à
      `summary_large_image`.
- [ ] **`robots.txt`** — absent
- [ ] **`sitemap.xml`** — absent. À générer dynamiquement depuis les événements
      validés (une fonction `/api/sitemap`), sinon il sera périmé en permanence.

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
- [ ] **Forcer le HTTPS** — Vercel le fait déjà automatiquement (redirection +
      certificat). Reste à **ajouter les en-têtes de sécurité** dans
      `vercel.json` : `Strict-Transport-Security`, `X-Content-Type-Options`,
      `Referrer-Policy`, et une `Content-Security-Policy`.
- [ ] **Page 404 personnalisée** — absente : un lien mort affiche la page par
      défaut de Vercel, qui ne ressemble pas au site.
- [ ] **Liens cassés** — à passer au crible avant lancement, y compris les liens
      externes des diffuseurs (site, Instagram).
- [ ] **Validation des formulaires** — le HTML a des champs `required`, mais il
      manque des messages d'erreur clairs et une vérification des formats
      (URL, e-mail, dates cohérentes : fin après début).
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
- [ ] **Refondre le pied de page** — le pied de page actuel est une reprise
      minimale, posée pour remplacer celui de la galaxie : trois liens de
      navigation et une adresse de contact, sans travail graphique. À repenser
      pour qu'il tienne la comparaison avec le reste du site, et pour accueillir
      les liens légaux obligatoires (RGPD, CGU, mentions légales).
- [ ] **Contact** — l'adresse `contact@ebok.fr` est affichée en clair, donc
      exposée aux robots collecteurs de spam. À remplacer par un formulaire lors
      de la refonte du pied de page.

> 🚫 **Règle :** aucun lien et aucune mention renvoyant vers `ebok.fr` ou une
> autre application. EBOK Event se présente comme un produit seul. Les
> redirections après connexion sont verrouillées côté code
> (`redirectionOptions()` dans `public/js/clerk.js`) pour qu'un réglage du
> tableau de bord Clerk ne puisse pas envoyer un visiteur ailleurs.
>
> Seule exception, assumée : l'adresse de contact du pied de page reste
> `contact@ebok.fr`. C'est un `mailto:`, il n'envoie donc personne vers le
> site — c'est simplement la boîte mail qui existe.

### 🎯 Conversion

- [ ] **Un seul appel à l'action** — la barre du haut propose aujourd'hui
      « Se connecter », « S'inscrire » et « Publier un événement ». Décider ce
      qu'on attend d'un premier visiteur et hiérarchiser en conséquence.

---

## 🧹 Dette technique connue

| Sujet | Détail | Urgence |
|---|---|---|
| `public/js/app.js` | 144 Ko dans un seul fichier. À découper par domaine (carte, filtres, publication, compte, admin) avant qu'il ne devienne intenable. | moyenne |
| `/api/views` | Écriture ouverte : pas d'authentification ni de limite, n'importe qui peut gonfler un compteur en boucle. À sécuriser si le chiffre doit servir d'argument commercial. | moyenne |
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
