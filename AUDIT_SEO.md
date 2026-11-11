# 🔎 Audit SEO technique — ebok.fr

> Audit du 11 novembre 2026, au lendemain de la bascule vers `ebok.fr`.
> Méthode : lecture du code (`public/`, `api/`, `vercel.json`), requêtes sur le
> site en ligne (accueil, sitemap, fiche inconnue, 404, `www`, `event.ebok.fr`)
> et lecture de la table `event.events`.
> **Non couvert :** Google Search Console (pas encore branchée), Core Web Vitals
> (aucune mesure de terrain ni Lighthouse), backlinks des anciens sites.

## En bref

Les fondations sont saines : HTTPS, redirections, `robots.txt`, sitemap
dynamique, vraie page 404, métadonnées par événement. Mais **Google ne reçoit
aujourd'hui que le `<head>` de chaque fiche** : le contenu (titre, dates, lieu,
description) n'apparaît qu'après exécution du JavaScript, et **aucun lien
interne n'est suivable** par un robot. Le site est donc indexable « sur le
papier » mais envoie très peu de matière aux moteurs.

Le second frein n'est pas technique : la base contient **8 événements validés,
dont 4 à venir**. Le SEO d'un agenda se joue au volume de fiches ; les
corrections ci-dessous préparent le terrain, le contenu fera le reste.

## Note par couche

| Couche | État | Commentaire |
|---|---|---|
| 1. Exploration (crawl) | 🟢 | `robots.txt` et sitemap corrects |
| 2. Indexabilité | 🟠 | fiches inconnues en 200, pas de canonical sur l'accueil |
| 3. Rendu | 🔴 | contenu des fiches 100 % JavaScript |
| 4. Architecture | 🔴 | aucun lien `<a>` vers les fiches, aucune page par type ou région |
| 5. Données structurées | 🟠 | `SportsEvent` présent mais incomplet |
| 6. Expérience et sécurité | 🟢 | HTTPS, HSTS, 404 propre ; performances non mesurées |

## Ce qui est déjà bon (vérifié en ligne)

- `www.ebok.fr` et `event.ebok.fr` redirigent en 308 vers `ebok.fr`, en un seul saut.
- `robots.txt` autorise le site, exclut `/compte/` et `/api/`, déclare le sitemap.
- `/sitemap.xml` répond 200 et liste l'accueil, les 2 pages légales et les 8 fiches validées.
- Une adresse inexistante renvoie un vrai 404 avec `noindex`.
- Les pages `/compte/*` portent `noindex, nofollow`.
- Chaque fiche validée reçoit son titre, sa description, son Open Graph, son canonical et un JSON-LD `SportsEvent`.
- En-tête HSTS présent, `lang="fr"`, balise viewport, un seul `<h1>` sur l'accueil.

## Problèmes prioritaires

### P1-1 — Le contenu des fiches n'est pas dans le HTML

`api/evenement.js` n'injecte que le `<head>`. Le corps servi sur
`/evenement/<id>` est celui de l'accueil : même `<h1>` (« L'agenda collaboratif
du Basket Francophone »), aucune date, aucun lieu, aucune description. La fiche
est dessinée ensuite par `js/app.js` après un appel à l'API.

Google sait exécuter le JavaScript, mais avec retard et sans garantie ; Bing et
les robots des IA (ChatGPT, Perplexity) ne le font généralement pas.

**Correction :** faire écrire par `api/evenement.js` un bloc HTML de la fiche
(`<h1>` = titre, dates, lieu, type, organisateur, description, affiche) dans la
page, que l'app remplace ou réutilise au démarrage.

### P1-2 — Aucun lien interne suivable

Les cartes d'événement sont des `<div class="event-card" data-id>` ouvertes par
un clic JavaScript (`public/js/app.js:165` et `:840`), la navigation est faite
de `<button data-nav>`. Les seuls `<a href>` du site pointent vers `/cgu` et
`/confidentialite`. Un robot qui arrive sur l'accueil ne peut atteindre aucune
fiche : elles ne sont découvertes que par le sitemap et ne reçoivent aucune
autorité de l'accueil.

**Correction :** rendre chaque carte (et chaque épingle de la liste) sous forme
de `<a href="/evenement/<id>">`, le JavaScript interceptant le clic pour garder
la navigation sans rechargement. Idéalement, la liste des événements à venir
est aussi écrite dans le HTML de l'accueil côté serveur.

### P1-3 — Fiche inconnue ou retirée : réponse 200 (« soft 404 »)

Vérifié : `https://ebok.fr/evenement/id-qui-nexiste-pas` répond **200** avec le
titre et le contenu de l'accueil, sans canonical. Même chose pour un événement
supprimé ou encore en attente. Google y voit des doublons de l'accueil.

**Correction :** quand la base répond et que l'événement n'existe pas en
« approved », renvoyer **404** (page 404 du site). Garder le 200 seulement si
la base est injoignable.

### P1-4 — Aucune page pour les recherches réelles

Personne ne cherche « EBOK » ; on cherche « tournoi basket 3x3 Occitanie »,
« camp basket été », « détection basket U15 ». Les filtres (type, région, date)
ne vivent que dans l'état de la page : ils n'ont pas d'adresse, donc rien à
indexer.

**Correction :** des pages servies par le serveur, par type puis par région
(`/tournois`, `/camps`, `/3x3`, `/tournois/occitanie`…), chacune avec son titre,
son texte d'introduction et sa liste de fiches en liens. À n'ouvrir que pour
les combinaisons qui ont assez d'événements, sinon ce sont des pages vides.
C'est le chantier au plus fort potentiel, mais il dépend du volume de fiches.

## Problèmes importants

### P2-1 — Pas de canonical sur l'accueil ni sur les pages légales

Vérifié en ligne : `index.html` n'a pas de `<link rel="canonical">`. Toute
variante (`/?utm_source=…`, `/?fbclid=…`) est un doublon potentiel.
**Correction :** ajouter `<link rel="canonical" href="https://ebok.fr/">` dans
le bloc `og:start … og:end` (pour qu'il soit bien remplacé sur les fiches), et
l'équivalent sur `cgu.html` et `confidentialite.html`.

### P2-2 — Canonical des fiches construit à partir de l'hôte de la requête

`origin(req)` dans `api/evenement.js` lit `x-forwarded-host`. Servie depuis une
adresse `…vercel.app`, une fiche se déclare donc canonique **sur vercel.app**.
`api/sitemap.js` fait déjà le bon choix avec `ORIGINE = "https://ebok.fr"`.
**Correction :** même constante dans `api/evenement.js` pour `canonical`,
`og:url` et le JSON-LD.

### P2-3 — JSON-LD `SportsEvent` incomplet

Pour l'affichage enrichi « Événements » de Google :

- `location.address` n'existe que si une adresse est saisie, et ne contient que
  `streetAddress`. Ajouter `addressLocality` (ville), `addressRegion`,
  `addressCountry` — toujours disponibles.
- `image` absente quand il n'y a pas d'affiche : c'est le cas de **3 des 4
  événements à venir**. Mettre l'image de partage en repli.
- Champs recommandés manquants : `eventStatus`, `eventAttendanceMode`,
  `offers` (prix ou gratuité, lien d'inscription), `organizer.url`.
- Aucun `Organization` ni `WebSite` sur l'accueil.
- Détails : `og:type` vaut `article`, `twitter:image` et les dimensions
  d'`og:image` manquent sur les fiches.

### P2-4 — Fiche sans description

« Hardworktrip - Derby Grec à Olympiakos » a une description vide : sa balise
`description` reste celle de l'accueil. **Correction :** repli automatique
(« Voyage basket à … du … au … ») et description obligatoire à la publication.

### P2-5 — `lastmod` du sitemap figé à la date de création

La table n'a pas de date de modification : une fiche corrigée garde son
`lastmod` d'origine. **Correction :** colonne `updated_at`, renseignée à chaque
modification. `changefreq` et `priority` sont ignorés par Google (inoffensifs).

### P2-6 — Titre de l'accueil sans mots-clés

« EBOK — L'agenda collaboratif du basket francophone » ne contient aucun terme
recherché. Piste : « Agenda basket : tournois, camps, 3x3, détections | EBOK ».
Le titre de l'onglet ne change pas non plus quand on ouvre une fiche depuis
l'accueil (`app.js` ne touche jamais à `document.title`).

## Finitions

- **Adresses en UUID** (`/evenement/3d20eae5-…`) : une adresse lisible
  (`/evenement/open-plus-access-3x3-bourg-en-bresse-2027`) aide un peu le taux
  de clic. À faire avec redirection des anciennes adresses, sans urgence.
- **Images des cartes** sans `loading="lazy"` ni dimensions (risque de
  décalage de mise en page).
- **Polices Google** : 3 familles chargées en bloquant le rendu ;
  `index.html` n'a pas le `preconnect` vers `fonts.gstatic.com` que les autres
  pages ont.
- **`llms.txt`** absent (404) : fichier court décrivant le site pour les IA.
- **Anciennes adresses d'`ebok.fr`** (ancien site principal, hors ligne depuis
  le 9/11) : elles tombent désormais en 404. Si certaines recevaient des liens
  ou du trafic, les rediriger vers l'accueil — à vérifier dans Search Console.

## Feuille de route

| Ordre | Action | Qui | Effort |
|---|---|---|---|
| 1 | Brancher Google Search Console (TXT chez OVH) et déclarer le sitemap ; idem Bing Webmaster Tools | propriétaire | 20 min |
| 2 | 404 sur fiche inconnue, canonical accueil + pages légales, origine fixe `ebok.fr` (P1-3, P2-1, P2-2) | code | court |
| 3 | JSON-LD complet + `Organization`/`WebSite` + replis de description (P2-3, P2-4) | code | court |
| 4 | Cartes en liens `<a href>` (P1-2) | code | moyen |
| 5 | Contenu de la fiche écrit côté serveur (P1-1) | code | moyen |
| 6 | Mesure d'audience sans cookie (Vercel Web Analytics ou Plausible) | propriétaire + code | court |
| 7 | Pages par type et par région (P1-4) | code | long — quand le volume de fiches le justifie |
| 8 | `updated_at`, titre de l'accueil, adresses lisibles, finitions | code | au fil de l'eau |

## Questions ouvertes

- Une adresse `…vercel.app` de production est-elle publique ? Si oui, P2-2 passe en priorité.
- L'ancien `ebok.fr` avait-il des pages bien positionnées ou des liens entrants à préserver ?
- Cible prioritaire : France seule ou tout le francophone ? Cela oriente les titres et les pages par région.
