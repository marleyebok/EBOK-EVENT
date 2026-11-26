/**
 * Prévenir les organisateurs et leur confier leur fiche.
 *
 * L'admin publie souvent un événement à la place de son organisateur. Ici :
 *   - « lien »      : crée le lien personnel de récupération d'une fiche
 *                     (pour l'envoyer soi-même en message privé) ;
 *   - « envoyer »   : envoie le message, une ou plusieurs fiches d'un coup,
 *                     depuis contact@ebok.fr, chacun avec son lien personnel ;
 *   - « reclamer »  : l'organisateur, connecté, ouvre son lien et la fiche
 *                     passe à son compte (l'admin est prévenu par e-mail) ;
 *   - « stop »      : lien « ne plus recevoir de message » des e-mails.
 *
 * Le lien personnel n'est jamais stocké en clair : seule son empreinte
 * (SHA-256) est gardée dans la fiche, avec sa date d'expiration (30 jours).
 * Un nouvel envoi remplace l'ancien lien. Ces champs ne sont jamais renvoyés
 * au public ni modifiables par la route générale (voir api/events.js).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sql, json, readBody, isAdminUid } from "../api/_lib.js";

export const CHAMPS_RECUP = ["reclamation", "prevenu", "recupere"];
export const ADRESSE_EQUIPE = "contact@ebok.fr";
const EXPEDITEUR = process.env.CONTACT_FROM || `EBOK <${ADRESSE_EQUIPE}>`;
const VALIDITE_JOURS = 30;
const ENVOIS_PAR_JOUR = 80;            // forfait gratuit : 100 mails/jour, on garde de la marge pour les alertes
const MARQUE_LIEN = "[lien personnel]";
const MAIL_OK = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

const empreinte = (s) => createHash("sha256").update(String(s)).digest("hex");
function secret() {
  return process.env.CRON_SECRET || process.env.RESEND_API_KEY || process.env.CLERK_SECRET_KEY || "ebok";
}
const signature = (email) => createHmac("sha256", secret()).update("stop:" + String(email).toLowerCase()).digest("base64url").slice(0, 24);

function site(req) {
  const hote = req.headers["x-forwarded-host"] || req.headers.host || "ebok.fr";
  return /^(localhost|127\.)/.test(hote) ? `http://${hote}` : `https://${hote}`;
}
const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** La fiche est « sans organisateur » : sans compte, ou au compte d'un admin. */
async function sansOrganisateur(row) {
  return !row.user_id || (await isAdminUid(row.user_id));
}

/** Nouveau lien personnel : remplace le précédent. */
async function nouveauLien(row, req) {
  const jeton = randomBytes(24).toString("base64url");
  const reclamation = { h: empreinte(jeton), exp: new Date(Date.now() + VALIDITE_JOURS * 864e5).toISOString() };
  await sql()`UPDATE event.events SET data = jsonb_set(data, '{reclamation}', ${JSON.stringify(reclamation)}::jsonb) WHERE id = ${row.id}`;
  return `${site(req)}/?gerer=${encodeURIComponent(jeton)}&e=${encodeURIComponent(row.id)}`;
}

async function desabonne(email) {
  const r = await sql()`SELECT 1 FROM event.desabonnes WHERE email = ${String(email).toLowerCase()}`;
  return r.length > 0;
}

async function envoisDuJour() {
  const [{ n }] = await sql()`
    SELECT count(*)::int AS n FROM event.events
    WHERE (data->'prevenu'->>'le')::timestamptz > now() - interval '1 day'`;
  return n;
}

/** Corps HTML simple et lisible, à partir du texte (liens cliquables). */
function enHtml(texte) {
  const corps = esc(texte)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#9B1B2D">$1</a>')
    .split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`).join("");
  return `<div style="font:15px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1b19;max-width:560px">${corps}</div>`;
}

async function envoyerMails(lot) {
  const cle = process.env.RESEND_API_KEY;
  if (!cle) { console.warn("[organisateurs] RESEND_API_KEY absente — aucun envoi."); return new Set(); }
  const partis = new Set();
  for (let i = 0; i < lot.length; i += 100) {
    const part = lot.slice(i, i + 100);
    try {
      const r = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
        body: JSON.stringify(part.map((m) => ({ from: EXPEDITEUR, to: [m.to], reply_to: ADRESSE_EQUIPE, subject: m.sujet, text: m.texte, html: m.html, headers: m.headers }))),
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok) part.forEach((m) => partis.add(m.id));
      else console.error("[organisateurs] Resend", r.status, (await r.text()).slice(0, 200));
    } catch (e) {
      console.error("[organisateurs] envoi impossible :", e.message);
    }
  }
  return partis;
}

/** E-mail simple à l'équipe (fiche récupérée). */
async function prevenirEquipe(sujet, texte) {
  const cle = process.env.RESEND_API_KEY;
  if (!cle) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EXPEDITEUR, to: [ADRESSE_EQUIPE], subject: sujet, text: texte, html: enHtml(texte) }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    console.error("[organisateurs] mail équipe :", e.message);
  }
}

function pageSimple(res, titre, texte, statut = 200) {
  res.statusCode = statut;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex");
  res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titre)} | EBOK</title></head>
<body style="font:16px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#F4EFE8;color:#1d1b19;margin:0;padding:48px 20px">
<main style="max-width:520px;margin:auto;background:#fff;border-radius:16px;padding:28px"><h1 style="font-size:22px;margin:0 0 12px">${esc(titre)}</h1><p>${esc(texte)}</p><p><a href="/" style="color:#9B1B2D">Retour sur EBOK</a></p></main></body></html>`);
}

export async function organisateurs(req, res, uid) {
  const action = String((req.query || {}).action || "");

  /* --- Ne plus recevoir de message (lien des e-mails, sans compte) --- */
  if (action === "stop") {
    const email = String(req.query.e || "").trim().toLowerCase();
    if (!MAIL_OK.test(email) || String(req.query.s || "") !== signature(email)) {
      return pageSimple(res, "Lien non valable", "Ce lien de désinscription n'est pas valable. Écris-nous à " + ADRESSE_EQUIPE + " et on s'en occupe.", 400);
    }
    await sql()`INSERT INTO event.desabonnes (email) VALUES (${email}) ON CONFLICT DO NOTHING`;
    return pageSimple(res, "C'est noté", `L'équipe EBOK n'écrira plus à ${email}. Tes événements restent visibles sur l'agenda.`);
  }

  if (req.method !== "POST") return json(res, 405, { error: "methode" });
  if (!uid) return json(res, 401, { error: "auth" });
  const body = await readBody(req);

  /* --- L'organisateur récupère sa fiche --- */
  if (action === "reclamer") {
    const id = String(body.id || ""), jeton = String(body.jeton || "");
    const row = (await sql()`SELECT * FROM event.events WHERE id = ${id}`)[0];
    if (!row) return json(res, 404, { error: "introuvable" });
    const titre = (row.data || {}).title || "Événement";
    if (row.user_id === uid) return json(res, 200, { ok: true, id, titre, deja: true });
    const r = (row.data || {}).reclamation;
    const attendu = r && r.h ? Buffer.from(r.h, "hex") : null;
    const recu = Buffer.from(empreinte(jeton), "hex");
    if (!attendu || attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) return json(res, 403, { error: "lien_invalide" });
    if (new Date(r.exp).getTime() < Date.now()) return json(res, 410, { error: "lien_expire" });
    if (!(await sansOrganisateur(row))) return json(res, 409, { error: "deja_gere" });
    const recupere = { le: new Date().toISOString() };
    await sql()`
      UPDATE event.events SET user_id = ${uid},
        data = (data - 'reclamation') || jsonb_build_object('recupere', ${JSON.stringify(recupere)}::jsonb)
      WHERE id = ${id}`;
    await prevenirEquipe(
      `« ${titre} » a été récupéré par son organisateur`,
      `L'organisateur de « ${titre} » a ouvert son lien personnel : la fiche est maintenant rattachée à son compte, il peut la modifier lui-même.\n\n${site(req)}/admin`
    );
    return json(res, 200, { ok: true, id, titre });
  }

  /* --- Le reste est réservé à l'admin --- */
  if (!(await isAdminUid(uid))) return json(res, 403, { error: "admin" });

  if (action === "lien") {
    const row = (await sql()`SELECT * FROM event.events WHERE id = ${String(body.id || "")}`)[0];
    if (!row) return json(res, 404, { error: "introuvable" });
    if (!(await sansOrganisateur(row))) return json(res, 409, { error: "deja_gere" });
    return json(res, 200, { url: await nouveauLien(row, req) });
  }

  if (action === "envoyer") {
    const demandes = (Array.isArray(body.envois) ? body.envois : []).slice(0, 200);
    if (!demandes.length) return json(res, 400, { error: "vide" });
    const reste = Math.max(0, ENVOIS_PAR_JOUR - (await envoisDuJour()));
    const ignores = [], lot = [], vus = new Set();
    for (const d of demandes) {
      const id = String(d && d.id || "");
      if (!id || vus.has(id)) continue;
      vus.add(id);
      const row = (await sql()`SELECT * FROM event.events WHERE id = ${id}`)[0];
      const data = (row && row.data) || {};
      const email = String((data.org || {}).email || "").trim().toLowerCase();
      if (!row) { ignores.push({ id, raison: "introuvable" }); continue; }
      if (!MAIL_OK.test(email)) { ignores.push({ id, raison: "sans_email" }); continue; }
      if (!(await sansOrganisateur(row))) { ignores.push({ id, raison: "deja_gere" }); continue; }
      if (await desabonne(email)) { ignores.push({ id, raison: "desabonne" }); continue; }
      if (lot.length >= reste) { ignores.push({ id, raison: "quota" }); continue; }
      const lien = await nouveauLien(row, req);
      let texte = String(d.texte || "").replace(/\r/g, "").slice(0, 4000).trim();
      if (!texte) { ignores.push({ id, raison: "vide" }); continue; }
      texte = texte.includes(MARQUE_LIEN) ? texte.split(MARQUE_LIEN).join(lien) : `${texte}\n\nPour gérer votre fiche : ${lien}`;
      const stop = `${site(req)}/api/events?r=orga&action=stop&e=${encodeURIComponent(email)}&s=${signature(email)}`;
      texte += `\n\n—\nVous ne souhaitez plus recevoir de message d'EBOK ? Répondez STOP, ou cliquez ici : ${stop}`;
      const sujet = String(d.sujet || `Votre événement « ${data.title || ""} » est sur EBOK`).replace(/[\r\n]+/g, " ").slice(0, 200);
      lot.push({ id, to: email, sujet, texte, html: enHtml(texte), headers: { "List-Unsubscribe": `<${stop}>, <mailto:${ADRESSE_EQUIPE}?subject=STOP>` } });
    }
    const partis = await envoyerMails(lot);
    const le = new Date().toISOString();
    for (const m of lot) {
      if (!partis.has(m.id)) { ignores.push({ id: m.id, raison: "echec" }); continue; }
      const row = (await sql()`SELECT data FROM event.events WHERE id = ${m.id}`)[0];
      const avant = (row && row.data && row.data.prevenu) || {};
      const prevenu = { le, n: (Number(avant.n) || 0) + 1 };
      await sql()`UPDATE event.events SET data = jsonb_set(data, '{prevenu}', ${JSON.stringify(prevenu)}::jsonb) WHERE id = ${m.id}`;
    }
    return json(res, 200, { envoyes: [...partis], ignores, quotaRestant: Math.max(0, reste - partis.size) });
  }

  return json(res, 400, { error: "action" });
}
