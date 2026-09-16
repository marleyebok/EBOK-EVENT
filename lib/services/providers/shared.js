/**
 * Utilitaires communs aux adaptateurs IA (Gemini, OpenRouter, ...).
 */

export class AIProviderError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = "AIProviderError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Objet JSON complet commençant à `debut`, ou null s'il n'est pas refermé.
 *
 * Découper entre la première accolade et la dernière ne suffit pas : le modèle
 * commente volontiers sa réponse après coup, et une accolade peut apparaître
 * dans une chaîne. On suit donc l'imbrication, en ignorant ce qui est entre
 * guillemets.
 */
function objetDepuis(texte, debut) {
  let profondeur = 0;
  let dansChaine = false;
  let echappe = false;

  for (let i = debut; i < texte.length; i++) {
    const c = texte[i];
    if (echappe) { echappe = false; continue; }
    if (dansChaine) {
      if (c === "\\") echappe = true;
      else if (c === '"') dansChaine = false;
      continue;
    }
    if (c === '"') { dansChaine = true; continue; }
    if (c === "{") profondeur++;
    else if (c === "}" && --profondeur === 0) return texte.slice(debut, i + 1);
  }
  return null;
}

/* Toutes les accolades ouvrantes sont des débuts possibles : le modèle peut
   citer un exemple de format avant de répondre. On les essaie dans l'ordre, en
   s'arrêtant au bout de quelques-unes — au-delà, ce n'est plus du bavardage. */
const MAX_CANDIDATS = 20;

function candidats(texte) {
  const trouves = [texte];
  for (let i = texte.indexOf("{"); i >= 0 && trouves.length <= MAX_CANDIDATS; i = texte.indexOf("{", i + 1)) {
    const objet = objetDepuis(texte, i);
    if (objet) trouves.push(objet);
  }
  return trouves;
}

/**
 * Convertit la réponse du modèle en objet.
 *
 * Un modèle d'instruction respecte rarement « ne réponds que du JSON » à la
 * lettre : il encadre de ```json, annonce « Voici les informations : », ou
 * réfléchit à voix haute entre balises <think>. Exiger un JSON nu ferait échouer
 * une réponse par ailleurs parfaitement exploitable — on va donc le chercher.
 */
export function parseJsonResponse(text, invalidJsonCode) {
  const cleaned = String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  for (const candidat of candidats(cleaned)) {
    try {
      const value = JSON.parse(candidat);
      if (value && !Array.isArray(value) && typeof value === "object") return value;
    } catch {
      // On tente le candidat suivant.
    }
  }

  // Un extrait de ce qui a été reçu : sans lui, impossible de savoir si le
  // modèle a bavardé, refusé, ou répondu dans un autre format.
  const extrait = cleaned.slice(0, 120).replace(/\s+/g, " ");
  throw new AIProviderError(
    invalidJsonCode,
    `Le modèle a renvoyé un JSON invalide. Début de sa réponse : « ${extrait} »`,
    422
  );
}
