/**
 * Détection de doublons d'événements.
 *
 * Service isolé afin de pouvoir faire évoluer la stratégie de matching
 * sans modifier les contrôleurs API.
 */

export class EventDuplicateService {
  /**
   * Retourne un score de similarité entre deux fiches.
   */
  score(a = {}, b = {}) {
    let score = 0;

    if (this.same(a.nom || a.title, b.nom || b.title)) score += 40;
    if (this.same(a.ville, b.ville)) score += 20;
    if (this.same(a.organisateur || a.orgName, b.organisateur || b.orgName)) score += 10;
    if (this.same(a.dateDebut || a.dateStart, b.dateDebut || b.dateStart)) score += 30;

    return score;
  }

  same(a, b) {
    if (!a || !b) return false;
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  }

  isProbableDuplicate(score) {
    return score >= 70;
  }
}
