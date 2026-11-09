# 🗄️ Anciens sites EBOK — mis hors ligne

> Mémo pour se souvenir de ce qui a été fait, et comment revenir en arrière.
> **Décision du 9 novembre 2026 :** seul **EBOK Event** (`event.ebok.fr`) est
> développé et maintenu. Tous les autres sites EBOK sont mis hors ligne, **sans
> être supprimés**.

## Ce qui a été fait

| Élément | Action | Réversible ? |
|---|---|---|
| Sites sur Vercel : `ebok.fr`, `www.ebok.fr`, Mercato, Forum, Playbook… | **Domaines retirés** des projets Vercel (Settings → Domains → Remove). Les projets et leurs déploiements sont **conservés**. | ✅ oui |
| Application Clerk d'`ebok.fr` (ancienne clé `clerk.ebok.fr`) | **Supprimée** — elle bloquait le passage en production d'EBOK Event (« root domain already in use »). | ❌ non : ses comptes membres sont perdus |

> À compléter si besoin : la liste exacte des projets Vercel désactivés et de
> leurs anciennes adresses (ex. `mercato.ebok.fr`).

## Remettre un ancien site en ligne

1. **Vercel** → ouvrir le projet → **Settings → Domains → Add** → saisir son
   ancienne adresse.
2. Si l'adresse a été supprimée chez **OVH** (zone DNS d'`ebok.fr`), recréer
   l'enregistrement que Vercel indique.
3. Si le site avait besoin de **connexion** : son application Clerk n'existe
   plus. Il faudra en créer une nouvelle — et, si elle doit utiliser un domaine
   en `ebok.fr`, la déclarer en *Secondary application*, car `ebok.fr` est
   désormais pris par EBOK Event.
4. Si une **protection** (Settings → Deployment Protection) a été activée, la
   désactiver.

## Ne jamais faire

- **Résilier le domaine `ebok.fr`** ou supprimer sa zone DNS chez OVH :
  `event.ebok.fr` et la boîte `contact@ebok.fr` en dépendent.
- Supprimer chez OVH les enregistrements **MX / SPF / TXT** de l'e-mail, ni
  l'enregistrement **`event`**.
