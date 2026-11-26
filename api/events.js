/**
 * Événements EBOK.
 *
 *   GET    /api/events            → événements publics (status = approved, hors événements privés)
 *   GET    /api/events?id=X       → un événement (public s'il est approuvé,
 *                                    sinon réservé à son diffuseur ou l'admin)
 *   GET    /api/events?mine=1     → mes événements (tous statuts) — auth
 *   GET    /api/events?all=1      → tous les événements (tous statuts) — admin
 *   POST   /api/events {...}      → créer (statut "pending") — auth
 *   POST   /api/events?dupliquer=X → copier un événement (diffuseur, co-organisateur
 *                                    ou admin) : la copie est créée « en attente »
 *   PATCH  /api/events?id=X {...} → modifier (diffuseur ou admin ; les champs
 *                                    status / featured ne bougent qu'en admin)
 *   DELETE /api/events?id=X       → supprimer (diffuseur ou admin)
 *
 * Modèle (voir api/_lib.js) : colonnes indexables (id, status, user_id,
 * featured, created_at) + JSONB `data` = tout le reste de la fiche (title,
 * type, city, region, dates, poster, org, infos, gallery, x/y…). On reconstitue
 * l'objet EXACTEMENT comme avant pour ne rien changer côté app.js.
 */
import { ensureSchema, hasDb, sql, json, readBody, newId, ms, sessionUid, isAdminUid, clerkUser } from "./_lib.js";
import { correspond, message, envoyer } from "../lib/alertes.js";
import { inscriptions, roleSur, effacerInscriptions } from "../lib/inscriptions.js";
import { regionDeVille, enFrance } from "../lib/geo.js";
import { lienPropre, lienDepuisTitre, lienLibre, lienPris } from "../lib/slug.js";
import { organisateurs, CHAMPS_RECUP } from "../lib/organisateurs.js";

/* Champs gérés par les outils d'organisateur (lib/inscriptions.js) : jamais
   renvoyés au public (les e-mails des co-organisateurs sont privés) et jamais
   modifiables par la route générale de modification. */
const CHAMPS_ORGA = ["coorgs", "reclamation"];
const CHAMPS_ORGA_ECRITURE = ["coorgs", "interetOutils", "inscription", "visibilite", ...CHAMPS_RECUP];

/* Champs posés par l'administration ou par les outils d'organisateur :
   jamais acceptés tels quels à la création par un compte ordinaire. */
const CHAMPS_ADMIN_CREATION = ["coorgs", "interetOutils", "inscription", "visibilite", "aRelire", "detection", "importe", "dupliqueDe", ...CHAMPS_RECUP];
/* Champs numériques : ils sont injectés tels quels dans la carte (attributs
   SVG). Tout ce qui n'est pas un nombre fini devient null. */
const CHAMPS_NUMERIQUES = ["x", "y", "lat", "lng", "placesTotal"];
/* Au-delà, ce n'est plus une fiche mais un dépôt de données. */
const TAILLE_MAX_FICHE = 300000;
const CREATIONS_PAR_JOUR = 5;   // au-delà : contacter l'équipe (message côté site)

/** Fiches créées par ce compte sur les dernières 24 heures (copies comprises). */
async function creationsDuJour(uid) {
  const [{ n }] = await sql()`SELECT count(*)::int AS n FROM event.events WHERE user_id = ${uid} AND created_at > now() - interval '1 day'`;
  return n;
}

/** Types sûrs pour les champs numériques ; champs réservés retirés hors admin. */
function ficheSure(data, admin) {
  for (const k of CHAMPS_NUMERIQUES) {
    if (!(k in data)) continue;
    const v = data[k];
    const n = v === null || v === "" ? NaN : Number(v);
    data[k] = Number.isFinite(n) ? n : null;
  }
  if (!admin) for (const k of CHAMPS_ADMIN_CREATION) delete data[k];
  return data;
}

/* Champs promus en colonnes : ils ne sont pas dupliqués dans `data`. */
const COLUMN_FIELDS = ["id", "status", "user_id", "userId", "featured", "createdAt", "created_at"];

/** Reconstitue la fiche attendue par le front (mêmes champs qu'avant). */
function toEvent(row) {
  const data = { ...row.data };
  for (const k of CHAMPS_ORGA) delete data[k];
  return {
    ...data,
    id: row.id,
    status: row.status,
    userId: row.user_id,
    featured: row.featured,
    createdAt: ms(row.created_at),
    // Nombre de membres ayant mis l'événement en favori. Public : c'est
    // l'indicateur de popularité affiché sur la fiche et les cartes.
    favCount: Number(row.fav_count || 0),
  };
}


/** Extrait le blob `data` (tout sauf les champs promus en colonnes). */
function dataBlob(obj) {
  const data = { ...obj };
  for (const k of COLUMN_FIELDS) delete data[k];
  return data;
}

/**
 * Prévient les membres dont une alerte correspond à cet événement.
 *
 * Chaque correspondance laisse une ligne dans event.alert_sends : c'est la
 * notification affichée sur le site, et la trace qui évite d'écrire deux fois
 * à la même personne. L'e-mail vient en plus ; s'il ne part pas (clé Resend
 * absente, panne), la notification reste et `mailed` reste faux, si bien
 * qu'une revalidation retentera l'envoi.
 *
 * Les e-mails ne sont pas lus en base : « zéro miroir », l'adresse vient de
 * Clerk à la volée.
 */
export async function notifierAlertes(ev, req) {
  // Un événement privé (non répertorié) ne déclenche aucune alerte.
  if (ev.visibilite === "prive") return;
  const alertes = await sql()`SELECT * FROM event.alerts WHERE actif = true`;
  if (!alertes.length) return;

  const hote = req.headers["x-forwarded-host"] || req.headers.host || "ebok.fr";
  const site = `https://${hote}`;

  for (const a of alertes) {
    if (!correspond(ev, a.criteres)) continue;

    // `ON CONFLICT DO NOTHING` rend la vérification atomique : deux
    // validations simultanées n'enverront pas deux e-mails.
    const pris = await sql()`
      INSERT INTO event.alert_sends (alert_id, event_id, mailed)
      VALUES (${a.id}, ${ev.id}, false)
      ON CONFLICT DO NOTHING RETURNING alert_id`;
    if (!pris.length) {
      const deja = await sql()`
        SELECT mailed FROM event.alert_sends
        WHERE alert_id = ${a.id} AND event_id = ${ev.id}`;
      if (!deja.length || deja[0].mailed) continue;
    }

    const { email } = await clerkUser(a.user_id);
    if (!email) continue;

    const { sujet, texte, html } = message(ev, a, site);
    const ok = await envoyer({ destinataire: email, sujet, texte, html });
    if (ok) {
      await sql()`
        UPDATE event.alert_sends SET mailed = true
        WHERE alert_id = ${a.id} AND event_id = ${ev.id}`;
    }
  }
}

export default async function handler(req, res) {
  if (!hasDb()) return json(res, 503, { error: "db_unavailable" });
  try {
    await ensureSchema();
  } catch (e) {
    console.error("events schema:", e);
    return json(res, 500, { error: "schema" });
  }

  const uid = await sessionUid(req);
  const { id, mine, all, slug } = req.query || {};

  // Inscriptions et outils d'organisateur : même fonction serveur (le forfait
  // Vercel limite leur nombre), logique dans lib/inscriptions.js.
  // Prévenir les organisateurs, lien personnel de récupération (lib/organisateurs.js).
  if ((req.query || {}).r === "orga") {
    try {
      return await organisateurs(req, res, uid);
    } catch (e) {
      console.error("organisateurs:", e);
      return json(res, 500, { error: "server" });
    }
  }

  if ((req.query || {}).r === "insc") {
    try {
      return await inscriptions(req, res, uid, { notifierAlertes, toEvent });
    } catch (e) {
      console.error("inscriptions:", e);
      return json(res, 500, { error: "server" });
    }
  }

  try {
    if (req.method === "GET") {
      if (mine) {
        if (!uid) return json(res, 401, { error: "auth" });
        const rows = await sql()`SELECT * FROM event.events_lecture WHERE user_id = ${uid} ORDER BY created_at DESC`;
        return json(res, 200, { events: rows.map(toEvent) });
      }
      if (all) {
        if (!(await isAdminUid(uid))) return json(res, 403, { error: "admin" });
        const rows = await sql()`SELECT * FROM event.events_lecture ORDER BY created_at DESC`;
        return json(res, 200, { events: rows.map(toEvent) });
      }
      if (id || slug) {
        // Par identifiant ou par lien court (ebok.fr/<lien>).
        const rows = id
          ? await sql()`SELECT * FROM event.events_lecture WHERE id = ${id}`
          : await sql()`SELECT * FROM event.events_lecture WHERE data->>'slug' = ${String(slug).toLowerCase()} LIMIT 1`;
        const row = rows[0];
        if (!row) return json(res, 404, { error: "introuvable" });
        if (row.status !== "approved" && row.user_id !== uid && !(await isAdminUid(uid))) {
          return json(res, 403, { error: "prive" });
        }
        return json(res, 200, { event: toEvent(row) });
      }
      // Liste publique : uniquement les événements validés, et pas les
      // événements privés (non répertoriés : accessibles par leur lien seulement).
      const rows = await sql()`
        SELECT * FROM event.events_lecture
        WHERE status = 'approved' AND COALESCE(data->>'visibilite', 'public') <> 'prive'
        ORDER BY created_at DESC LIMIT 1000`;
      return json(res, 200, { events: rows.map(toEvent) });
    }

    // Dupliquer : même affiche, mêmes infos, mêmes réglages d'inscription et
    // même équipe ; on change ensuite les dates, le lieu, le public… La copie
    // est toujours « en attente » : invisible tant que l'admin ne l'a pas
    // validée, pour qu'une fiche aux anciennes dates n'apparaisse jamais.
    if (req.method === "POST" && (req.query || {}).dupliquer) {
      if (!uid) return json(res, 401, { error: "auth" });
      const srcId = String(req.query.dupliquer);
      const rows = await sql()`SELECT * FROM event.events WHERE id = ${srcId}`;
      const src = rows[0];
      if (!src) return json(res, 404, { error: "introuvable" });
      const admin = await isAdminUid(uid);
      if (!admin && src.user_id !== uid && !(await roleSur(src, uid))) return json(res, 403, { error: "prive" });
      if (!admin && (await creationsDuJour(uid)) >= CREATIONS_PAR_JOUR) return json(res, 429, { error: "trop", max: CREATIONS_PAR_JOUR });
      const data = { ...(src.data || {}) };
      // Ce qui appartient à l'original seulement : relecture, provenance,
      // réponse au questionnaire, galerie de l'édition (gardée : ce sont les
      // photos des éditions précédentes, justement).
      for (const k of ["aRelire", "interetOutils", "detection", "importe", "dupliqueDe", ...CHAMPS_RECUP]) delete data[k];
      data.dupliqueDe = srcId;
      data.slug = await lienLibre(lienDepuisTitre(data.title));
      const eid = newId();
      await sql()`
        INSERT INTO event.events (id, status, user_id, featured, data)
        VALUES (${eid}, 'pending', ${src.user_id || uid}, false, ${JSON.stringify(data)}::jsonb)`;
      const lues = await sql()`SELECT * FROM event.events_lecture WHERE id = ${eid}`;
      return json(res, 200, { id: eid, event: toEvent(lues[0]) });
    }

    if (req.method === "POST") {
      if (!uid) return json(res, 401, { error: "auth" });
      const body = await readBody(req);
      const admin = await isAdminUid(uid);
      // Un nouveau compte crée toujours en "pending", sauf l'admin qui peut
      // publier directement (status:"approved").
      const status = admin && body.status === "approved" ? "approved" : "pending";
      const featured = admin ? Boolean(body.featured) : false;
      const eid = newId();
      const data = ficheSure(dataBlob(body), admin);
      if (JSON.stringify(data).length > TAILLE_MAX_FICHE) return json(res, 413, { error: "trop_lourd" });
      // Lien court : celui demandé s'il est libre, sinon tiré du titre.
      const voulu = lienPropre(data.slug);
      data.slug = voulu && !(await lienPris(voulu)) ? voulu : await lienLibre(lienDepuisTitre(data.title));
      // Un compte ordinaire ne publie pas des dizaines de fiches par jour :
      // au-delà, c'est un robot ou un abus.
      if (!admin && (await creationsDuJour(uid)) >= CREATIONS_PAR_JOUR) return json(res, 429, { error: "trop", max: CREATIONS_PAR_JOUR });
      // Ville en France sans région : on la déduit (sinon la fiche manque
      // sur la carte régionale et dans les filtres par région).
      if (data.city && !data.region && enFrance(data.pays)) {
        const g = await regionDeVille(data.city);
        if (g) data.region = g.region;
      }
      await sql()`
        INSERT INTO event.events (id, status, user_id, featured, data)
        VALUES (${eid}, ${status}, ${uid}, ${featured}, ${JSON.stringify(data)}::jsonb)`;
      const rows = await sql()`SELECT * FROM event.events_lecture WHERE id = ${eid}`;
      const creee = toEvent(rows[0]);
      // Publié directement par l'admin : l'événement est visible tout de suite,
      // les alertes partent donc ici (il ne passera jamais par la validation).
      if (status === "approved") {
        notifierAlertes(creee, req).catch((e) => console.error("alertes:", e));
      }
      return json(res, 200, { id: eid, event: creee });
    }

    if (req.method === "PATCH" || req.method === "PUT") {
      if (!uid) return json(res, 401, { error: "auth" });
      if (!id) return json(res, 400, { error: "id" });
      const rows = await sql()`SELECT * FROM event.events_lecture WHERE id = ${id}`;
      const row = rows[0];
      if (!row) return json(res, 404, { error: "introuvable" });
      const admin = await isAdminUid(uid);
      // Le propriétaire, l'admin, et les co-organisateurs peuvent modifier la fiche.
      if (!admin && row.user_id !== uid && !(await roleSur(row, uid))) return json(res, 403, { error: "prive" });

      const patch = await readBody(req);
      for (const k of CHAMPS_ORGA_ECRITURE) delete patch[k];
      const aLaCle = (k) => Object.prototype.hasOwnProperty.call(patch, k);
      // status et featured sont des actions d'admin (validation / mise en avant).
      const hasStatus = admin && aLaCle("status");
      const hasFeatured = admin && aLaCle("featured");
      const nextStatus = hasStatus ? String(patch.status) : null;
      const nextFeatured = hasFeatured ? Boolean(patch.featured) : null;
      // Affiliation : seul l'admin rattache un événement au compte d'un
      // organisateur (userId = identifiant Clerk) ou le détache (userId nul).
      // Un propriétaire ne peut pas passer la main : `userId` est une colonne,
      // dataBlob() l'écarte de ses modifications.
      const hasOwner = admin && aLaCle("userId");
      const nextOwner = hasOwner && patch.userId ? String(patch.userId).slice(0, 200) : null;
      const rest = ficheSure(dataBlob(patch), true);
      // Lien court modifié à la main : format et disponibilité vérifiés.
      if (aLaCle("slug")) {
        const voulu = lienPropre(rest.slug);
        if (!voulu) return json(res, 400, { error: "slug_invalide" });
        if (voulu !== (row.data || {}).slug && (await lienPris(voulu, id))) return json(res, 409, { error: "slug_pris" });
        rest.slug = voulu;
      }
      if (JSON.stringify({ ...row.data, ...rest }).length > TAILLE_MAX_FICHE) return json(res, 413, { error: "trop_lourd" });
      // Un organisateur qui modifie sa fiche la garde en ligne, mais l'admin est
      // prévenu qu'il y a quelque chose à relire (drapeau `aRelire`). Il ne peut
      // pas le retirer lui-même, et un simple changement de disponibilité ne
      // compte pas.
      if (!admin) {
        delete rest.aRelire;
        if (Object.keys(rest).some((k) => k !== "dispo" && k !== "placesTotal")) rest.aRelire = true;
      }
      // Même filet qu'à la création : nouvelle ville sans région donnée, ou
      // fiche restée sans région → on la déduit de la ville.
      {
        const apres = { ...row.data, ...rest };
        const villeChangee = aLaCle("city") && rest.city !== (row.data || {}).city && !aLaCle("region");
        if (apres.city && enFrance(apres.pays) && (!apres.region || villeChangee)) {
          const g = await regionDeVille(apres.city);
          if (g) rest.region = g.region;
        }
      }

      await sql()`
        UPDATE event.events SET
          status   = COALESCE(${nextStatus}, status),
          featured = COALESCE(${nextFeatured}, featured),
          user_id  = CASE WHEN ${hasOwner}::boolean THEN ${nextOwner}::text ELSE user_id END,
          data     = data || ${JSON.stringify(rest)}::jsonb
        WHERE id = ${id}`;
      const out = await sql()`SELECT * FROM event.events_lecture WHERE id = ${id}`;
      const fiche = toEvent(out[0]);

      // Un événement qui vient d'être validé déclenche les alertes. On le fait
      // APRÈS l'écriture et sans l'attendre : un service d'e-mail lent ou en
      // panne ne doit pas faire échouer une validation déjà enregistrée.
      if (nextStatus === "approved" && row.status !== "approved") {
        notifierAlertes(fiche, req).catch((e) => console.error("alertes:", e));
      }

      return json(res, 200, { event: fiche });
    }

    if (req.method === "DELETE") {
      if (!uid) return json(res, 401, { error: "auth" });
      if (!id) return json(res, 400, { error: "id" });
      const rows = await sql()`SELECT user_id FROM event.events WHERE id = ${id}`;
      const row = rows[0];
      if (!row) return json(res, 200, { ok: true });
      const admin = await isAdminUid(uid);
      if (!admin && row.user_id !== uid) return json(res, 403, { error: "prive" });
      await sql()`DELETE FROM event.events WHERE id = ${id}`;
      await sql()`DELETE FROM event.views WHERE event_id = ${id}`;
      await effacerInscriptions([id]);
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: "method" });
  } catch (e) {
    console.error("events:", e);
    return json(res, 500, { error: "server" });
  }
}
