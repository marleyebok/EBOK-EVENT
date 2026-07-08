# 🏀 EBOK Event — Briefing Complet du Projet

## 📋 Vue d'ensemble

**EBOK Event** est un **agenda collaboratif du basketball français** — plateforme web permettant aux organisateurs de publier des événements basket (tournois, camps, 3x3, clinics, détections, etc.) et aux joueurs de les découvrir et s'y inscrire.

**Slogan :** "L'agenda collaboratif du Basket Français"  
**Mode :** Sombre uniquement (identité streetball/urbain)  
**Type MVP :** Web-only, responsive, single-page app HTML/CSS/JS pur (pas de framework)

---

## 🎨 Design & Identité Visuelle

### Palette de couleurs (mode sombre)
```
--asphalt: #17171A (fond très sombre)
--asphalt-2: #1F1F23 (cartes/panneaux)
--asphalt-3: #28282D (inputs/éléments)
--chalk: #F3EEE2 (texte principal, beige chaud)
--chalk-dim: #ACA79A (texte secondaire, gris)
--orange: #FF5722 (accent principal, CTA)
--yellow: #FFC93C (mise en avant)
--green, --red, --violet (pour codes couleurs événements)
```

### Typographie
- **Display :** Anton (titres, all-caps, énergique)
- **Body :** Work Sans (lecture, claire)
- **Mono :** Space Mono (labels, tags, code-like)

### Thème
Streetball/urbain : asphalte, terrains éclairés la nuit, énergie jeune. Pas de mode clair — trop compliqué à maintenir et pas cohérent avec l'identité.

---

## 📱 Architecture & Pages

### Structure HTML (Single Page App)
5 pages toggleables via `data-nav` :

1. **Accueil (home)** — Carrousel + Carte + Filtres
2. **Recherche** — Formulaire avancé + grille de résultats
3. **Publier (create)** — Formulaire diffuseur avec pricing
4. **Détail événement (event)** — Page complète d'un événement
5. (Implicite) Topbar globale + Navigation

### Navigation
- Topbar sticky avec logo `EBOK Event` (orange), nav links, bouton "+ Espace diffuseur"
- Tous les boutons utilisent `data-nav="page-name"` pour routing JS pur

---

## 🗺️ Carte de France

**Technologie :** SVG manuel (silhouette simplifiée mais fidèle)  
**ViewBox :** 560x560  
**Données :** Chaque événement a `x, y` (coordonnées SVG, pas lat/lon)

**Points clés :**
- Silhouette tracée à partir de vraies coordonnées géographiques
- Villes principales pré-positionnées en labels gris
- Pins colorés par type d'événement (code couleur TYPE_COLORS)
- Tooltip au survol (nom, type, dates, public, niveau)
- Clic sur pin → ouvre la page événement

**Limitation actuelle :** Distance "rayon km" est approximée (non géographique). À remplacer par vraie géolocalisation + Haversine formula quand backend existera.

---

## 🎯 Fonctionnalités Clés

### Accueil
- **Carrousel "À la une"** (5 events max)
  - Flèches de navigation ❮ ❯
  - Dots cliquables en bas
  - Animation fluide (transform, 500ms)
  - Événements marqués `featured: true`

- **Deux modes d'affichage :**
  - 🗺️ **Carte** (défaut) — SVG interactive, filtres gauche
  - ☰ **Liste** — Grille Airbnb-like (3 colonnes), même filtres

- **Filtres sidebar :** Statut (À venir/Archives), Ville (search avec autocomplétion), Rayon km (slider), Dates (calendrier interactif), Types

### Calendrier Période
- Composant dédié : sélection début/fin de plage
- **Deux modes :**
  - Plage (défaut) : 1er clic = début, 2e clic = fin
  - Jour unique : 1 clic = sélectionner ce jour
- Boutons : "Réinitialiser", "Appliquer"
- Navigation mois (flèches), dates pré-remplies, highlights de plage

### Recherche
- Même moteur de filtrage que la carte
- Formulaire développé : 8 champs (lieu texte libre, type, dates début/fin, sexe, âge, niveau)
- Bouton "Réinitialiser"
- Résultats : grille de cartes, compte dynamique
- État vide : message sympathique

### Publication d'événement (Espace Diffuseur)
- **Formulaire 3 colonnes :**
  - Col 1 : Infos générales (nom, type, niveau, ville, région, adresse, dates, sexe, âge, description)
  - Col 2 : Infos pratiques (horaires, buvette, réservation) + Upload galerie photos (multi-fichier, drag&drop)
  - Col 3 : Affiche (drag&drop, préview) + Contact organisateur (nom, insta, site, tel, email)

- **Options de visibilité (tarification) :**
  - Standard : 0€ (listing seul)
  - Mise en avant : 29€ (carrousel homepage 7j)
  - Mise en avant + Mailing : 59€ (carrousel + envoi région)

- **Soumission :** Confirmation puis API vers backend (à implémenter)

### Page Événement
- **Gauche :** Affiche (sticky, 400px)
- **Droite :**
  - Badges : type, niveau, sexe, âge, compteur "curieux" (👁️ suivi en temps réel)
  - Titre H2, organisateur
  - Grid 4 cellules : lieu, région, dates, niveau
  - Description prose
  - **Section "Infos pratiques"** : adresse, horaires, buvette, réservation (cartes petit format avec icônes)
  - **Section "Photos d'éditions précédentes"** : polaroid-style (rotation légère, clic = lightbox)
  - **Boutons :**
    - "Se renseigner" → popover avec liens contact (insta, site, tel, mail)
    - "Partager" → popover avec boutons WhatsApp, SMS, Email, Instagram, Copier lien

- **Compteur "curieux"** : nombre visites (sauvegardé en localStorage par défaut, peut utiliser `window.storage` partagé si dispo)

---

## 📊 Structure des Données (Événements)

Chaque événement = objet avec :
```javascript
{
  id: "unique-id",
  title: "Nom Événement",
  type: "Tournoi|Camp|Voyage|All-Star Game|Show|Détections|Clinic Coachs|Circuit 3x3|Handibasket|Matchs de Gala|Divers",
  city: "Paris",
  lieu: "Adresse complète",
  region: "Île-de-France",
  x: 322, y: 148,  // Coordonnées SVG pour la carte
  dateStart: "2026-07-27",
  dateEnd: "2026-07-04",
  sexe: "Masculin|Féminin|Mixte",
  age: "Enfants (6-11 ans)|Ados (12-17 ans)|Séniors (18-35 ans)|Vétérans (35+)",
  niveau: "Loisir|Amateur|Confirmé|Semi-pro / Pro",
  poster: "data:image/jpeg;base64,..." ou null,
  description: "Texte descriptif",
  infos: {
    adresse: "...",
    horaires: "...",
    buvette: "...",
    reservation: "..."
  },
  gallery: [
    {caption: "Photo 1", color: "#FF5722"},
    {caption: "Photo 2", color: "#1F8F6B"}
  ],
  featured: true/false,  // Inclure au carrousel
  org: {
    name: "Nom organisateur",
    insta: "handle_instagram",
    site: "https://...",
    tel: "06 XX XX XX XX",
    email: "contact@..."
  }
}
```

**Actuellement :** 22 événements en array, 5 marqués featured

---

## 🔧 Technologies & Logique JS Clé

### Variables Globales Principales
```javascript
const events = [...];  // Tableau événements
const TYPE_COLORS = {...};  // Couleurs par type
const TODAY = new Date().toISOString().slice(0,10);  // Pour archives
const VIEW_SEEDS = {...};  // Compteurs curieux de base

let homeView = 'map|list';  // Mode affichage accueil
let homeStatus = 'upcoming|archived';
let homeCity = '';
let homeRadius = 200;
let periodStart = '';
let periodEnd = '';
let currentGallery = [];
let currentPage = 'home';
```

### Fonctions Critiques

**Navigation & Routing :**
- `showPage(name)` → affiche/cache pages, met à jour nav active

**Filtrage accueil :**
- `computeHomeFilteredEvents()` → retourne array filtré selon tous les critères
- `applyMapFilters()` → maj carte (pins dimmed) + liste + compteur
- `renderHomeList(filtered)` → génère grille HTML

**Carte :**
- `buildMap()` → dessine SVG, crée pins avec écouteurs clic/survol
- `showTooltip(pin)` → affiche popup au survol
- `getEventDistance(ev)` → approx distance (à améliorer)

**Calendrier :**
- `renderPicker()` → génère grille calendrier mois courant
- Mode "range" vs "single"

**Événement :**
- `openEvent(id)` → remplit page événement, appelle `loadAndAnimateViews(id)`
- `loadAndAnimateViews(id)` → incrémente compteur curieux, anime le nombre
- `openLightbox(item)` → affiche photo agrandie

**Carrousel :**
- `renderFeatured()` → génère carrousel HTML + écouteurs nav/dots

**Recherche :**
- `renderResults()` → même logique que home list, applique tous les filtres

### LocalStorage
- `ebok-theme` → thème (SUPPRIMÉ, seulement dark maintenant)
- `views:${eventId}` → compteur curieux par event (fallback quand pas de `window.storage`)

### Gestion Dates
```javascript
function fmtDate(d) { /* "27 juin" */ }
function fmtDateRange(s, e) { /* "27 juin — 4 juillet 2026" */ }
function isPast(ev) { return ev.dateEnd < TODAY; }
```

---

## 🎬 Type d'Événements & Couleurs

| Type | Couleur | Cas d'usage |
|------|---------|-----------|
| Tournoi | #FF5722 (orange) | Compétitions |
| Camp | #1F8F6B (vert) | Entraînements collectifs |
| Voyage | #FFC93C (jaune) | Séjours basket |
| All-Star Game | #E8483A (rouge) | Matchs d'exhibition |
| Show | #9D6FFF (violet) | Spectacles (dunk contest) |
| Détections | #FF9800 (orange clair) | Scouts/recrutement |
| Clinic Coachs | #2196F3 (bleu) | Masterclass |
| Circuit 3x3 | #4CAF50 (vert clair) | Tournois 3x3 (FIBA Open/Start/Growth) |
| Handibasket | #9C27B0 (mauve) | Inclusivité |
| Matchs de Gala | #F44336 (rouge clair) | Événements spéciaux |
| Divers | #607D8B (gris bleu) | Autres |

---

## 💰 Monétisation (Implémentée en UI, pas backend)

**Espace diffuseurs — Trois formules :**
- **Standard (gratuit)** : listing seul
- **Mise en avant (29€)** : carrousel 7j
- **Mise en avant + Mailing (59€)** : carrousel + envoi communauté région

**UI :** Radio buttons de mode visibilité au formulaire création. Message de succès adapté si option payante choisie.

**À faire :** Brancher Stripe / PayPal quand backend existe.

---

## 📈 Données Actuelles

- **22 événements** en base
- **5 featured** : La Ligue C, Clinic Tony Parker, 3x3 Open Paris, Camp ASVEL, Voyage Corse
- **Compteurs curieux** pré-remplis (VIEW_SEEDS) pour vraisemblance
- **Répartition géo** : 11 villes (Paris, Montpellier, Lyon, Nice, Toulouse, Nantes, Strasbourg, Bordeaux, Limoges, Bastia, Villeurbanne, Cholet)

---

## 🚀 Prochaines Étapes Prioritaires

### Phase 1 (MVP + Backend)
1. **Firebase/Supabase setup** → tables `events`, `users`, `submissions`
2. **Auth diffuseurs** → signup/login
3. **API CRUD événements** → créer, lire, modifier
4. **Géolocalisation réelle** → remplacer rayon km approximatif par vraie distance + autocomplete ville

### Phase 2 (Monétisation)
5. **Intégration Stripe** → paiement featured/mailing
6. **Dashboard diffuseur** → stats vues, modifier event, gérer featured
7. **Admin dashboard** → modération, stats globales

### Phase 3 (Engagement)
8. **Notifications** → "Événement match tes préfs" email
9. **Système likes** → ♥ "Suivre" événement
10. **Évaluations** → notes/commentaires

---

## 🛠️ Notes Techniques Importantes

### Performance
- **SVG carte** : ~5KB, acceptable. Envisager image raster si 100+ pins.
- **Events array** : ok jusqu'à 500-1000 events. Après = pagination nécessaire.
- **Images poster** : actuellement base64 (un seul event = 185KB). Au-delà = URLs externes recommandées.

### Responsive
- Media queries : 980px breakpoint (carte 2-col → 1-col, grille 3-col → 2-col → 1-col)
- Mobile : carrousel plein écran, filtres sticky

### Accessibilité
- ARIA labels sur boutons de nav
- Contraste respecté (chalk sur asphalt = AA)
- Pas testé pour lecteurs d'écran — à améliorer

### Browser Support
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Pas d'IE11
- Requires localStorage, fetch, ES6

---

## 📁 Structure Fichier

**Tout est en UN seul fichier HTML :**
- `<style>` bloc : 1100+ lignes CSS
- `<script>` bloc : 1000+ lignes JS pur
- Pas de dépendances externes (fonts Google importées)
- Images intégrées en base64 ou URLs

**Avantage :** déploiement trivial (un fichier)  
**Inconvénient :** peu modulaire, maintient tricky au-delà de 2000 lignes

### À faire quand ça grandit :
- Passer à Vue/React si logique devient complexe
- Séparer en modules JS
- Mettre images sur CDN

---

## 🎯 Points Clés pour Continuation

1. **Tous les filtres fonctionnent** (ville search, dates calendrier, rayon, type, statut) — logique JS complète
2. **Carrousel Netflix-style opérationnel** — peut en ajouter/retirer sans toucher JS (juste `featured: true`)
3. **Formulaire diffuseur complet** — juste besoin de connecter au backend pour sauvegarder
4. **Design cohérent** — toutes les pages utilisent même palette/typo, mode sombre uniquement
5. **Pas de dépendance externe** — zero NPM, déploie n'importe où (GitHub Pages suffit)

---

## 📞 Contacts / Infos Organisateurs Exemples

Pour tester, utiliser les patterns :
- **Instagram :** `@handle` (sans le @)
- **Site :** `https://...`
- **Tel :** `06 XX XX XX XX` ou vide
- **Email :** `contact@...` ou vide

---

**Fin du briefing.**

À partir de là, tout nouveau Claude peut reprendre le projet en changeant les événements, en branchant un backend, et en implémentant les features manquantes (auth, paiement, notifications).

Bonne chance ! 🚀
