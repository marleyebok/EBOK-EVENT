/**
 * Inscriptions EBOK — logique pure (sans base ni réseau).
 *
 * Un organisateur peut prendre les inscriptions directement sur EBOK au lieu
 * de renvoyer vers un lien externe. La configuration vit dans la fiche
 * (`data.inscriptions`), la capacité reste `placesTotal` (déjà saisi à la
 * publication) : une seule source pour le nombre de places.
 *
 *   data.inscriptions = {
 *     actif: true,
 *     dateLimite: "AAAA-MM-JJ" | "",
 *     questions: [{ id, libelle, type: "texte"|"choix"|"ouinon", options: [], obligatoire }]
 *   }
 *
 * Tout ce qui est ici peut s'éprouver sans base : c'est ce que fait
 * scripts/tester-inscriptions.mjs.
 */

export const TYPES_QUESTION = ["texte", "choix", "ouinon"];
export const MAX_QUESTIONS = 10;
export const MAX_REPONSE = 500;
/* E-mails groupés : par événement et par jour, pour qu'EBOK ne devienne pas
   un outil d'envoi en masse. L'admin n'a pas de limite. */
export const ENVOIS_PAR_JOUR = 3;
export const SEGMENTS = ["tous", "confirmes", "attente"];

function texte(v, max) {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Nettoie la configuration envoyée par le navigateur. Ce qui ne respecte pas
 *  le format est écarté plutôt que refusé : un organisateur ne doit pas
 *  perdre sa saisie pour une option vide. */
export function normaliserConfig(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(c.dateLimite || "")) ? String(c.dateLimite) : "";
  const vus = new Set();
  const questions = [];
  for (const q of Array.isArray(c.questions) ? c.questions : []) {
    if (questions.length >= MAX_QUESTIONS) break;
    if (!q || typeof q !== "object") continue;
    const libelle = texte(q.libelle, 120);
    if (!libelle) continue;
    const type = TYPES_QUESTION.includes(q.type) ? q.type : "texte";
    let id = /^q[a-z0-9]{1,12}$/.test(String(q.id || "")) ? String(q.id) : "";
    if (!id || vus.has(id)) {
      let n = questions.length + 1;
      while (vus.has("q" + n)) n++;
      id = "q" + n;
    }
    vus.add(id);
    const options =
      type === "choix"
        ? [...new Set((Array.isArray(q.options) ? q.options : []).map((o) => texte(o, 60)).filter(Boolean))].slice(0, 20)
        : [];
    // Une liste de choix sans option ne peut pas être remplie : on la
    // transforme en question libre.
    questions.push({ id, libelle, type: type === "choix" && !options.length ? "texte" : type, options, obligatoire: Boolean(q.obligatoire) });
  }
  return { actif: Boolean(c.actif), dateLimite: date, questions };
}

/** Vérifie les réponses d'un participant. Renvoie { ok, reponses } ou
 *  { ok:false, erreur, question }. Seules les questions connues sont gardées. */
export function validerReponses(questions, raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const reponses = {};
  for (const q of questions || []) {
    let v = r[q.id];
    if (q.type === "ouinon") {
      v = v === true || v === "oui" ? "oui" : v === false || v === "non" ? "non" : "";
    } else {
      v = String(v ?? "").trim().slice(0, MAX_REPONSE);
    }
    if (q.type === "choix" && v && !q.options.includes(v)) {
      return { ok: false, erreur: "choix_invalide", question: q.id };
    }
    if (q.obligatoire && !v) return { ok: false, erreur: "reponse_manquante", question: q.id };
    if (v) reponses[q.id] = v;
  }
  return { ok: true, reponses };
}

/** Les inscriptions sont-elles ouvertes ? `aujourdhui` au format AAAA-MM-JJ. */
export function etatOuverture(ev, aujourdhui) {
  const cfg = ev && ev.inscriptions;
  if (!cfg || !cfg.actif) return { ouvert: false, raison: "inactif" };
  if (ev.status && ev.status !== "approved") return { ouvert: false, raison: "non_publie" };
  const fin = ev.dateEnd || ev.dateStart || "";
  if (fin && fin < aujourdhui) return { ouvert: false, raison: "termine" };
  if (cfg.dateLimite && cfg.dateLimite < aujourdhui) return { ouvert: false, raison: "date_limite" };
  return { ouvert: true, raison: "" };
}

/** Capacité : `placesTotal` s'il est positif, sinon illimité (null). */
export function capacite(ev) {
  const n = parseInt(ev && ev.placesTotal, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Badge de disponibilité déduit du remplissage (null : on ne touche à rien). */
export function dispoAuto(places, confirmes) {
  if (!places) return null;
  const restant = places - confirmes;
  if (restant <= 0) return "complet";
  if (restant <= Math.max(2, Math.ceil(places * 0.2))) return "limite";
  return "dispo";
}

/* ------------------------------------------------------------------ */
/* Export CSV                                                          */
/* ------------------------------------------------------------------ */

/** Une cellule CSV sûre : guillemets doublés, et neutralisation des
 *  formules (une réponse « =HYPERLINK(…) » ne doit pas s'exécuter dans Excel). */
function cellule(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

/** CSV lisible par Excel en français : séparateur « ; » et BOM UTF-8. */
export function versCsv(inscrits, questions) {
  const tete = ["Statut", "Nom", "E-mail", "Inscrit le", ...(questions || []).map((q) => q.libelle)];
  const lignes = inscrits.map((i) => [
    i.statut === "attente" ? `Liste d'attente (${i.rang})` : "Confirmé",
    i.nom,
    i.email,
    i.inscritLe ? new Date(i.inscritLe).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : "",
    ...(questions || []).map((q) => (i.reponses || {})[q.id] || ""),
  ]);
  return "﻿" + [tete, ...lignes].map((l) => l.map(cellule).join(";")).join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------------ */
/* E-mails                                                             */
/* ------------------------------------------------------------------ */

function echappe(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function gabarit({ surtitre, titre, corpsHtml, lien, libelleLien, pied }) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f4f0e7;font-family:system-ui,-apple-system,sans-serif;color:#211f1b">
  <div style="max-width:520px;margin:0 auto;padding:28px 20px">
    <p style="margin:0 0 20px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6e675b">EBOK · ${echappe(surtitre)}</p>
    <div style="background:#fff;border:1px solid #e3ddcf;border-radius:14px;padding:22px">
      <h1 style="margin:0 0 12px;font-size:21px;line-height:1.25">${echappe(titre)}</h1>
      ${corpsHtml}
      ${lien ? `<a href="${echappe(lien)}" style="display:inline-block;margin-top:16px;background:#ff5722;color:#191008;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">${echappe(libelleLien)}</a>` : ""}
    </div>
    <p style="margin:22px 0 0;font-size:12.5px;color:#6e675b;line-height:1.5">${pied}</p>
  </div></body></html>`;
}

function infosEvenement(ev) {
  const lieu = [ev.city, ev.region].filter(Boolean).join(" · ");
  const dates = [ev.dateStart, ev.dateEnd !== ev.dateStart ? ev.dateEnd : ""].filter(Boolean).join(" → ");
  return { lieu, dates };
}

/**
 * Messages envoyés au participant.
 * @param {"confirme"|"attente"|"promu"|"retire"} genre
 */
export function messageParticipant(genre, ev, site, rang) {
  const url = `${site}/evenement/${encodeURIComponent(ev.id)}`;
  const { lieu, dates } = infosEvenement(ev);
  const contenu = {
    confirme: ["inscription confirmée", `Ton inscription est confirmée`, "Ta place est réservée. Pense à prévenir l'organisateur, ou à annuler depuis la fiche, si tu ne peux plus venir : la place ira à quelqu'un d'autre."],
    attente: ["liste d'attente", `Tu es sur liste d'attente`, `L'événement est complet. Tu es n°${rang || "?"} sur la liste d'attente : si une place se libère, elle te revient automatiquement et tu es prévenu par e-mail.`],
    promu: ["une place pour toi", `Une place s'est libérée : tu es inscrit`, "Tu étais sur liste d'attente : ta place est maintenant confirmée. Si tu ne peux plus venir, annule depuis la fiche pour la laisser au suivant."],
    retire: ["inscription retirée", `Ton inscription a été retirée`, "L'organisateur a retiré ton inscription. Pour toute question, contacte-le depuis la fiche de l'événement."],
  }[genre];
  const [surtitre, titre, phrase] = contenu;
  const sujet = `${titre} — ${ev.title}`;
  const texteMail = `${titre}\n\n${ev.title}\n${lieu}\n${dates}\n\n${phrase}\n\nVoir l'événement : ${url}\n\n— EBOK, l'agenda du basket`;
  const html = gabarit({
    surtitre,
    titre,
    corpsHtml: `<p style="margin:0 0 4px;font-weight:700">${echappe(ev.title)}</p>
      <p style="margin:0 0 4px;color:#6e675b">${echappe(lieu)}</p>
      <p style="margin:0 0 14px;color:#6e675b">${echappe(dates)}</p>
      <p style="margin:0;line-height:1.5">${echappe(phrase)}</p>`,
    lien: url,
    libelleLien: "Voir l'événement",
    pied: "Tu reçois ce message parce que tu t'es inscrit à cet événement sur EBOK.",
  });
  return { sujet, texte: texteMail, html };
}

/** E-mail groupé écrit par l'organisateur. Le texte est échappé : pas de HTML
 *  libre, seulement des retours à la ligne. */
export function messageOrganisateur(ev, site, { sujet, corps, nomOrganisateur }) {
  const url = `${site}/evenement/${encodeURIComponent(ev.id)}`;
  const signature = nomOrganisateur ? `l'organisateur (${nomOrganisateur})` : "l'organisateur";
  const pied = `Message envoyé par ${echappe(signature)} de « ${echappe(ev.title)} » via EBOK, parce que tu es inscrit à cet événement. Réponds directement à cet e-mail pour lui écrire.`;
  const texteMail = `${corps}\n\n—\n${ev.title} : ${url}\nMessage envoyé par ${signature} via EBOK, parce que tu es inscrit à cet événement. Réponds à cet e-mail pour lui écrire.`;
  const html = gabarit({
    surtitre: ev.title,
    titre: sujet,
    corpsHtml: `<div style="line-height:1.55;white-space:normal">${echappe(corps).replace(/\r?\n/g, "<br>")}</div>`,
    lien: url,
    libelleLien: "Voir l'événement",
    pied,
  });
  return { sujet: `${sujet} — ${ev.title}`, texte: texteMail, html };
}
