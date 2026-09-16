-- Remise à zéro des compteurs de « curieux ».
--
-- POURQUOI
-- Avant la sécurisation de /api/views, deux choses faussaient ces chiffres :
--   1. tout événement démarrait à 120 (VIEW_SEEDS[id] || 120), y compris les
--      vrais — 120 curieux étaient donc inventés dès la première vue ;
--   2. la route acceptait un paramètre `seed` venu du navigateur et
--      incrémentait à chaque requête, sans mémoire : n'importe qui pouvait
--      fixer ou gonfler un compteur.
-- Les valeurs héritées ne sont donc pas défendables. On repart de zéro : à
-- partir de maintenant, un compteur ne reflète que des visites réelles, et un
-- même visiteur n'est compté qu'une fois par jour et par événement.
--
-- OÙ L'EXÉCUTER
-- Console Neon → le projet EBOK → onglet « SQL Editor » → coller, puis Run.
--
-- SANS DANGER POUR LE RESTE
-- Ne touche ni aux événements, ni aux comptes, ni aux profils, ni aux favoris.
-- Seuls les compteurs et les empreintes de déduplication sont effacés.

BEGIN;

-- Compteurs affichés sur les fiches.
DELETE FROM event.views;

-- Empreintes de déduplication du jour : sans cela, un visiteur déjà passé
-- aujourd'hui ne serait pas recompté avant demain.
DELETE FROM event.view_hits;

COMMIT;

-- Contrôle : les deux doivent renvoyer 0.
SELECT (SELECT COUNT(*) FROM event.views)     AS compteurs_restants,
       (SELECT COUNT(*) FROM event.view_hits) AS empreintes_restantes;
