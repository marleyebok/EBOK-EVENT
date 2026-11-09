# EBOK Event — repères pour Claude

L'agenda collaboratif du basket français, en ligne sur `event.ebok.fr`.
Échanges avec le propriétaire **en français**.

- `README.md` : comment ça marche (architecture, variables d'environnement, déploiement).
- `DEVELOPMENT_PLAN.md` : ce qui reste à faire, checklist de lancement, règles à ne pas enfreindre.
- `EBOK_Event_Briefing.md` : référence produit et design.
- `ANCIENS_SITES.md` : **les autres sites EBOK (ebok.fr, Mercato, Forum, Playbook…) ont été mis hors ligne le 9/11/2026** — ce qui a été fait et comment les remettre en ligne. À consulter dès qu'il est question d'un de ces sites.

Pile : HTML/CSS/JS pur sans build (`public/`), fonctions Vercel (`api/`), Neon, Clerk, Vercel Blob.
Seul EBOK Event est développé : ne pas réintroduire de lien ou de dépendance vers un autre site EBOK.
