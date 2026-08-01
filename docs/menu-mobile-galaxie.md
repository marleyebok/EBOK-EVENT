# Prompt — porter le menu mobile EBOK dans cette application

> Ce fichier vit dans le repo EBOK Event, qui sert de référence pour la galaxie.
> À copier tel quel dans une session Claude Code ouverte sur le repo concerné
> (basketball, video, mercato, playbook, stats, notebook, académie, scouting,
> blog, forum, médias, workout). Remplace seulement les deux valeurs marquées
> « À REMPLIR » avant d'envoyer.
>
> Si le menu d'Event évolue, c'est ce fichier qu'on met à jour — pas une copie
> dans chaque repo.

---

## Contexte

Cette application fait partie de la galaxie EBOK. **EBOK Event a déjà été refait**
et sert de référence : repo `marleyebok/EBOK-EVENT`, fichiers
`public/js/mobile-nav.js`, `public/index.html` (bloc `<!-- MENU MOBILE -->`) et la
fin de `public/css/styles.css`. Lis-les avant de commencer : **reprends la même
structure, les mêmes noms de classes et les mêmes libellés**, pour que les
applications de la galaxie se comportent à l'identique sur téléphone.

En revanche, **n'importe pas le code tel quel** : EBOK Event est en HTML/JS/CSS
sans framework. Si cette application est en React / Next / Vue, réécris la même
chose dans les conventions du repo (un composant + un hook), sans recopier du
DOM impératif.

**À REMPLIR — action principale de cette app** : le gros bouton orange du
panneau. Sur Event c'est « ➕ Publier un événement ». Ici, mets l'action que
l'utilisateur vient faire le plus souvent (publier, importer, créer une
séance…). S'il n'y en a pas d'évidente, supprime le bouton et ne mets rien.

**À REMPLIR — pages de l'app** : la liste des destinations de l'entête actuelle.

## Objectif

En dessous de 900 px de large, la barre du haut ne garde que **le logo à gauche**
et **un bouton « Menu » à droite**. Tout le reste — pages, compte, thème, galaxie
— vit dans un panneau plein écran. Au-dessus de 900 px, **rien ne change** :
le desktop garde sa barre de liens actuelle.

## 1. Barre du haut, en dessous de 900 px

- Logo à gauche, cliquable, retour à l'accueil. Une seule ligne, pas de
  `flex-wrap` : si un `@media` existant fait passer les liens à la ligne en
  dessous du logo, neutralise-le.
- Bouton à droite : pilule arrondie, fond `--asphalt-2`, bordure `--line-strong`,
  trois traits de 16 px + le mot **« Menu »** écrit à côté (le mot compte : un ☰
  seul est mal compris par un public non technique). Ouvert, il devient une croix
  + « Fermer ».
- Sont masqués et déplacés dans le panneau : la rangée de liens de navigation,
  la bascule de thème, les boutons de connexion / inscription / déconnexion.

## 2. Le panneau

Fixe, du bas de la barre du haut jusqu'en bas de l'écran. Sa position haute vient
d'une variable CSS `--topbar-h` calculée en JS à partir de `.topbar.offsetHeight`
(la barre change de hauteur selon les écrans, ne code pas la valeur en dur).
Il glisse depuis la droite en ~240 ms et est `visibility:hidden` quand il est
fermé — pas seulement transparent — pour sortir de l'ordre de tabulation.

Contenu, dans cet ordre :

1. **Visiteur** : titre « Bienvenue 👋 », une phrase d'accroche, puis deux boutons
   pleine largeur **[Se connecter] [S'inscrire]**.
2. **Connecté** : avatar 48 px (photo de profil, sinon les initiales sur un
   dégradé orange→jaune), nom, e-mail.
3. **Connecté** : le gros bouton orange de l'action principale (voir « À REMPLIR »).
4. Groupe **« NAVIGUER »** : les pages de l'app. Visiteur, l'action principale
   apparaît ici comme entrée de liste au lieu du gros bouton.
5. Groupe **« MON ESPACE »**, connecté seulement : profil, les raccourcis propres
   à l'app avec leur compteur à droite (sur Event : favoris, publications),
   « Administration » en jaune si le compte est admin, puis « Paramètres du
   compte » qui pointe vers `/compte/general` si l'app a cet espace.
6. Séparateur.
7. Ligne **thème** : icône 🌙/☀️, libellé « Thème sombre » / « Thème clair », et un
   interrupteur à droite. Elle ne ferme pas le panneau.
8. `<details>` **« La galaxie EBOK »**, replié par défaut, listant les 13 apps avec
   leur pastille de couleur ; l'app courante est marquée « vous êtes ici » et non
   cliquable. Données en fin de prompt.
9. Pied fixe : **Déconnexion** (connecté) à gauche, `contact@ebok.fr` à droite.

Les entrées font au moins 48 px de haut. L'entrée de la page ouverte est
surlignée : fond `--asphalt-3` + un liseré orange de 3 px à l'intérieur, à gauche.

## 3. Comportement

- `aria-expanded` et `aria-controls` sur le bouton, `aria-label` qui bascule entre
  « Ouvrir le menu » et « Fermer le menu ».
- `Échap` ferme. Le focus est enfermé dans le panneau tant qu'il est ouvert, et
  revient sur le bouton à la fermeture.
- Le fond ne défile pas quand le panneau est ouvert (`overflow:hidden` sur `body`).
- Un clic sur n'importe quelle entrée navigue **puis** ferme le panneau.
- Si la fenêtre repasse au-dessus de 900 px, le panneau se ferme tout seul.
- L'entrée active et l'état du compte sont resynchronisés à chaque ouverture.

## 4. Intégration — la règle importante

**Ne duplique ni le routage ni l'authentification.** Branche-toi sur ce qui existe :

- Sur Event, les entrées portent l'attribut `data-nav` déjà câblé par le routeur
  existant, et les boutons de connexion relaient le clic vers les boutons
  d'origine de la barre du haut. Zéro logique recopiée.
- Ici, trouve l'équivalent (routeur, store, contexte d'auth) et fais pareil. Si le
  panneau a besoin de l'état du compte, expose une petite interface
  (`window.EBOK_NAV = { setUser, setCounts, close }` ou un contexte React) que le
  code d'auth existant alimente — quelques lignes ajoutées, aucune réécriture.

## 5. Épurer la page au passage

Toujours en dessous de 900 px :

- Supprime la rangée de liens qui défile horizontalement sous le logo.
- Si l'accueil a un panneau latéral de filtres qui pousse le contenu principal
  hors de l'écran, replie-le derrière un bouton `🔍 Filtrer` affichant une pastille
  « N actifs ». Le contenu principal doit être visible sans faire défiler la page.
- Ne touche à rien au-dessus de 900 px.

## 6. Ancienne barre « Galaxie »

Si le repo contient encore `ebok-galaxy.js` (la barre noire tout en haut du
`<body>`), **supprime le fichier et la balise `<script>` qui l'appelle** : la
galaxie vit maintenant dans le panneau et dans le pied de page. **Garde
`ebok-footer.js`**, il est inchangé. Note que cela retire aussi la barre du
desktop — c'est le choix fait sur Event ; signale-le dans ton message final.

## 7. Jetons de style

Utilise **exclusivement** les variables CSS du repo (`--asphalt`, `--asphalt-2`,
`--asphalt-3`, `--chalk`, `--chalk-dim`, `--orange`, `--yellow`, `--line`,
`--line-strong`, `--font-display`, `--font-mono`). Aucune couleur en dur, sinon le
thème clair casse. Vérifie le rendu dans les deux thèmes.

## 8. Critères d'acceptation

Vérifie pour de vrai, dans un navigateur (Playwright + Chromium sont
disponibles ; sers le site en local et prends des captures) :

1. En 390×844 : barre sur une ligne, panneau qui s'ouvre et se ferme, navigation
   depuis le panneau, entrée active correcte.
2. En 320×700 (iPhone SE) : aucun débordement horizontal
   (`document.documentElement.scrollWidth <= window.innerWidth`).
3. En 1280 px : le bouton et le panneau sont absents, la barre de liens desktop et
   la zone compte sont intactes.
4. Thème sombre **et** thème clair lisibles dans le panneau.
5. `Échap` ferme, le focus revient au bouton, le fond ne défile pas.
6. États visiteur / connecté / admin (simule-les si l'auth n'est pas joignable en
   local, par exemple en appelant directement l'interface exposée).
7. **Aucune erreur JS** dans la console (les échecs réseau vers des services
   externes ne comptent pas).

Joins tes captures d'écran au message final.

## 9. Livraison

Branche `claude/menu-mobile`, commits en français, messages descriptifs.
**N'ouvre pas de pull request** sauf demande explicite. Termine par un résumé
court : fichiers touchés, ce qui a été vérifié, et ce que tu as laissé de côté.

## Données — la galaxie EBOK

```js
{ name: 'BASKETBALL', color: '#E8590C', url: 'https://ebok.fr/' }
{ name: 'VIDEO',      color: '#1FA98C', url: 'https://video.ebok.fr/' }
{ name: 'EVENT',      color: '#E23A3A', url: 'https://event.ebok.fr/' }
{ name: 'MERCATO',    color: '#4CA62E', url: 'https://mercato.ebok.fr/' }
{ name: 'PLAYBOOK',   color: '#E08A2B', url: 'https://playbook.ebok.fr/' }
{ name: 'STATS',      color: '#2E6FD6', url: 'https://stats.ebok.fr/' }
{ name: 'NOTEBOOK',   color: '#7A86A0', url: 'https://notebook.ebok.fr/' }
{ name: 'ACADÉMIE',   color: '#8A4CE0', url: 'https://academie.ebok.fr/' }
{ name: 'SCOUTING',   color: '#EA5A3C', url: 'https://scouting.ebok.fr/' }
{ name: 'BLOG',       color: '#C8317E', url: 'https://blog.ebok.fr/' }
{ name: 'FORUM',      color: '#18A0C4', url: 'https://forum.ebok.fr/' }
{ name: 'MÉDIAS',     color: '#C9A227', url: 'https://medias.ebok.fr/' }
{ name: 'WORKOUT',    color: '#A3BD18', url: 'https://workout.ebok.fr/' }
```

Marque l'app courante « vous êtes ici ». Cette liste est un miroir de
`src/data/tools.ts` du site mère : si elle a changé là-bas, c'est elle qui fait foi.
