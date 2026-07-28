/**
 * Préparation des brouillons générés par IA.
 *
 * Ce service ne publie jamais automatiquement un événement.
 * Il prépare uniquement les données destinées à la validation administrateur.
 */

export class EventDraftService {
  createDraftPayload(event, metadata = {}) {
    return {
      status: "draft_ai",
      data: {
        ...event,
        aiGenerated: true,
        importedAt: new Date().toISOString(),
        ...metadata
      }
    };
  }
}
