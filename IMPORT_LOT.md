# Importer un lot d'événements

Pour faire entrer 5 à 15 événements d'un coup (liens, affiches, calendrier d'un
comité) sans les saisir un par un.

## Comment ça marche

1. L'admin envoie à Claude, dans une session sur ce projet, ses liens, affiches
   (images ou PDF) ou une page qui liste plusieurs événements.
2. Claude lit chaque source et rend **un lot au format JSON** décrit plus bas, avec
   un tableau de contrôle (une ligne par événement, avec les doutes).
3. L'admin ouvre **Administration → Importer → Importer un lot**, colle le lot,
   clique sur « Vérifier le lot », joint les affiches, puis ajoute.
4. Les événements sont créés **en attente de vérification** (ou en ligne tout de
   suite, au choix). Rien n'est publié sans que l'admin l'ait décidé.

L'écran compare le lot aux événements déjà sur le site (même jour et même titre,
ou même ville et titres proches) et décoche les doublons probables.

## Ce que Claude doit faire en préparant un lot

- **Ne jamais inventer.** Un champ qui n'est pas écrit sur la source reste vide ou
  absent. Pas de tarif, d'horaire ou d'organisateur « probable ».
- **Signaler chaque incertitude** dans `doutes` : année absente de l'affiche, date
  lisible en partie, lieu ambigu, lien douteux. Écrire de préférence
  `{ "champ": "dateStart", "note": "Année absente de l'affiche : 2027 supposé" }`
  (ou `"champs": [...]` pour plusieurs) : l'admin voit alors une ligne « ? » avec
  le champ à confirmer, modifiable sur place, dans l'aperçu du lot puis dans
  « À traiter ». Une simple phrase reste acceptée (le champ est deviné d'après
  ses mots). Champs possibles : `title`, `dateStart`, `dateEnd`, `address`,
  `horaires`, `tarif`, `sexe`, `age`, `niveau`, `lienInscription`,
  `lienBilletterie`, `reservation`, `orgName`, `insta`, `tel`, `email`, `site`,
  `description`.
- **Ne pas écrire de doute pour une information simplement absente** (tarif,
  horaires, adresse, âges, description, lien d'inscription ou contact, affiche) :
  l'écran la signale tout seul par une ligne « ✕ » à remplir. Un doute sert à ce
  qui est écrit mais incertain, ou à dire où chercher l'information manquante.
- **Année absente** : prendre la prochaine occurrence à venir et l'écrire dans
  `doutes`.
- **`source`** : l'adresse de la page (ou du fichier) d'où vient l'information.
  Pour une affiche jointe sans adresse, la laisser vide.
- **Doublons** : avant de rendre le lot, regarder les événements déjà en ligne
  (`https://ebok.fr/api/events`, liste publique) et retirer ou signaler ce qui
  existe déjà.
- **Valeurs fermées** : écrire exactement les valeurs des listes ci-dessous. Une
  valeur inconnue est remplacée par une valeur par défaut, avec une alerte.
- **Événement sans lieu précis** (national, « partout en France ») : ville
  `Paris`, et le préciser dans `address` et `description` (règle du projet).
- **Réseaux sociaux** : Instagram et Facebook sont en général illisibles sans
  connexion ; demander une capture de l'affiche plutôt que de deviner.
- Rendre **uniquement le JSON** dans un bloc de code, puis le tableau de contrôle.
  Maximum 50 événements par lot.

## Format

Un objet avec la liste `evenements` (une liste seule est aussi acceptée).

```json
{
  "evenements": [
    {
      "title": "Summer 3x3 de Montpellier",
      "type": "Circuit 3x3",
      "dateStart": "2027-07-10",
      "dateEnd": "2027-07-11",
      "city": "Montpellier",
      "address": "Gymnase Jean Bouin",
      "sexe": "Mixte",
      "age": ["U15", "U17"],
      "niveau": "Régional",
      "tarif": "10 € par équipe",
      "horaires": "9h à 18h",
      "orgName": "Mosson Basket",
      "email": "contact@exemple.fr",
      "lienInscription": "https://exemple.fr/inscription",
      "source": "https://exemple.fr/summer-3x3",
      "doutes": ["Année absente de l'affiche : 2027 supposé"]
    }
  ]
}
```

| Champ | Obligatoire | Valeurs |
|---|---|---|
| `title` | oui | texte (200 caractères au plus) |
| `type` | oui | `Tournoi`, `Camp`, `Voyage`, `All-Star Game`, `Show`, `Détections`, `Clinic Coachs`, `Circuit 3x3`, `Handibasket`, `Match Pro`, `Divers` (inconnu : `Divers`) |
| `dateStart` | oui | `AAAA-MM-JJ` |
| `dateEnd` | non | `AAAA-MM-JJ` (défaut : `dateStart`) |
| `city` | oui | nom de la ville ; sert à placer l'événement sur la carte |
| `region` | non | région officielle ; sinon déduite de la ville |
| `pays` | non | défaut `France` |
| `address` | non | adresse ou nom de la salle |
| `sexe` | non | `Masculin`, `Féminin`, `Mixte` (défaut `Mixte`) |
| `age` | non | liste parmi `Tout public`, `U7`, `U9`, `U11`, `U13`, `U15`, `U17`, `U18`, `U21`, `Adulte`, `Non renseigné` |
| `niveau` | non | `Tous les niveaux` (ouvert à tous : ressort dans toutes les recherches), `Loisir`, `Départemental`, `Régional`, `National`, `Espoirs`, `Pros` (défaut `Tous les niveaux`) |
| `tarif`, `horaires`, `buvette`, `reservation` | non | texte libre |
| `placesTotal` | non | nombre |
| `description` | non | texte (3 000 caractères au plus) |
| `orgName`, `insta`, `site`, `tel`, `email` | non | contact de l'organisateur |
| `lienInscription`, `lienBilletterie`, `siteOfficiel` | non | adresses web (un lien illisible est ignoré) |
| `voyage` | non | pour le type `Voyage` : `dateDepart`, `dateRetour`, `lieuxDepart`, `lieuRetour`, `destination`, `logement` |
| `affiche` | non | nom du fichier de l'affiche fournie avec le lot (sert à la placer automatiquement) |
| `source` | non | adresse web d'où vient l'information (gardée pour « vérifier à la source ») |
| `doutes` | non | liste de `{ champ, note }` (ou de phrases courtes) sur ce qui reste incertain |

L'image de l'affiche ne fait pas partie du JSON. L'admin la joint dans l'aperçu
(elle est compressée puis hébergée comme à la publication d'un événement) :

- **toutes d'un coup** avec « Joindre toutes les affiches » : chaque fichier va sur
  la ligne dont le champ `affiche` porte son nom (`"affiche": "03-tournoi-nice.jpg"`,
  l'extension et la casse ne comptent pas). Si le lot ne nomme aucune affiche, le
  numéro en tête du nom de fichier désigne la ligne (`03-…` → 3ᵉ événement) ;
- ou une par une, avec le bouton de chaque ligne.

Quand Claude prépare un lot avec des affiches, il nomme les fichiers
`NN-titre-court.jpg` dans l'ordre du lot et écrit ce nom dans `affiche`.

## Côté code

- Lignes « ? » et « ✕ » : `public/js/admin-verif.js` (`window.EbokVerif`), commun à
  l'aperçu du lot et à « À traiter ». Les doutes sont gardés sur la fiche dans
  `importe.doutes` sous la forme `{ note, champs, ok }` ; un champ corrigé ou
  confirmé (« C'est bon ») retire la ligne.

- Écran : `public/js/admin-import.js` (analyse, aperçu, ajout), rendu dans
  `#adminImport` de la page Administration.
- Création : même chemin que le formulaire de publication (`resolveCoords`,
  `hostPoster`, `EBOK_DATA.createEvent`) ; l'événement garde une trace
  `importe: { url, le, doutes }`.
- Droits : la création passe par `/api/events` ; seul un admin peut créer un
  événement directement en ligne.
