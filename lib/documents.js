/**
 * Documents d'inscription (autorisation parentale, droit à l'image, règlement…).
 *
 * EBOK n'est qu'un point de passage : le participant dépose un fichier,
 * l'organisateur le consulte et le télécharge depuis son tableau de bord, et
 * le fichier est EFFACÉ 14 jours après son envoi. Le listing garde seulement
 * le statut du document et les dates (envoyé, téléchargé, effacé).
 *
 * Statuts : en attente (rien reçu), reçu, validé, à refaire. L'organisateur
 * peut poser n'importe quel statut, même sans fichier (document remis en main
 * propre, par SMS…) : le suivi administratif reste centralisé sur le site.
 *
 * Stockage : un store Vercel Blob PRIVÉ, hébergé à Paris (jeton
 * DOCS_READ_WRITE_TOKEN). Un fichier n'est jamais servi par son adresse : il
 * passe par l'API, qui vérifie qui le demande. Sans ce jeton, les dépôts
 * retombent sur le store public des affiches (adresses impossibles à deviner).
 */
import { sql } from "../api/_lib.js";

export const DOC_STATUTS = ["attente", "recu", "valide", "a_refaire"];
export const DOC_CONSERVATION_JOURS = 14;
const RAPPEL_AVANT_JOURS = 3;           // le mail quotidien prévient 3 jours avant l'effacement
export const DOC_TAILLE_MAX = 4 * 1024 * 1024;   // une fonction Vercel renvoie 4,5 Mo au plus
const JOUR = 864e5;

const txt = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);

/** Jeton du store privé, s'il est branché et bien formé. */
export function jetonDocs() {
  const t = String(process.env.DOCS_READ_WRITE_TOKEN || "").trim().replace(/^["']|["']$/g, "");
  return /^vercel_blob_rw_[A-Za-z0-9_]+$/.test(t) ? t : "";
}
const estPrive = (u) => { try { return /\.private\.blob\.vercel-storage\.com$/.test(new URL(u).hostname); } catch { return false; } };

/** Statut normalisé (l'ancien « déposé » devient « reçu »). */
export function statutDoc(entree) {
  if (!entree) return "attente";
  if (entree.statut === "depose") return "recu";
  return DOC_STATUTS.includes(entree.statut) ? entree.statut : (entree.url ? "recu" : "attente");
}

/** Ce que voient l'organisateur et le participant : jamais l'adresse du fichier. */
export function docsSortie(docs) {
  const out = {};
  for (const [k, d] of Object.entries(docs || {})) {
    if (!d || typeof d !== "object") continue;
    const efface = d.le && d.url ? new Date(new Date(d.le).getTime() + DOC_CONSERVATION_JOURS * JOUR).toISOString() : null;
    out[k] = {
      statut: statutDoc(d),
      nom: d.nom || "",
      fichier: !!d.url,
      envoyeLe: d.le || null,
      effaceLe: d.url ? efface : (d.efface || null),
      efface: !d.url && !!d.efface,
      telecharge: d.telecharge || null,
      motif: d.motif || "",
      majLe: d.maj || null,
    };
  }
  return out;
}

/** Adresse de dépôt acceptée : un fichier Blob déposé par CE compte, dans son dossier « documents ». */
export function urlDepotAcceptee(u, uid) {
  try {
    const x = new URL(String(u));
    const hoteOk = x.protocol === "https:" && /\.(public|private)\.blob\.vercel-storage\.com$/.test(x.hostname);
    return hoteOk && x.pathname.startsWith(`/event/${uid}/documents/`) ? x.toString() : "";
  } catch {
    return "";
  }
}

/** Supprime des fichiers, sur le store public ou le store privé selon leur adresse. */
export async function effacerFichiers(urls) {
  const liste = (urls || []).filter(Boolean);
  if (!liste.length) return;
  try {
    const { del } = await import("@vercel/blob");
    const prives = liste.filter(estPrive), publics = liste.filter((u) => !estPrive(u));
    if (prives.length && jetonDocs()) await del(prives, { token: jetonDocs() });
    if (publics.length && process.env.BLOB_READ_WRITE_TOKEN) await del(publics);
  } catch (e) {
    console.error("effacement documents (fichiers):", e.message);
  }
}

/** Lit un fichier déposé : { buf, type } ou null s'il n'existe plus. */
export async function lireFichier(url) {
  try {
    if (estPrive(url)) {
      const { get } = await import("@vercel/blob");
      const r = await get(url, { access: "private", token: jetonDocs(), useCache: false });
      if (!r || !r.stream) return null;
      const morceaux = [];
      for await (const c of r.stream) morceaux.push(Buffer.from(c));
      return { buf: Buffer.concat(morceaux), type: (r.blob && r.blob.contentType) || "application/octet-stream" };
    }
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    return { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") || "application/octet-stream" };
  } catch (e) {
    console.error("lecture document:", e.message);
    return null;
  }
}

/** Nouveau statut posé par l'organisateur (avec un motif pour « à refaire »). */
export function changerStatut(entree, valeur, uid) {
  const v = typeof valeur === "object" && valeur ? valeur : { statut: valeur };
  if (!DOC_STATUTS.includes(v.statut)) return null;
  const e = { ...(entree || {}) };
  e.statut = v.statut;
  e.motif = v.statut === "a_refaire" ? txt(v.motif, 300) : "";
  e.maj = new Date().toISOString();
  e.par = uid;
  return e;
}

/**
 * Tâche quotidienne :
 * 1. efface les fichiers envoyés depuis plus de 14 jours (le statut reste) ;
 * 2. envoie à chaque organisateur UN e-mail par événement : nouveaux
 *    documents reçus, et documents effacés dans 3 jours sans avoir été
 *    téléchargés.
 * `prevenir(eventRow, { nouveaux, bientot })` envoie l'e-mail (fourni par
 * lib/inscriptions.js, qui connaît les gabarits et les organisateurs).
 */
export async function maintenanceDocuments(prevenir) {
  const bilan = { documentsEffaces: 0, mailsDocuments: 0 };
  const rows = await sql()`
    SELECT i.id, i.event_id, i.documents FROM event.inscriptions i
    WHERE i.documents <> '{}'::jsonb`;
  const parEvenement = new Map();
  const maintenant = Date.now();
  for (const r of rows) {
    const docs = { ...(r.documents || {}) };
    let change = false;
    const aEffacer = [];
    for (const [k, d] of Object.entries(docs)) {
      if (!d || !d.url || !d.le) continue;
      const age = maintenant - new Date(d.le).getTime();
      if (age >= DOC_CONSERVATION_JOURS * JOUR) {
        aEffacer.push(d.url);
        docs[k] = { ...d, url: null, efface: new Date().toISOString(), statut: statutDoc(d) };
        change = true;
        continue;
      }
      const ev = parEvenement.get(r.event_id) || { nouveaux: 0, bientot: 0 };
      if (!d.notifie) { ev.nouveaux++; docs[k] = { ...docs[k], notifie: new Date().toISOString() }; change = true; }
      if (!d.telecharge && !d.rappel && age >= (DOC_CONSERVATION_JOURS - RAPPEL_AVANT_JOURS) * JOUR) {
        ev.bientot++; docs[k] = { ...docs[k], rappel: new Date().toISOString() }; change = true;
      }
      if (ev.nouveaux || ev.bientot) parEvenement.set(r.event_id, ev);
    }
    if (aEffacer.length) { await effacerFichiers(aEffacer); bilan.documentsEffaces += aEffacer.length; }
    if (change) await sql()`UPDATE event.inscriptions SET documents = ${JSON.stringify(docs)}::jsonb WHERE id = ${r.id}`;
  }
  for (const [eventId, compte] of parEvenement) {
    const ev = (await sql()`SELECT id, user_id, data FROM event.events WHERE id = ${eventId}`)[0];
    if (ev && (await prevenir(ev, compte).catch((e) => { console.error("mail documents:", e.message); return 0; }))) bilan.mailsDocuments++;
  }
  return bilan;
}
