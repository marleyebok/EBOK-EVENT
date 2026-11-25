# EBOK — repères pour Claude

L'agenda collaboratif du basket français, en ligne sur `ebok.fr` (depuis le 10/11/2026 ; `event.ebok.fr` redirige vers `ebok.fr`). La marque s'appelle **EBOK**.
Échanges avec le propriétaire **en français**.

- `README.md` : comment ça marche (architecture, variables d'environnement, déploiement).
- `DEVELOPMENT_PLAN.md` : ce qui reste à faire, checklist de lancement, règles à ne pas enfreindre.
- `EBOK_Event_Briefing.md` : référence produit et design.
- `BASCULE_EBOK_FR.md` : marche à suivre du passage à ebok.fr (Clerk, Google, tests).
- `IMPORT_LOT.md` : **format du lot d'événements** que l'admin colle dans Administration → Importer. À lire dès qu'il envoie des liens, affiches ou un calendrier à ajouter au site : préparer le lot selon ce fichier, sans rien inventer.

Pile : HTML/CSS/JS pur sans build (`public/`), fonctions Vercel (`api/`), Neon, Clerk, Vercel Blob.
EBOK est un produit à part entière : aucune mention, aucun lien ni aucune dépendance vers un autre site EBOK, nulle part (site, code, documentation).
Événement sans lieu précis (national, « partout en France ») : on l'épingle sur Paris et on le précise dans le lieu et la description.
