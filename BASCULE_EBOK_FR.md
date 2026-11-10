# 🔁 Bascule vers ebok.fr — ce qu'il te reste à faire

> Rédigé le 10/11/2026. Compte **20 à 30 minutes**, plus le temps d'attente
> de Clerk. Suis les étapes **dans l'ordre** : le site reste en ligne pendant
> toute l'opération.

## ✅ Déjà fait (par Claude)

- **Vercel** : `ebok.fr` et `www.ebok.fr` sont branchés sur le projet
  `ebok-event`. `www.ebok.fr` redirige vers `ebok.fr`.
- **OVH** : rien à faire pour le site. Les DNS d'`ebok.fr` pointaient déjà
  sur Vercel (ils servaient l'ancien site) ; Vercel les juge corrects.
- **Code** : « EBOK Event » → « EBOK » et `event.ebok.fr` → `ebok.fr`
  partout (textes, pages légales, sitemap, partage, alertes), plus une
  redirection de `event.ebok.fr` vers `ebok.fr`. Prêt dans une demande de
  fusion, **pas encore en ligne** : elle attend tes étapes 1 et 2.

> ⚠️ **En attendant, ne communique pas encore sur ebok.fr.** Le site s'y
> affiche déjà, mais **la connexion n'y fonctionnera qu'après l'étape 1**.
> `event.ebok.fr` marche normalement.

---

## Étape 1 — Clerk : passer l'application sur ebok.fr (10 min + attente)

1. Va sur [dashboard.clerk.com](https://dashboard.clerk.com) et ouvre
   l'application **EBOK Event**.
2. En haut, mets l'interrupteur sur **Production**.
3. **Renomme l'application** : **Configure → Settings** (ou *Application*)
   → nom : **`EBOK`** → **Save**. C'est le nom affiché dans les e-mails de
   Clerk (« Connecte-toi à EBOK »).
4. Va dans **Configure → Domains** (rubrique *Developers*).
5. Clique sur **Change domain** (en haut de la page, ou dans le menu ⋯).
6. Saisis **`ebok.fr`** → si on te demande *Primary* ou *Secondary*, choisis
   **Primary** → **Confirm** / **Save**.
7. Clerk affiche la liste des enregistrements DNS. **Compare-la avec ta
   zone OVH** (OVH → Web Cloud → Noms de domaine → ebok.fr → Zone DNS) :
   - les noms sont normalement **les mêmes qu'aujourd'hui** (`clerk`,
     `accounts`, `clkmail`, `clk._domainkey`, `clk2._domainkey`) ;
   - si une **valeur** (cible) a changé, modifie la ligne chez OVH : ⋯ →
     Modifier l'entrée → colle la nouvelle cible, **avec le point final** ;
   - si une ligne **manque**, ajoute-la (type **CNAME**, sous-domaine =
     le nom sans `.ebok.fr`).
8. Clique sur **Verify** et attends que **tout soit vert** (de quelques
   minutes à quelques heures si tu as modifié des lignes).
9. Va dans **API Keys** (toujours en Production) et regarde la
   **Publishable key** :
   - si elle vaut toujours `pk_live_Y2xlcmsuZWJvay5mciQ` → **rien à faire** ;
   - si elle a **changé** → envoie-la à Claude (elle est publique), et
     **remplace la Secret key** sur Vercel : projet `ebok-event` → Settings →
     Environment Variables → `CLERK_SECRET_KEY` → ⋯ → Edit → colle la
     nouvelle `sk_live_…` → Save. **Ne l'envoie jamais à personne.**

## Étape 2 — Google Cloud : autoriser ebok.fr (5 min)

Sans ça, le bouton « Continuer avec Google » échouera sur ebok.fr.

1. Va sur [console.cloud.google.com](https://console.cloud.google.com), projet
   **EBOK Event** sélectionné en haut.
2. **APIs et services → Identifiants** (ou *Google Auth Platform → Clients*)
   → ouvre le client **EBOK Event – Clerk**.
3. **Origines JavaScript autorisées** → **Ajouter** → `https://ebok.fr`.
   Garde `https://event.ebok.fr` pour l'instant (tu pourras l'enlever dans un
   mois).
4. **URI de redirection autorisés** : **ne change rien**
   (`https://clerk.ebok.fr/v1/oauth_callback` reste valable).
5. **Enregistrer**.
6. **Écran de consentement → Branding** (*Image de marque*) :
   - Nom de l'application : **`EBOK`**
   - Page d'accueil : `https://ebok.fr`
   - Règles de confidentialité : `https://ebok.fr/confidentialite`
   - Conditions d'utilisation : `https://ebok.fr/cgu`
   - Domaines autorisés : `ebok.fr` (déjà présent)
   - → **Enregistrer**. Toujours **pas de logo** pour l'instant (un logo
     déclenche une vérification Google de plusieurs jours).

## Étape 3 — Prévenir Claude

Écris simplement **« Clerk et Google c'est fait »** (avec la nouvelle clé
`pk_live_…` si elle a changé). Claude fusionne alors la demande de fusion :
le site passe en « EBOK » et **`event.ebok.fr` redirige vers `ebok.fr`**.

## Étape 4 — Tester (5 min, en navigation privée)

- [ ] `https://ebok.fr` s'ouvre, le logo et le titre disent « EBOK ».
- [ ] `https://www.ebok.fr` → arrive sur `https://ebok.fr`.
- [ ] Un ancien lien, ex. `https://event.ebok.fr/cgu` → arrive sur
      `https://ebok.fr/cgu`.
- [ ] **Se connecter par e-mail** → ça marche, le badge **Admin** apparaît.
- [ ] **Se connecter avec Google** → ça marche.
- [ ] Ouvrir une fiche événement, puis coller son lien dans WhatsApp →
      l'aperçu affiche l'image de partage.

Un souci ? Envoie à Claude une capture de ce que tu vois.

## Étape 5 — Ensuite, à ton rythme

- **Réseaux sociaux** : mettre `https://ebok.fr` dans les bios Instagram et
  LinkedIn (textes prêts dans la conversation).
- **Google Search Console** : ajouter `ebok.fr` (vérification par un
  enregistrement TXT chez OVH), puis déclarer
  `https://ebok.fr/sitemap.xml`. Claude te guide quand tu veux.
- **Alertes e-mail (Resend)** : créer le compte, ajouter le domaine
  `ebok.fr`, poser chez OVH les enregistrements que Resend affiche, puis
  `RESEND_API_KEY` sur Vercel (voir README, « Alertes e-mail »).
- **Dans un mois** : retirer `https://event.ebok.fr` des origines Google.
  **Garde** en revanche la ligne `event` chez OVH et le domaine
  `event.ebok.fr` sur Vercel : c'est ce qui fait marcher la redirection des
  anciens liens.

## ⛔ À ne pas faire

- Supprimer chez OVH les lignes **MX / SPF / TXT** (ta boîte
  `contact@ebok.fr`), la ligne **`event`**, ou les lignes Clerk.
- Retirer `event.ebok.fr` du projet Vercel.
- Créer une **nouvelle** application Clerk : on garde celle-ci, on change
  seulement son domaine (sinon tous les comptes seraient perdus).
