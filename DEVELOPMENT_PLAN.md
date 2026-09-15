# 🚀 EBOK Event — Plan de développement

> Feuille de route unique du projet. Le `README.md` décrit **comment ça marche**
> (architecture, variables d'environnement, déploiement) ; ce fichier décrit
> **ce qui reste à faire**. `EBOK_Event_Briefing.md` reste la référence produit
> et design (palette, types d'événements, ton).

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
- [x] Comptes Clerk : inscription, connexion, e-mail + Google
- [x] Rôles et droits vérifiés **côté serveur** : public / diffuseur / admin
- [x] CRUD événements complet + circuit de validation (`pending` → `approved`)
- [x] Compteurs de « curieux », favoris, profil membre
- [x] Profil diffuseur (`/compte/profil`) qui pré-remplit le formulaire de publication
- [x] Affiches hébergées sur Vercel Blob + reprise des affiches stockées en base
- [x] Aperçu au partage et indexation par événement (`api/evenement.js` → Open Graph + schema.org)
- [x] Carte de France interactive, carte du monde pour l'étranger
- [x] Assistant IA d'import depuis un lien ou une image (réservé admin)
- [x] Autocomplétion de ville hors ligne (`cities-fr.js`) + repli sur la Base Adresse Nationale
- [x] Thème clair / sombre
- [x] Échappement des données d'événement dans les rendus HTML (XSS stocké)

---

## 🎯 Chantier en cours : instance Clerk dédiée

Les comptes tournent encore sur l'instance Clerk `clerk.ebok.fr`, partagée avec
les autres applications. Il faut une instance propre à EBOK Event.

**⚠️ Conséquence à assumer :** les comptes ne se transfèrent pas d'une instance
Clerk à l'autre. Tous les membres devront **se réinscrire**, et les événements
déjà publiés perdront le lien avec leur diffuseur (leur `user_id` pointera vers
un compte qui n'existe plus). L'admin étant reconnu par **e-mail** et non par
identifiant, les droits d'administration, eux, se retrouvent automatiquement.

**Marche à suivre**

1. Créer une instance sur `dashboard.clerk.com` (activer e-mail + Google).
2. Remplacer `PUBLISHABLE_KEY` dans `public/js/clerk.js` — **une seule ligne**,
   le domaine de l'instance est décodé de la clé.
3. Mettre à jour `CLERK_SECRET_KEY` sur Vercel, puis redéployer.
4. Reprendre les événements orphelins : soit réattribuer `user_id` en base une
   fois les diffuseurs réinscrits, soit les laisser sous le compte admin.

> À faire de préférence **avant** d'avoir beaucoup de diffuseurs inscrits :
> plus on attend, plus la réinscription coûte cher.

---

## 🔜 Prochaines étapes

### 1. Géolocalisation réelle *(prioritaire)*

Le filtre « autour de moi » repose encore sur un rayon approximatif.

- [ ] Demander la position au navigateur et la mémoriser
- [ ] Stocker `latitude` / `longitude` sur chaque événement (les coordonnées des
      villes sont déjà dans `cities-fr.js` — la moitié du travail est faite)
- [ ] Remplacer le rayon approximatif par la **formule de Haversine**
- [ ] Trier les résultats par distance réelle

### 2. « J'y vais » *(petit effort, fort impact)*

Compteur de participants intéressés : preuve sociale, et première brique vers la
billetterie.

- [ ] Table `event.attendees` (`event_id`, `user_id`), ou un champ dans `profiles`
- [ ] Bouton sur la fiche événement, réservé aux membres connectés
- [ ] Compteur affiché sur la fiche et sur les cartes

### 3. Ajouter à mon agenda *(petit effort)*

- [ ] Génération d'un fichier `.ics` (Google / Apple Agenda), côté navigateur

### 4. Répertoire des playgrounds 3x3 *(gros chantier)*

Recenser les terrains de France et les afficher sur la carte. Fort potentiel
communautaire, mais dépend de la géolocalisation.

- [ ] Entité « terrain » en base (distincte des événements)
- [ ] Affichage sur la carte + filtre « autour de moi »
- [ ] Contribution communautaire avec modération admin

### 5. Plus tard

- [ ] **Alertes e-mail** — « préviens-moi des *tournois* près de *Montpellier* »
      (nécessite un service d'envoi type Resend ou SendGrid)
- [ ] **Avis / discussion** — questions à l'organisateur, retours sur les
      éditions passées (demande de la modération)
- [ ] **Billetterie / inscriptions** — avec commission

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
node --check public/js/app.js   # contrôle de syntaxe rapide
```

> Le site est **statique** : pas d'étape de build, pas de bundler. Un fichier
> modifié est actif au rechargement de la page.
