/**
 * Prompt unique d'extraction des événements basket.
 *
 * Le modèle doit retourner uniquement un JSON valide.
 */
export const EVENT_EXTRACTION_PROMPT = `
Tu extrais les informations d'un événement basket.

Retourne uniquement un objet JSON valide.
Aucun texte libre avant ou après.

Champs autorisés:
nom,type,description,organisateur,telephone,email,siteInternet,
dateDebut,dateFin,heure,ville,adresse,codePostal,departement,
region,pays,categoriesAge,sexe,tarif,lienInscription.

Si une information est absente retourne une chaîne vide.
N'invente jamais une information.
`;
