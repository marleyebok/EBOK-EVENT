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

/* Nettoie une éventuelle clôture ```json ... ``` puis parse en objet. */
export function parseJsonResponse(text, invalidJsonCode) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const value = JSON.parse(cleaned);
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("not_an_object");
    return value;
  } catch {
    throw new AIProviderError(invalidJsonCode, "Le modèle a renvoyé un JSON invalide.", 422);
  }
}
