/**
 * Adaptateur OpenRouter.
 *
 * Préparé pour permettre un changement de fournisseur sans modifier
 * la logique métier d'import événement.
 */

export class OpenRouterProvider {
  async extractEvent(input) {
    throw new Error("OpenRouterProvider non configuré");
  }
}
