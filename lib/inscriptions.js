/**
 * Inscriptions aux événements et outils d'organisateur (V1).
 *
 * Servi par api/events.js avec `?r=insc` : le forfait Vercel limite le nombre
 * de fonctions serveur, on n'en ajoute donc pas une nouvelle.
 *
 * Participant (compte connecté)
 *   GET    ?r=insc&event=ID&etat=1          → état des inscriptions d'un événement + la mienne
 *   GET    ?r=insc&mine=1                   → mes inscriptions
 *   POST   ?r=insc&event=ID {demande}       → m'inscrire (demande à valider)
 *   PATCH  ?r=insc&id=X&doc=DOCID {url}     → déposer un document demandé
 *   DELETE ?r=insc&id=X                     → annuler mon inscription
 *
 * Organisateur (propriétaire, co-organisateur ou admin)
 *   GET    ?r=insc&orga=1                   → les événements que j'organise (+ compteurs)
 *   GET    ?r=insc&event=ID                 → réglages, inscrits, messages envoyés
 *   PATCH  ?r=insc&id=X {statut, categories, commentaire, docs}
 *   PATCH  ?r=insc&event=ID&reglages=1 {inscription, coorgs, visibilite}
 *   POST   ?r=insc&event=ID&message=1 {sujet, texte, statuts, categories}
 *   POST   ?r=insc&event=ID&interet=1 {reponse}  → réponse à « gérer avec les outils EBOK ? »
 *   PATCH  ?r=insc&event=ID&lot=1 {ids, statut?, ajouterCat?, retirerCat?, docsValides?}  → action groupée
 *   DELETE ?r=insc&event=ID&lot=1 {ids}      → supprimer des inscriptions (définitif)
 *   (le message groupé accepte aussi {ids} : écrire à une sélection)
 *   POST   ?r=insc&event=ID&pointage=INSC {present}  → pointage le jour J (liste ou QR)
 *   Gestion (organisateur) : {gestion: {paiement, groupe, chambre, present}} en PATCH unitaire ou en lot.
 *
 * Une inscription est une DEMANDE : l'organisateur la valide (après un
 * paiement, l'étude d'une candidature…), la refuse ou la met en liste
 * d'attente. Seules les inscriptions validées occupent une place.
 *
 * « Zéro miroir » : le nom et l'e-mail des inscrits sont lus en direct chez
 * Clerk, jamais copiés en base. Le commentaire et les catégories sont privés :
 * seuls l'organisateur et ses co-organisateurs les voient.
 */
import { sql, json, readBody, newId, clerk, clerkUser, isAdminUid } from "../api/_lib.js";
import { envoyer } from "./alertes.js";
import { configPropre, demandePropre, gestionPropre, montantDu } from "./formulaire.js";

export const STATUTS = ["en_attente", "validee", "refusee", "liste_attente", "annulee"];
const LIBELLE = {
  en_attente: "en attente de validation",
  validee: "validée",
  refusee: "refusée",
  liste_attente: "en liste d'attente",
  annulee: "annulée",
};
const MAX_INSCRITS_LUS = 500;
const MAX_DESTINATAIRES = 300;

/* ------------------------------------------------------------------ */
/* Aides                                                               */
/* ------------------------------------------------------------------ */
const txt = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
const long = (v, max) => String(v == null ? "" : v).replace(/\r/g, "").trim().slice(0, max);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Réglages d'inscription d'un événement, nettoyés. */
export function reglagesPropres(brut) {
  const r = brut && typeof brut === "object" ? brut : {};
  const places = Math.max(0, Math.min(100000, parseInt(r.places, 10) || 0));
  const categories = Array.isArray(r.categories)
    ? [...new Set(r.categories.map((c) => txt(c, 40)).filter(Boolean))].slice(0, 20)
    : [];
  const documents = Array.isArray(r.documents)
    ? r.documents
        .map((d) => ({ id: txt(d && d.id, 40) || newId().slice(0, 8), nom: txt(d && d.nom, 80), aide: txt(d && d.aide, 200) }))
        .filter((d) => d.nom)
        .slice(0, 10)
    : [];
  const champEquipe = r.champEquipe !== false;
  return { active: !!r.active, places, categories, documents, champEquipe, consignes: long(r.consignes, 1000), ...configPropre(r) };
}

/** URL de document acceptée : uniquement nos fichiers Vercel Blob. */
function urlDocument(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === "https:" && /\.public\.blob\.vercel-storage\.com$/.test(x.hostname) ? x.toString() : "";
  } catch {
    return "";
  }
}

async function ligneEvenement(id) {
  if (!id) return null;
  const rows = await sql()`SELECT id, status, user_id, data FROM event.events WHERE id = ${String(id)}`;
  return rows[0] || null;
}

/** Rôle de `uid` sur l'événement : 'proprietaire', 'coorg' ou null. L'admin compte comme propriétaire. */
export async function roleSur(row, uid) {
  if (!row || !uid) return null;
  if (row.user_id === uid) return "proprietaire";
  if (await isAdminUid(uid)) return "proprietaire";
  const coorgs = Array.isArray(row.data && row.data.coorgs) ? row.data.coorgs : [];
  if (!coorgs.length) return null;
  const { email } = await clerkUser(uid);
  const mail = (email || "").toLowerCase();
  return mail && coorgs.some((c) => String(c.email || "").toLowerCase() === mail) ? "coorg" : null;
}

/** Noms et e-mails de plusieurs comptes, lus chez Clerk en un seul appel. */
async function identites(uids) {
  const out = {};
  const liste = [...new Set(uids.filter(Boolean))];
  for (let i = 0; i < liste.length; i += 100) {
    const lot = liste.slice(i, i + 100);
    try {
      const r = await clerk().users.getUserList({ userId: lot, limit: 100 });
      const users = Array.isArray(r) ? r : r.data || [];
      for (const u of users) {
        const mails = u.emailAddresses || [];
        const p = mails.find((e) => e.id === u.primaryEmailAddressId) || mails[0];
        out[u.id] = {
          nom: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "",
          email: (p && p.emailAddress) || "",
        };
      }
    } catch (e) {
      console.error("inscriptions: lecture Clerk", e.message);
      for (const id of lot) if (!out[id]) out[id] = await clerkUser(id).then((x) => ({ nom: x.name, email: x.email }));
    }
  }
  return out;
}

async function compteValidees(eventId) {
  const r = await sql()`SELECT COUNT(*)::int AS n FROM event.inscriptions WHERE event_id = ${eventId} AND statut = 'validee'`;
  return r[0] ? r[0].n : 0;
}

function versInscription(row, ident) {
  return {
    id: row.id,
    eventId: row.event_id,
    statut: row.statut,
    demande: row.demande || {},
    documents: row.documents || {},
    categories: row.categories || [],
    commentaire: row.commentaire || "",
    gestion: row.gestion || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nom: ident ? ident.nom : "",
    email: ident ? ident.email : "",
  };
}

function site(req) {
  return `https://${req.headers["x-forwarded-host"] || req.headers.host || "ebok.fr"}`;
}

function gabarit(titre, paragraphes, lien, libelleLien) {
  const corps = paragraphes.map((p) => `<p style="margin:0 0 14px;line-height:1.55">${p}</p>`).join("");
  const bouton = lien
    ? `<p style="margin:22px 0 0"><a href="${esc(lien)}" style="display:inline-block;background:#9B1C2C;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px 2px 12px 2px">${esc(libelleLien)}</a></p>`
    : "";
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F4F0E7;padding:24px;font-family:Arial,sans-serif;color:#1C1A17">
    <div style="max-width:560px;margin:0 auto;background:#FBF9F4;border:1px solid #e3dccb;border-radius:14px;padding:28px">
      <p style="margin:0 0 6px;font:12px monospace;color:#776F64">EBOK · L'agenda du basket</p>
      <h1 style="margin:0 0 18px;font-size:22px">${titre}</h1>${corps}${bouton}
    </div></body></html>`;
}

/** Envoi groupé via l'API « batch » de Resend (100 e-mails par appel). */
async function envoyerLot(messages) {
  const cle = process.env.RESEND_API_KEY;
  if (!cle) {
    console.warn("[inscriptions] RESEND_API_KEY absente — aucun envoi.");
    return 0;
  }
  const from = process.env.ALERTS_FROM || "EBOK <alertes@ebok.fr>";
  let ok = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const lot = messages.slice(i, i + 100).map((m) => ({ from, to: [m.to], subject: m.sujet, text: m.texte, html: m.html, reply_to: m.replyTo || undefined }));
    try {
      const r = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
        body: JSON.stringify(lot),
        signal: AbortSignal.timeout(15000),
      });
      if (r.ok) ok += lot.length;
      else console.error("[inscriptions] Resend batch", r.status, (await r.text()).slice(0, 200));
    } catch (e) {
      console.error("[inscriptions] envoi groupé impossible :", e.message);
    }
  }
  return ok;
}

async function prevenirParticipant(req, row, ev, statut) {
  const { email } = await clerkUser(row.user_id);
  if (!email) return;
  const titre = (ev.data && ev.data.title) || "ton événement";
  const lien = `${site(req)}/evenement/${encodeURIComponent(ev.id)}`;
  const phrases = {
    validee: `Bonne nouvelle : ton inscription à <b>${esc(titre)}</b> est <b>validée</b> par l'organisateur.`,
    refusee: `L'organisateur de <b>${esc(titre)}</b> n'a pas retenu ton inscription.`,
    liste_attente: `Ton inscription à <b>${esc(titre)}</b> est en <b>liste d'attente</b> : l'organisateur te préviendra si une place se libère.`,
  };
  if (!phrases[statut]) return;
  const texte = phrases[statut].replace(/<[^>]+>/g, "");
  await envoyer({
    destinataire: email,
    sujet: `${titre} — inscription ${LIBELLE[statut]}`,
    texte: `${texte}\n\nRetrouve ton inscription dans Mes événements : ${site(req)}/?mes=inscriptions`,
    html: gabarit(`Inscription ${LIBELLE[statut]}`, [phrases[statut], "Tu retrouves ton inscription et les documents demandés dans <b>Mes événements</b>."], lien, "Voir l'événement"),
  });
}

/* ------------------------------------------------------------------ */
/* Routeur                                                             */
/* ------------------------------------------------------------------ */
export async function inscriptions(req, res, uid, outils = {}) {
  const q = req.query || {};
  if (!uid) return json(res, 401, { error: "auth" });

  /* ---------------- Lectures ---------------- */
  if (req.method === "GET") {
    // Mes inscriptions (participant)
    if (q.mine) {
      const rows = await sql()`
        SELECT i.*, e.data AS ev_data, e.status AS ev_status
        FROM event.inscriptions i JOIN event.events e ON e.id = i.event_id
        WHERE i.user_id = ${uid} ORDER BY i.created_at DESC`;
      return json(res, 200, {
        inscriptions: rows.map((r) => {
          const d = r.ev_data || {};
          const reg = reglagesPropres(d.inscription);
          const g = r.gestion || {};
          return {
            id: r.id, statut: r.statut, demande: r.demande || {}, documents: r.documents || {}, createdAt: r.created_at,
            // Ce que le participant a besoin de savoir (jamais le commentaire ni les catégories).
            suivi: { paiement: g.paiement || null, groupe: g.groupe || "", chambre: g.chambre || "", present: !!g.present, du: montantDu(reg, r.demande || {}) },
            qr: reg.pointage.active && reg.pointage.qr && r.statut === "validee",
            event: { id: r.event_id, title: d.title || "", city: d.city || "", region: d.region || "", dateStart: d.dateStart || "", dateEnd: d.dateEnd || "", type: d.type || "" },
            documentsDemandes: reg.documents, consignes: reg.consignes, tarifs: reg.tarifs, options: reg.options,
          };
        }),
      });
    }

    // Les événements que j'organise (propriétaire ou co-organisateur)
    if (q.orga) {
      const { email } = await clerkUser(uid);
      const mail = (email || "").toLowerCase();
      const rows = await sql()`
        SELECT e.id, e.status, e.user_id, e.data, e.created_at, COALESCE(v.count, 0) AS vues, COALESCE(f.n, 0) AS favoris
        FROM event.events e
        LEFT JOIN event.views v ON v.event_id = e.id
        LEFT JOIN (SELECT x.value AS event_id, COUNT(*)::int AS n FROM event.profiles p, jsonb_array_elements_text(p.favorites) x GROUP BY 1) f ON f.event_id = e.id
        WHERE e.user_id = ${uid} OR (${mail} <> '' AND e.data->'coorgs' @> ${JSON.stringify([{ email: mail }])}::jsonb)
        ORDER BY e.created_at DESC`;
      const ids = rows.map((r) => r.id);
      const comptes = ids.length
        ? await sql()`SELECT event_id, statut, COUNT(*)::int AS n FROM event.inscriptions WHERE event_id = ANY(${ids}) GROUP BY 1, 2`
        : [];
      return json(res, 200, {
        events: rows.map((r) => {
          const parStatut = {};
          for (const c of comptes) if (c.event_id === r.id) parStatut[c.statut] = c.n;
          const d = r.data || {};
          return {
            id: r.id, status: r.status, role: r.user_id === uid ? "proprietaire" : "coorg",
            title: d.title || "", type: d.type || "", city: d.city || "", region: d.region || "", lieu: d.lieu || "",
            dateStart: d.dateStart || "", dateEnd: d.dateEnd || "", dispo: d.dispo || "",
            vues: Number(r.vues) || 0, favoris: Number(r.favoris) || 0,
            inscription: reglagesPropres(d.inscription), parStatut,
            visibilite: d.visibilite === "prive" ? "prive" : "public",
          };
        }),
      });
    }

    const ev = await ligneEvenement(q.event);
    if (!ev) return json(res, 404, { error: "introuvable" });

    // État public pour la fiche : inscriptions ouvertes, places, ma demande
    if (q.etat) {
      const reg = reglagesPropres(ev.data && ev.data.inscription);
      const mien = await sql()`SELECT * FROM event.inscriptions WHERE event_id = ${ev.id} AND user_id = ${uid}`;
      return json(res, 200, {
        active: reg.active && ev.status === "approved",
        places: reg.places,
        validees: await compteValidees(ev.id),
        champEquipe: reg.champEquipe,
        consignes: reg.consignes,
        documents: reg.documents,
        questions: reg.questions, equipes: reg.equipes, tarifs: reg.tarifs, options: reg.options,
        logistique: { repas: reg.logistique.repas, formules: reg.logistique.formules, hebergement: reg.logistique.hebergement },
        moi: mien[0] ? { id: mien[0].id, statut: mien[0].statut } : null,
      });
    }

    // Vue organisateur
    const role = await roleSur(ev, uid);
    if (!role) return json(res, 403, { error: "prive" });
    const rows = await sql()`SELECT * FROM event.inscriptions WHERE event_id = ${ev.id} ORDER BY created_at ASC LIMIT ${MAX_INSCRITS_LUS}`;
    const idt = await identites(rows.map((r) => r.user_id));
    const messages = await sql()`SELECT id, sujet, texte, filtre, nb, envoyes, created_at FROM event.insc_messages WHERE event_id = ${ev.id} ORDER BY created_at DESC LIMIT 50`;
    const d = ev.data || {};
    return json(res, 200, {
      role,
      event: { id: ev.id, status: ev.status, title: d.title || "", dateStart: d.dateStart || "", dateEnd: d.dateEnd || "", city: d.city || "" },
      reglages: reglagesPropres(d.inscription),
      visibilite: d.visibilite === "prive" ? "prive" : "public",
      coorgs: Array.isArray(d.coorgs) ? d.coorgs : [],
      inscriptions: rows.map((r) => versInscription(r, idt[r.user_id])),
      messages: messages.map((m) => ({ id: m.id, sujet: m.sujet, texte: m.texte, filtre: m.filtre, nb: m.nb, envoyes: m.envoyes, createdAt: m.created_at })),
    });
  }

  /* ---------------- Créations ---------------- */
  if (req.method === "POST") {
    const ev = await ligneEvenement(q.event);
    if (!ev) return json(res, 404, { error: "introuvable" });
    const body = await readBody(req);

    // Pointage le jour J : l'organisateur scanne le QR code du participant
    // (un lien /?pointage=ID), ou coche sa ligne dans la liste.
    if (q.pointage) {
      const rows = await sql()`SELECT * FROM event.inscriptions WHERE id = ${String(q.pointage)}`;
      const row = rows[0];
      if (!row || row.event_id !== ev.id) return json(res, 404, { error: "introuvable" });
      if (!(await roleSur(ev, uid))) return json(res, 403, { error: "prive" });
      const deja = !!(row.gestion && row.gestion.present);
      const g = gestionPropre(row.gestion, { present: body.present !== false }, uid);
      await sql()`UPDATE event.inscriptions SET gestion = ${JSON.stringify(g)}::jsonb, updated_at = now() WHERE id = ${row.id}`;
      const idt = await identites([row.user_id]);
      return json(res, 200, { present: !!g.present, deja, statut: row.statut, nom: (idt[row.user_id] || {}).nom || "", equipe: (row.demande || {}).equipe || "", event: (ev.data && ev.data.title) || "" });
    }

    // Réponse à « gérer ton événement avec les outils EBOK ? » (propriétaire)
    if (q.interet) {
      if (ev.user_id !== uid) return json(res, 403, { error: "prive" });
      const reponse = ["oui", "plus_tard", "non"].includes(body.reponse) ? body.reponse : "";
      if (!reponse) return json(res, 400, { error: "reponse" });
      await sql()`UPDATE event.events SET data = data || ${JSON.stringify({ interetOutils: { reponse, le: new Date().toISOString() } })}::jsonb WHERE id = ${ev.id}`;
      return json(res, 200, { ok: true });
    }

    // Message groupé aux inscrits (organisateur)
    if (q.message) {
      const role = await roleSur(ev, uid);
      if (!role) return json(res, 403, { error: "prive" });
      const sujet = txt(body.sujet, 140), texte = long(body.texte, 5000);
      if (!sujet || !texte) return json(res, 400, { error: "vide" });
      const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, MAX_INSCRITS_LUS) : null;
      const statuts = (Array.isArray(body.statuts) ? body.statuts : ["validee"]).filter((s) => STATUTS.includes(s));
      const cats = Array.isArray(body.categories) ? body.categories.map((c) => txt(c, 40)).filter(Boolean) : [];
      // Une sélection précise (cases cochées) l'emporte sur les filtres.
      const rows = ids
        ? await sql()`SELECT user_id, categories FROM event.inscriptions WHERE event_id = ${ev.id} AND id = ANY(${ids})`
        : await sql()`SELECT user_id, categories FROM event.inscriptions WHERE event_id = ${ev.id} AND statut = ANY(${statuts})`;
      const cibles = rows.filter((r) => ids || !cats.length || (r.categories || []).some((c) => cats.includes(c))).slice(0, MAX_DESTINATAIRES);
      if (!cibles.length) return json(res, 400, { error: "aucun_destinataire" });
      const idt = await identites(cibles.map((r) => r.user_id));
      const auteur = await clerkUser(uid);
      const titre = (ev.data && ev.data.title) || "Événement";
      const lien = `${site(req)}/evenement/${encodeURIComponent(ev.id)}`;
      const html = gabarit(esc(sujet), [`Message de l'organisateur de <b>${esc(titre)}</b> :`, esc(texte).replace(/\n/g, "<br>")], lien, "Voir l'événement");
      const envoyes = await envoyerLot(
        cibles.map((r) => idt[r.user_id] && idt[r.user_id].email)
          .filter(Boolean)
          .map((to) => ({ to, sujet: `${titre} — ${sujet}`, texte: `Message de l'organisateur de ${titre} :\n\n${texte}\n\n${lien}`, html, replyTo: auteur.email }))
      );
      await sql()`
        INSERT INTO event.insc_messages (id, event_id, auteur, sujet, texte, filtre, nb, envoyes)
        VALUES (${newId()}, ${ev.id}, ${uid}, ${sujet}, ${texte}, ${JSON.stringify(ids ? { selection: ids.length } : { statuts, categories: cats })}::jsonb, ${cibles.length}, ${envoyes})`;
      return json(res, 200, { nb: cibles.length, envoyes });
    }

    // M'inscrire (participant)
    const reg = reglagesPropres(ev.data && ev.data.inscription);
    if (ev.status !== "approved" || !reg.active) return json(res, 409, { error: "fermees" });
    const demande = {
      equipe: txt(body.equipe, 120),
      nb: Math.max(1, Math.min(50, parseInt(body.nb, 10) || 1)),
      tel: txt(body.tel, 30),
      message: long(body.message, 1000),
    };
    const surMesure = demandePropre(reg, body);
    if (surMesure.erreur) return json(res, 400, { error: surMesure.erreur, question: surMesure.question, min: surMesure.min });
    Object.assign(demande, surMesure.demande);
    if (demande.membres) demande.nb = demande.membres.length;
    const plein = reg.places > 0 && (await compteValidees(ev.id)) >= reg.places;
    const statut = plein ? "liste_attente" : "en_attente";
    const deja = await sql()`SELECT id, statut FROM event.inscriptions WHERE event_id = ${ev.id} AND user_id = ${uid}`;
    let id;
    if (deja[0]) {
      if (deja[0].statut !== "annulee") return json(res, 409, { error: "deja_inscrit", id: deja[0].id });
      id = deja[0].id;
      await sql()`UPDATE event.inscriptions SET statut = ${statut}, demande = ${JSON.stringify(demande)}::jsonb, updated_at = now() WHERE id = ${id}`;
    } else {
      id = newId();
      await sql()`
        INSERT INTO event.inscriptions (id, event_id, user_id, statut, demande)
        VALUES (${id}, ${ev.id}, ${uid}, ${statut}, ${JSON.stringify(demande)}::jsonb)`;
    }

    // Accusé de réception au participant, et alerte à l'organisateur.
    const titre = (ev.data && ev.data.title) || "Événement";
    const moi = await clerkUser(uid);
    const orga = ev.user_id ? await clerkUser(ev.user_id) : { email: "" };
    const lienMes = `${site(req)}/?mes=organise`;
    const taches = [];
    if (moi.email) {
      taches.push(envoyer({
        destinataire: moi.email,
        sujet: `${titre} — demande d'inscription reçue`,
        texte: `Ta demande d'inscription à ${titre} est bien reçue. L'organisateur doit la valider : tu recevras un e-mail dès sa décision.`,
        html: gabarit("Demande reçue", [`Ta demande d'inscription à <b>${esc(titre)}</b> est bien reçue.`, plein ? "L'événement est complet : tu es en <b>liste d'attente</b>." : "L'organisateur doit la valider : tu recevras un e-mail dès sa décision.", reg.documents.length ? "Des documents te sont demandés : dépose-les depuis <b>Mes événements</b>." : ""].filter(Boolean), `${site(req)}/?mes=inscriptions`, "Mes inscriptions"),
      }));
    }
    if (orga.email) {
      const qui = [moi.name, demande.equipe].filter(Boolean).join(" · ") || "Un membre";
      taches.push(envoyer({
        destinataire: orga.email,
        sujet: `${titre} — nouvelle demande d'inscription`,
        texte: `${qui} demande à s'inscrire à ${titre}. Valide ou refuse la demande dans Mes événements : ${lienMes}`,
        html: gabarit("Nouvelle demande d'inscription", [`<b>${esc(qui)}</b> demande à s'inscrire à <b>${esc(titre)}</b>${demande.nb > 1 ? ` (${demande.nb} personnes)` : ""}.`, demande.message ? `« ${esc(demande.message)} »` : "", "Valide, refuse ou mets en liste d'attente depuis ton tableau de bord."].filter(Boolean), lienMes, "Ouvrir le tableau de bord"),
      }));
    }
    await Promise.allSettled(taches);
    return json(res, 200, { id, statut });
  }

  /* ---------------- Modifications ---------------- */
  if (req.method === "PATCH") {
    const body = await readBody(req);

    // Action groupée sur une sélection d'inscrits (organisateur)
    if (q.lot) {
      const ev = await ligneEvenement(q.event);
      if (!ev) return json(res, 404, { error: "introuvable" });
      if (!(await roleSur(ev, uid))) return json(res, 403, { error: "prive" });
      const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(String))].slice(0, MAX_INSCRITS_LUS) : [];
      if (!ids.length) return json(res, 400, { error: "vide" });
      const rows = await sql()`SELECT * FROM event.inscriptions WHERE event_id = ${ev.id} AND id = ANY(${ids})`;
      const statut = STATUTS.includes(body.statut) && body.statut !== "annulee" ? body.statut : null;
      const ajout = txt(body.ajouterCat, 40), retrait = txt(body.retirerCat, 40);
      const changes = [];
      for (const r of rows) {
        let cats = r.categories || [];
        if (ajout && !cats.includes(ajout)) cats = [...cats, ajout].slice(0, 10);
        if (retrait) cats = cats.filter((c) => c !== retrait);
        const docs = { ...(r.documents || {}) };
        if (body.docsValides) for (const k of Object.keys(docs)) if (docs[k].statut === "depose") docs[k] = { ...docs[k], statut: "valide" };
        const nouveau = statut || r.statut;
        const gestion = gestionPropre(r.gestion, body.gestion, uid);
        await sql()`
          UPDATE event.inscriptions SET statut = ${nouveau}, categories = ${JSON.stringify(cats)}::jsonb,
            documents = ${JSON.stringify(docs)}::jsonb, gestion = ${JSON.stringify(gestion)}::jsonb, updated_at = now()
          WHERE id = ${r.id}`;
        if (nouveau !== r.statut) changes.push({ row: r, statut: nouveau });
      }
      // Un e-mail par participant dont le statut a changé (en parallèle).
      await Promise.allSettled(changes.map((c) => prevenirParticipant(req, c.row, ev, c.statut)));
      return json(res, 200, { modifiees: rows.length });
    }

    // Réglages d'inscription et co-organisateurs
    if (q.reglages) {
      const ev = await ligneEvenement(q.event);
      if (!ev) return json(res, 404, { error: "introuvable" });
      const role = await roleSur(ev, uid);
      if (!role) return json(res, 403, { error: "prive" });
      const ajout = {};
      if (body.inscription) ajout.inscription = reglagesPropres(body.inscription);
      // Visibilité : « public » (carte, recherche, agenda, alertes) ou « privé »
      // (non répertorié : la fiche n'est accessible que par son lien).
      if (body.visibilite === "public" || body.visibilite === "prive") ajout.visibilite = body.visibilite;
      // L'équipe ne se gère que par le propriétaire.
      if (Array.isArray(body.coorgs)) {
        if (role !== "proprietaire") return json(res, 403, { error: "proprietaire" });
        const vus = new Set();
        ajout.coorgs = body.coorgs
          .map((c) => ({ email: txt(c && c.email, 160).toLowerCase(), ajouteLe: (c && c.ajouteLe) || new Date().toISOString() }))
          .filter((c) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email) && !vus.has(c.email) && vus.add(c.email))
          .slice(0, 10);
        // Invitation : un e-mail aux nouveaux co-organisateurs.
        const avant = new Set((Array.isArray(ev.data && ev.data.coorgs) ? ev.data.coorgs : []).map((c) => String(c.email).toLowerCase()));
        const titre = (ev.data && ev.data.title) || "un événement";
        const qui = (await clerkUser(uid)).name || "L'organisateur";
        await Promise.allSettled(ajout.coorgs.filter((c) => !avant.has(c.email)).map((c) => envoyer({
          destinataire: c.email,
          sujet: `Tu es co-organisateur de ${titre} sur EBOK`,
          texte: `${qui} t'a ajouté comme co-organisateur de ${titre}. Connecte-toi sur ebok.fr avec cette adresse e-mail, puis ouvre Mes événements > J'organise.`,
          html: gabarit("Tu es co-organisateur", [`<b>${esc(qui)}</b> t'a ajouté comme co-organisateur de <b>${esc(titre)}</b>.`, "Connecte-toi (ou crée ton compte) sur EBOK <b>avec cette adresse e-mail</b>, puis ouvre <b>Mes événements › J'organise</b>."], `${site(req)}/?mes=organise`, "Ouvrir EBOK"),
        })));
      }
      if (!Object.keys(ajout).length) return json(res, 400, { error: "vide" });
      await sql()`UPDATE event.events SET data = data || ${JSON.stringify(ajout)}::jsonb WHERE id = ${ev.id}`;
      const out = await ligneEvenement(ev.id);
      // Un événement validé qui devient public prévient maintenant les alertes.
      if (ajout.visibilite === "public" && (ev.data && ev.data.visibilite) === "prive" && out.status === "approved" && outils.notifierAlertes && outils.toEvent) {
        const lu = await sql()`SELECT * FROM event.events_lecture WHERE id = ${ev.id}`;
        if (lu[0]) await outils.notifierAlertes(outils.toEvent(lu[0]), req).catch((e) => console.error("alertes:", e));
      }
      return json(res, 200, { reglages: reglagesPropres(out.data.inscription), coorgs: out.data.coorgs || [], visibilite: out.data.visibilite === "prive" ? "prive" : "public" });
    }

    const rows = await sql()`SELECT * FROM event.inscriptions WHERE id = ${String(q.id || "")}`;
    const row = rows[0];
    if (!row) return json(res, 404, { error: "introuvable" });
    const ev = await ligneEvenement(row.event_id);

    // Dépôt d'un document par le participant
    if (q.doc) {
      if (row.user_id !== uid) return json(res, 403, { error: "prive" });
      const reg = reglagesPropres(ev && ev.data && ev.data.inscription);
      const demande = reg.documents.find((d) => d.id === String(q.doc));
      if (!demande) return json(res, 400, { error: "document_inconnu" });
      const url = urlDocument(body.url);
      if (!url) return json(res, 400, { error: "url" });
      const docs = { ...(row.documents || {}) };
      docs[demande.id] = { url, nom: txt(body.nom, 120) || demande.nom, statut: "depose", le: new Date().toISOString() };
      await sql()`UPDATE event.inscriptions SET documents = ${JSON.stringify(docs)}::jsonb, updated_at = now() WHERE id = ${row.id}`;
      return json(res, 200, { documents: docs });
    }

    // Décision et suivi par l'organisateur
    const role = await roleSur(ev, uid);
    if (!role) return json(res, 403, { error: "prive" });
    const statut = STATUTS.includes(body.statut) && body.statut !== "annulee" ? body.statut : row.statut;
    const categories = Array.isArray(body.categories)
      ? [...new Set(body.categories.map((c) => txt(c, 40)).filter(Boolean))].slice(0, 10)
      : row.categories || [];
    const commentaire = Object.prototype.hasOwnProperty.call(body, "commentaire") ? long(body.commentaire, 2000) : row.commentaire || "";
    const docs = { ...(row.documents || {}) };
    if (body.docs && typeof body.docs === "object") {
      for (const [k, v] of Object.entries(body.docs)) {
        if (docs[k] && ["valide", "a_refaire", "depose"].includes(v)) docs[k] = { ...docs[k], statut: v };
      }
    }
    const gestion = gestionPropre(row.gestion, body.gestion, uid);
    await sql()`
      UPDATE event.inscriptions SET statut = ${statut}, categories = ${JSON.stringify(categories)}::jsonb,
        commentaire = ${commentaire}, documents = ${JSON.stringify(docs)}::jsonb,
        gestion = ${JSON.stringify(gestion)}::jsonb, updated_at = now()
      WHERE id = ${row.id}`;
    if (statut !== row.statut) await prevenirParticipant(req, row, ev, statut).catch((e) => console.error("inscriptions mail:", e));
    const out = await sql()`SELECT * FROM event.inscriptions WHERE id = ${row.id}`;
    const idt = await identites([row.user_id]);
    return json(res, 200, { inscription: versInscription(out[0], idt[row.user_id]) });
  }

  /* ---------------- Annulation par le participant ---------------- */
  if (req.method === "DELETE") {
    // Suppression définitive par l'organisateur (sélection)
    if (q.lot) {
      const ev = await ligneEvenement(q.event);
      if (!ev) return json(res, 404, { error: "introuvable" });
      if (!(await roleSur(ev, uid))) return json(res, 403, { error: "prive" });
      const body = await readBody(req);
      const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, MAX_INSCRITS_LUS) : [];
      if (!ids.length) return json(res, 400, { error: "vide" });
      const out = await sql()`DELETE FROM event.inscriptions WHERE event_id = ${ev.id} AND id = ANY(${ids}) RETURNING documents`;
      await effacerFichiers(out.flatMap((r) => Object.values(r.documents || {}).map((d) => d && d.url).filter(Boolean)));
      return json(res, 200, { supprimees: out.length });
    }
    const rows = await sql()`SELECT id, user_id, demande, documents FROM event.inscriptions WHERE id = ${String(q.id || "")}`;
    if (!rows[0]) return json(res, 200, { ok: true });
    if (rows[0].user_id !== uid) return json(res, 403, { error: "prive" });
    // Annuler efface ce que la demande contenait (réponses, accord pour les
    // données sensibles, documents, suivi) : l'organisateur garde seulement la
    // trace d'une demande annulée.
    const urls = Object.values(rows[0].documents || {}).map((d) => d && d.url).filter(Boolean);
    await effacerFichiers(urls);
    const d = rows[0].demande || {};
    const reste = { nb: d.nb || 1, ...(d.equipe ? { equipe: d.equipe } : {}) };
    await sql()`UPDATE event.inscriptions SET statut = 'annulee', demande = ${JSON.stringify(reste)}::jsonb, documents = '{}'::jsonb, gestion = '{}'::jsonb, updated_at = now() WHERE id = ${rows[0].id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "method" });
}

/* ------------------------------------------------------------------ */
/* Tâche quotidienne : rappels et durées de conservation (RGPD)        */
/* ------------------------------------------------------------------ */
export const CONSERVATION = { documentsJours: 90, inscriptionsJours: 365 };

/**
 * Appelée chaque jour par la tâche planifiée (api/detection.js?tache=cron).
 * 1. Rappel la veille : un e-mail aux inscrits validés d'un événement qui
 *    commence demain (une seule fois, sauf si l'organisateur l'a désactivé).
 * 2. Documents : supprimés (fichiers compris) 90 jours après la fin de l'événement.
 * 3. Inscriptions et messages : supprimés 365 jours après la fin de l'événement.
 */
export async function maintenanceInscriptions(req) {
  const bilan = { rappels: 0, documentsPurges: 0, inscriptionsPurgees: 0 };
  const paris = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const demain = new Date(paris.getFullYear(), paris.getMonth(), paris.getDate() + 1);
  const jourDemain = `${demain.getFullYear()}-${String(demain.getMonth() + 1).padStart(2, "0")}-${String(demain.getDate()).padStart(2, "0")}`;

  // 1. Rappels de la veille
  const aRappeler = await sql()`
    SELECT i.id, i.user_id, i.gestion, e.id AS event_id, e.data
    FROM event.inscriptions i JOIN event.events e ON e.id = i.event_id
    WHERE i.statut = 'validee' AND e.data->>'dateStart' = ${jourDemain}
      AND COALESCE(e.data->'inscription'->>'rappelVeille', 'true') <> 'false'
      AND NOT (i.gestion ? 'rappelVeille')`;
  const idt = await identites(aRappeler.map((r) => r.user_id));
  for (const r of aRappeler) {
    const mail = (idt[r.user_id] || {}).email;
    const d = r.data || {};
    if (mail) {
      const lien = `${site(req)}/evenement/${encodeURIComponent(r.event_id)}`;
      const ok = await envoyer({
        destinataire: mail,
        sujet: `C'est demain : ${d.title || "ton événement"}`,
        texte: `Rappel : ${d.title || "ton événement"} commence demain${d.lieu ? ` (${d.lieu})` : ""}. ${lien}`,
        html: gabarit("C'est demain", [`<b>${esc(d.title || "Ton événement")}</b> commence demain${d.lieu ? `, ${esc(d.lieu)}` : ""}.`, "Ton inscription est validée. Retrouve les infos pratiques sur la fiche, et tes documents dans <b>Mes événements</b>."], lien, "Voir la fiche"),
      });
      if (!ok) continue;
      bilan.rappels++;
    }
    const g = { ...(r.gestion || {}), rappelVeille: new Date().toISOString() };
    await sql()`UPDATE event.inscriptions SET gestion = ${JSON.stringify(g)}::jsonb WHERE id = ${r.id}`;
  }

  // 2. Documents : 90 jours après la fin de l'événement
  const limiteDocs = new Date(Date.now() - CONSERVATION.documentsJours * 864e5).toISOString().slice(0, 10);
  const avecDocs = await sql()`
    SELECT i.id, i.documents FROM event.inscriptions i JOIN event.events e ON e.id = i.event_id
    WHERE i.documents <> '{}'::jsonb AND COALESCE(e.data->>'dateEnd', e.data->>'dateStart') < ${limiteDocs}`;
  if (avecDocs.length) {
    const urls = avecDocs.flatMap((r) => Object.values(r.documents || {}).map((d) => d && d.url).filter(Boolean));
    await effacerFichiers(urls);
    await sql()`UPDATE event.inscriptions SET documents = '{}'::jsonb WHERE id = ANY(${avecDocs.map((r) => r.id)})`;
    bilan.documentsPurges = avecDocs.length;
  }

  // 3. Inscriptions et messages : 365 jours après la fin de l'événement
  const limiteInsc = new Date(Date.now() - CONSERVATION.inscriptionsJours * 864e5).toISOString().slice(0, 10);
  const vieux = await sql()`
    SELECT id FROM event.events WHERE COALESCE(data->>'dateEnd', data->>'dateStart') < ${limiteInsc}`;
  if (vieux.length) {
    bilan.inscriptionsPurgees = await effacerInscriptions(vieux.map((r) => r.id));
  }
  return bilan;
}

/** Supprime des fichiers déposés (documents d'inscription) chez Vercel Blob. */
async function effacerFichiers(urls) {
  if (!urls.length || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try { const { del } = await import("@vercel/blob"); await del(urls); } catch (e) { console.error("effacement documents (fichiers):", e.message); }
}

/** Efface toutes les inscriptions (documents compris) et messages d'événements. */
export async function effacerInscriptions(eventIds) {
  if (!eventIds.length) return 0;
  const docs = await sql()`SELECT documents FROM event.inscriptions WHERE event_id = ANY(${eventIds}) AND documents <> '{}'::jsonb`;
  await effacerFichiers(docs.flatMap((r) => Object.values(r.documents || {}).map((d) => d && d.url).filter(Boolean)));
  const sup = await sql()`DELETE FROM event.inscriptions WHERE event_id = ANY(${eventIds}) RETURNING id`;
  await sql()`DELETE FROM event.insc_messages WHERE event_id = ANY(${eventIds})`;
  return sup.length;
}
