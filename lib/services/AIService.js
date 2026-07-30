/**
 * Service IA centralisé EBOK Event.
 *
 * Les contrôleurs ne doivent jamais appeler un fournisseur IA directement.
 * Le fournisseur actif est choisi via AI_PROVIDER.
 */
import { GeminiProvider } from "./providers/GeminiProvider.js";
import { OpenRouterProvider } from "./providers/OpenRouterProvider.js";

export class AIService {
  constructor() {
    const provider = process.env.AI_PROVIDER || "openrouter";

    if (provider === "gemini") {
      this.provider = new GeminiProvider();
    } else {
      this.provider = new OpenRouterProvider();
    }
  }

  /**
   * Extrait une fiche événement depuis une URL ou une image.
   */
  async extractEvent(input) {
    return this.provider.extractEvent(input);
  }
}
