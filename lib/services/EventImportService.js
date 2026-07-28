/**
 * Orchestrateur d'import IA événement.
 *
 * Centralise la transformation de la réponse IA afin de conserver
 * les contrôleurs simples et préparer la création de brouillons.
 */

export class EventImportService {
  normalize(aiResponse = {}) {
    const rawEvents = Array.isArray(aiResponse.events)
      ? aiResponse.events
      : [aiResponse];

    return {
      events: rawEvents
        .filter(Boolean)
        .map(event => this.normalizeEvent(event))
    };
  }

  normalizeEvent(event = {}) {
    return {
      nom: event.nom || event.title || "",
      type: event.type || "",
      description: event.description || "",
      organisateur: event.organisateur || event.orgName || "",
      telephone: event.telephone || "",
      email: event.email || "",
      siteInternet: event.siteInternet || event.site || "",
      dateDebut: event.dateDebut || event.dateStart || "",
      dateFin: event.dateFin || event.dateEnd || "",
      heure: event.heure || "",
      ville: event.ville || event.city || "",
      adresse: event.adresse || event.address || "",
      codePostal: event.codePostal || "",
      departement: event.departement || "",
      region: event.region || "",
      pays: event.pays || "",
      categoriesAge: event.categoriesAge || event.age || [],
      sexe: event.sexe || "",
      tarif: event.tarif || "",
      lienInscription: event.lienInscription || ""
    };
  }
}
