/**
 * Adaptateur Google AI Studio / Gemini.
 *
 * Cette classe encapsule tous les appels Gemini.
 */

export class GeminiProvider {
  async extractEvent(input) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY manquante");
    }

    // Implémentation Gemini conservée dans ce provider uniquement.
    // Le prompt métier sera centralisé dans prompts/eventExtractionPrompt.js.
    throw new Error("GeminiProvider: extraction à connecter au prompt métier");
  }
}
