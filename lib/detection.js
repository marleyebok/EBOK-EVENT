/**
 * Détection automatique d'événements de basket.
 *
 * Une « source » est une page qui liste des événements : agenda d'une ligue
 * ou d'un comité, calendrier du circuit 3x3, page d'un organisateur… On la lit,
 * l'IA en extrait TOUS les événements, puis chaque événement retenu est créé
 * « en attente » : rien n'est publié sans validation de l'admin.
 *
 * Garde-fous :
 *  - on ne garde que des événements datés, à venir, avec un titre et une ville ;
 *  - une empreinte (titre + date + ville) évite les doublons, y compris avec un
 *    événement déjà saisi à la main, et empêche de recréer un événement que
 *    l'admin a supprimé (= refusé) ;
 *  - l'affiche n'est pas recopiée (droits d'auteur) : on garde les faits et un
 *    lien vers la source.
 *
 * Le module ne touche ni au réseau ni à la base directement : tout passe par
 * les dépendances reçues (`deps`), ce qui permet de le tester sans rien brancher.
 */
import { createHash } from "node:crypto";
import { extractPage, normalizeEvent, TYPES, AGE_OPTIONS } from "../api/import-event.js";

/* Au-delà, on tronque : une page d'agenda très longue dépasserait ce que le
   modèle lit correctement d'un coup. */
const TEXTE_MAX = 16000;
/* Nombre maximal d'événements créés par analyse : protège contre une page
   mal comprise qui ferait déferler des dizaines de fiches fantaisistes. */
export const MAX_PAR_SOURCE = 25;

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */
export function promptListe(today, url, page) {
  return `Tu analyses une page web qui peut annoncer UN ou PLUSIEURS événements de basketball (tournois, camps, stages, détections, circuits 3x3, clinics, matchs de gala…).
Extrais CHAQUE événement distinct annoncé sur la page.

Réponds avec un OBJET JSON de la forme {"events": [ ... ]}. Chaque élément a les clés EXACTES :
title, type, city, region, address, dateStart, dateEnd, sexe, age, niveau, description, orgName, insta, site, tarif.
Règles :
- Ne retiens QUE des événements de basketball (ou basket 3x3, handibasket). Ignore les matchs de championnat ordinaires, les assemblées générales, les adhésions/licences, les boutiques, les lotos.
- "type" : une seule valeur parmi [${TYPES.join(", ")}] (par défaut "Divers").
- "dateStart" / "dateEnd" : format AAAA-MM-JJ. Une seule date : mets-la dans les deux. N'INVENTE JAMAIS de date : sans date lisible, n'inclus pas l'événement.
- "city" : la ville où se déroule l'événement. Sans ville identifiable, n'inclus pas l'événement.
- "region" : la région administrative française déduite de la ville si possible, sinon "".
- "sexe" : "Masculin", "Féminin", "Mixte" ou "".
- "age" : TABLEAU parmi [${AGE_OPTIONS.join(", ")}], sinon [].
- "description" : 1 à 3 phrases factuelles en français, sans recopier de longs passages.
- "site" : le lien le plus précis vers l'événement s'il apparaît sur la page, sinon "".
- "insta" : identifiant Instagram sans le @, sinon "".
- Laisse "" tout champ introuvable. S'il n'y a aucun événement, réponds {"events": []}.

Date du jour : ${today}
URL de la page : ${url}
Titre de la page : ${page.title}

Contenu de la page :
${page.text}`;
}

/* ------------------------------------------------------------------ */
/* Règles de tri                                                       */
/* ------------------------------------------------------------------ */

/** Texte comparable : minuscules, sans accents ni ponctuation. */
export function simplifier(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Empreinte d'un événement : même titre, même date, même ville = même événement. */
export function empreinte(ev) {
  const cle = [simplifier(ev.title), ev.dateStart || "", simplifier(ev.city)].join("|");
  return createHash("sha256").update(cle).digest("hex").slice(0, 32);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Raison de rejet d'un événement extrait, ou "" s'il est retenu. */
export function raisonRejet(ev, today) {
  if (!ev.title) return "sans titre";
  if (!ev.city) return "sans ville";
  if (!DATE.test(ev.dateStart)) return "sans date";
  const fin = DATE.test(ev.dateEnd) ? ev.dateEnd : ev.dateStart;
  if (fin < today) return "passé";
  return "";
}

/** Fiche au format de la base (même forme qu'une publication via le site). */
export function versFiche(ev, source, geo, maintenant) {
  const fin = DATE.test(ev.dateEnd) && ev.dateEnd >= ev.dateStart ? ev.dateEnd : ev.dateStart;
  return {
    title: ev.title,
    type: ev.type || "Divers",
    city: ev.city,
    region: ev.region || (geo && geo.region) || "",
    pays: "France",
    lieu: ev.address || ev.city,
    lat: geo ? geo.lat : null,
    lng: geo ? geo.lng : null,
    dateStart: ev.dateStart,
    dateEnd: fin,
    sexe: ev.sexe || "Mixte",
    age: Array.isArray(ev.age) ? ev.age : [],
    niveau: ev.niveau || "",
    tarif: ev.tarif || "",
    voyage: null,
    poster: null,
    description: ev.description || "",
    infos: { adresse: ev.address || "", horaires: "", buvette: "", reservation: "" },
    gallery: [],
    placesTotal: null,
    dispo: "",
    visibility: "standard",
    org: {
      name: ev.orgName || "",
      insta: ev.insta || "",
      site: ev.site || source.url,
      tel: "",
      email: "",
    },
    // Trace de la détection : affichée à l'admin pour vérifier à la source.
    detection: {
      auto: true,
      sourceId: source.id,
      sourceNom: source.nom || "",
      sourceUrl: source.url,
      lien: ev.site || source.url,
      le: maintenant,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Analyse d'une source                                                */
/* ------------------------------------------------------------------ */

/**
 * Analyse une source et crée les nouveaux événements en attente.
 *
 * deps = {
 *   lirePage(url)            → HTML ou null
 *   extraire(prompt)         → objet {events:[…]} renvoyé par l'IA
 *   geocoder(ev)             → {lat, lng, region} ou null
 *   dejaVu(empreintes)       → Set des empreintes déjà connues
 *   doublonSaisi(ev)         → vrai si un événement identique existe déjà en base
 *   creer(fiche, empreinte)  → crée l'événement en attente et mémorise l'empreinte
 *   today, maintenant
 * }
 * Renvoie un bilan { trouves, crees, doublons, rejetes, raisons, erreur }.
 */
export async function analyserSource(source, deps) {
  const bilan = { trouves: 0, crees: 0, doublons: 0, rejetes: 0, raisons: {}, erreur: "" };

  const html = await deps.lirePage(source.url);
  if (!html) { bilan.erreur = "Page illisible (protégée, introuvable ou trop lente)."; return bilan; }
  const page = extractPage(html, source.url);
  page.text = String(page.text || "").slice(0, TEXTE_MAX);
  if (page.text.length < 80) { bilan.erreur = "Page sans contenu exploitable (souvent une page construite en JavaScript)."; return bilan; }

  let reponse;
  try {
    reponse = await deps.extraire(promptListe(deps.today, source.url, page));
  } catch (e) {
    bilan.erreur = "Analyse IA impossible : " + (e && e.message ? e.message : "erreur inconnue");
    return bilan;
  }
  const brut = Array.isArray(reponse) ? reponse
    : Array.isArray(reponse && reponse.events) ? reponse.events : [];
  bilan.trouves = brut.length;

  // Tri : on écarte l'inexploitable avant de toucher à la base.
  const candidats = [];
  for (const e of brut) {
    const ev = normalizeEvent(e);
    const raison = raisonRejet(ev, deps.today);
    if (raison) {
      bilan.rejetes++;
      bilan.raisons[raison] = (bilan.raisons[raison] || 0) + 1;
      continue;
    }
    ev.empreinte = empreinte(ev);
    if (!candidats.some(c => c.empreinte === ev.empreinte)) candidats.push(ev);
  }

  const connues = await deps.dejaVu(candidats.map(c => c.empreinte));
  for (const ev of candidats) {
    if (bilan.crees >= MAX_PAR_SOURCE) break;
    if (connues.has(ev.empreinte) || (await deps.doublonSaisi(ev))) { bilan.doublons++; continue; }
    const geo = await deps.geocoder(ev);
    await deps.creer(versFiche(ev, source, geo, deps.maintenant), ev.empreinte);
    bilan.crees++;
  }
  return bilan;
}

/** Résumé d'un bilan en une ligne lisible pour l'admin. */
export function resumeBilan(b) {
  if (b.erreur) return "⚠️ " + b.erreur;
  const parts = [`${b.crees} nouveau${b.crees > 1 ? "x" : ""}`];
  if (b.doublons) parts.push(`${b.doublons} déjà connu${b.doublons > 1 ? "s" : ""}`);
  if (b.rejetes) {
    const detail = Object.entries(b.raisons).map(([r, n]) => `${n} ${r}`).join(", ");
    parts.push(`${b.rejetes} écarté${b.rejetes > 1 ? "s" : ""} (${detail})`);
  }
  return parts.join(" · ");
}
