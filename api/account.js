/**
 * Compte EBOK Event : session, profil diffuseur et favoris.
 * Remplace la collection Firestore `users` (profils + favoris).
 *
 *   GET  /api/account            → session courante : identité Clerk (email,
 *                                  nom, isAdmin) + profil Event + favoris
 *   GET  /api/account?users=1    → liste des membres (admin) : profils Event +
 *                                  identité Clerk (email/nom lus en direct)
 *   POST /api/account {action:"saveProfile", profile:{...}}
 *                                → enregistre / fusionne le profil Event
 *   POST /api/account {action:"toggleFavorite", eventId, add:true|false}
 *                                → ajoute / retire un favori, renvoie la liste
 *
 * « Zéro miroir » : e-mail et nom réel ne sont JAMAIS stockés ; ils viennent de
 * Clerk. On ne garde en base que le profil applicatif (pseudo, photo, rôle,
 * centres d'intérêt…) et la liste des favoris.
 */
import { ensureSchema, hasDb, sql, json, readBody, sessionUid, clerkUser, isAdminEmail } from "./_lib.js";

/* Champs d'identité gérés par Clerk : on les retire d'un profil avant stockage. */
function stripIdentity(profile) {
  const p = { ...(profile || {}) };
  delete p.email;
  return p;
}

async function loadProfileRow(uid) {
  const rows = await sql()`SELECT profile, favorites FROM event.profiles WHERE user_id = ${uid}`;
  return rows[0] || { profile: {}, favorites: [] };
}

export default async function handler(req, res) {
  if (!hasDb()) return json(res, 503, { error: "db_unavailable" });
  try {
    await ensureSchema();
  } catch (e) {
    console.error("account schema:", e);
    return json(res, 500, { error: "schema" });
  }

  const uid = await sessionUid(req);
  const q = req.query || {};

  try {
    if (req.method === "GET") {
      // Liste des membres (admin uniquement).
      if (q.users) {
        if (!uid) return json(res, 401, { error: "auth" });
        const me = await clerkUser(uid);
        if (!isAdminEmail(me.email)) return json(res, 403, { error: "admin" });

        // Profils Event connus (favoris, pseudo…) + identité Clerk en direct.
        const rows = await sql()`SELECT user_id, profile FROM event.profiles`;
        const list = await Promise.all(
          rows.map(async (r) => {
            const info = await clerkUser(r.user_id);
            return { uid: r.user_id, email: info.email, name: info.name, ...r.profile };
          })
        );
        return json(res, 200, { users: list });
      }

      // Session courante.
      if (!uid) return json(res, 200, { user: null });
      const [info, row] = await Promise.all([clerkUser(uid), loadProfileRow(uid)]);
      return json(res, 200, {
        user: {
          uid,
          email: info.email,
          displayName: (row.profile && (row.profile.pseudo || row.profile.name)) || info.name || "",
          isAdmin: isAdminEmail(info.email),
        },
        profile: row.profile || {},
        favorites: Array.isArray(row.favorites) ? row.favorites : [],
      });
    }

    if (req.method === "POST") {
      if (!uid) return json(res, 401, { error: "auth" });
      const body = await readBody(req);
      const action = String(body.action || "");

      if (action === "saveProfile") {
        const incoming = stripIdentity(body.profile || {});
        // Fusion avec le profil existant (comme setDoc({merge:true}) côté Firestore).
        await sql()`
          INSERT INTO event.profiles (user_id, profile)
          VALUES (${uid}, ${JSON.stringify(incoming)}::jsonb)
          ON CONFLICT (user_id) DO UPDATE SET profile = event.profiles.profile || ${JSON.stringify(incoming)}::jsonb`;
        const row = await loadProfileRow(uid);
        return json(res, 200, { profile: row.profile });
      }

      if (action === "toggleFavorite") {
        const eventId = String(body.eventId || "");
        if (!eventId) return json(res, 400, { error: "eventId" });
        const add = Boolean(body.add);
        const row = await loadProfileRow(uid);
        const current = Array.isArray(row.favorites) ? row.favorites : [];
        const set = new Set(current);
        if (add) set.add(eventId);
        else set.delete(eventId);
        const next = [...set];
        await sql()`
          INSERT INTO event.profiles (user_id, favorites)
          VALUES (${uid}, ${JSON.stringify(next)}::jsonb)
          ON CONFLICT (user_id) DO UPDATE SET favorites = ${JSON.stringify(next)}::jsonb`;
        return json(res, 200, { favorites: next });
      }

      return json(res, 400, { error: "action" });
    }

    return json(res, 405, { error: "method" });
  } catch (e) {
    console.error("account:", e);
    return json(res, 500, { error: "server" });
  }
}
