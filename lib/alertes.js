/**
 * Alertes e-mail : correspondance des critères et envoi.
 *
 * Volontairement séparé des routes /api : la logique de correspondance est le
 * cœur de la fonctionnalité, et c'est la seule partie qu'on peut éprouver sans
 * base ni réseau.
 *
 * Déclenchement : à la VALIDATION d'un événement, pas à sa création. Un
 * événement de diffuseur part « en attente » ; alerter à la création
 * reviendrait à annoncer des événements qu'on va peut-être refuser.
 */

/** Normalise pour comparer sans se soucier des accents ni de la casse. */
function cle(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Date (AAAA-MM-JJ ou horodatage) en nombre comparable, 0 si absente. */
function jour(v) {
  if (!v) return 0;
  const n = new Date(v).getTime();
  return Number.isNaN(n) ? 0 : n;
}

/**
 * L'événement correspond-il aux critères de l'alerte ?
 *
 * Un critère vide n'exclut rien : une alerte sans région couvre toute la
 * France, une alerte sans type couvre tous les types. C'est ce qu'attend un
 * utilisateur qui ne remplit qu'un champ.
 *
 * @param {object} ev fiche événement (region, type, dateStart, dateEnd)
 * @param {object} criteres { regions:[], types:[], du:'AAAA-MM-JJ', au:'…' }
 */
export function correspond(ev, criteres) {
  const c = criteres || {};

  const regions = (c.regions || []).map(cle).filter(Boolean);
  if (regions.length && !regions.includes(cle(ev.region))) return false;

  const types = (c.types || []).map(cle).filter(Boolean);
  if (types.length && !types.includes(cle(ev.type))) return false;

  // Période : on compare des intervalles, pas des dates isolées. Un événement
  // qui commence avant la fenêtre mais se termine dedans correspond quand même.
  const debutEv = jour(ev.dateStart);
  const finEv = jour(ev.dateEnd) || debutEv;
  const du = jour(c.du);
  const au = jour(c.au);
  if (du && finEv && finEv < du) return false;
  if (au && debutEv && debutEv > au) return false;

  return true;
}

/** AAAA-MM-JJ → JJ/MM/AAAA. Un format ISO se lit mal en français. */
function dateFr(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v || "");
}

/** Résumé lisible des critères, pour l'interface et les e-mails. */
export function resume(criteres) {
  const c = criteres || {};
  const bouts = [];
  if (c.regions?.length) bouts.push(c.regions.join(", "));
  else bouts.push("toute la France");
  if (c.types?.length) bouts.push(c.types.join(", "));
  else bouts.push("tous les types");
  if (c.du && c.au) bouts.push(`du ${dateFr(c.du)} au ${dateFr(c.au)}`);
  else if (c.du) bouts.push(`à partir du ${dateFr(c.du)}`);
  else if (c.au) bouts.push(`jusqu'au ${dateFr(c.au)}`);
  return bouts.join(" · ");
}

/* ------------------------------------------------------------------ */
/* Envoi                                                               */
/* ------------------------------------------------------------------ */

function echappe(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

/** Corps de l'e-mail d'alerte. Texte ET HTML : un message uniquement HTML
 *  part plus facilement en indésirable. */
export function message(ev, alerte, site) {
  const url = `${site}/evenement/${encodeURIComponent(ev.id)}`;
  const desinscription = `${site}/api/alerts?desinscrire=${encodeURIComponent(alerte.jeton)}`;
  const lieu = [ev.city, ev.region].filter(Boolean).join(" · ");
  const dates = [ev.dateStart, ev.dateEnd].filter(Boolean).join(" → ");

  const texte =
    `${ev.title}\n${lieu}\n${dates}\n${ev.type || ""}\n\n` +
    `Voir l'événement : ${url}\n\n` +
    `— Tu reçois ce message pour ton alerte « ${alerte.nom || resume(alerte.criteres)} ».\n` +
    `Ne plus la recevoir : ${desinscription}`;

  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f4f0e7;font-family:system-ui,-apple-system,sans-serif;color:#211f1b">
  <div style="max-width:520px;margin:0 auto;padding:28px 20px">
    <p style="margin:0 0 20px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6e675b">EBOK Event · nouvel événement</p>
    <div style="background:#fff;border:1px solid #e3ddcf;border-radius:14px;padding:22px">
      <h1 style="margin:0 0 6px;font-size:21px;line-height:1.25">${echappe(ev.title)}</h1>
      <p style="margin:0 0 4px;font-weight:600">${echappe(lieu)}</p>
      <p style="margin:0 0 4px;color:#6e675b">${echappe(dates)}</p>
      <p style="margin:0 0 18px;color:#6e675b">${echappe(ev.type || "")}</p>
      <a href="${echappe(url)}" style="display:inline-block;background:#ff5722;color:#191008;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Voir l'événement</a>
    </div>
    <p style="margin:22px 0 0;font-size:12.5px;color:#6e675b;line-height:1.5">
      Tu reçois ce message pour ton alerte « ${echappe(alerte.nom || resume(alerte.criteres))} ».<br>
      <a href="${echappe(desinscription)}" style="color:#6e675b">Ne plus recevoir cette alerte</a>
    </p>
  </div></body></html>`;

  return { sujet: `${ev.title} — ${lieu}`, texte, html };
}

/**
 * Envoie un e-mail via Resend.
 * Renvoie `false` plutôt que de lever : un envoi raté ne doit jamais faire
 * échouer la validation de l'événement qui l'a déclenché.
 */
export async function envoyer({ destinataire, sujet, texte, html }) {
  const cle = process.env.RESEND_API_KEY;
  if (!cle) {
    console.warn("[alertes] RESEND_API_KEY absente — aucun envoi.");
    return false;
  }
  const expediteur = process.env.ALERTS_FROM || "EBOK Event <alertes@ebok.fr>";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: expediteur, to: [destinataire], subject: sujet, text: texte, html }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      console.error("[alertes] Resend a répondu", r.status, (await r.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[alertes] envoi impossible :", e.message);
    return false;
  }
}
