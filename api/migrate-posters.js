/**
 * Migration ponctuelle : affiches et galeries en data-URI → Vercel Blob.
 * Réservée à l'admin.
 *
 *   POST /api/migrate-posters              → traite un lot (5 fiches)
 *   POST /api/migrate-posters?limit=10     → lot plus large
 *   POST /api/migrate-posters?dry=1        → simulation, n'écrit rien
 *
 * Avant la bascule vers Vercel Blob (voir api/upload.js), les images étaient
 * stockées entières en base, encodées en base64 dans le JSONB. C'est lourd pour
 * Neon et inutilisable comme image d'aperçu au partage. Cette route reprend les
 * fiches existantes, dépose les images sur le stockage et remplace la valeur par
 * l'URL du fichier.
 *
 * Traitée PAR LOTS volontairement : une image base64 pèse plusieurs centaines de
 * kilo-octets, et une fonction serverless a un temps d'exécution limité. On
 * renvoie `restant` pour savoir s'il faut relancer. Idempotent : une fiche déjà
 * migrée n'est plus sélectionnée, on peut donc relancer sans risque.
 */
import { put } from "@vercel/blob";
import { ensureSchema, hasDb, sql, json, sessionUid, isAdminUid } from "./_lib.js";

const MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_LIMIT = 5;

/** Découpe un data-URI en type MIME + octets. Renvoie null si ce n'en est pas un.
 *  Exporté pour être testable hors Vercel (seul `default` sert de handler). */
export function decodeDataUrl(value) {
  if (typeof value !== "string") return null;
  const m = /^data:([^;,]+)(;base64)?,(.*)$/is.exec(value);
  if (!m) return null;
  const [, mime, isB64, payload] = m;
  try {
    const buf = isB64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
    if (!buf.length || buf.length > MAX_BYTES) return null;
    return { mime: mime.toLowerCase(), buf };
  } catch {
    return null;
  }
}

const EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

/** Dépose une image et renvoie son URL publique. */
async function host(eventId, kind, index, value) {
  const decoded = decodeDataUrl(value);
  if (!decoded) return null; // pas un data-URI (déjà une URL), ou illisible
  if (!decoded.mime.startsWith("image/")) return null;
  const ext = EXT[decoded.mime] || "bin";
  const name = index == null ? `${kind}.${ext}` : `${kind}-${index + 1}.${ext}`;
  const { url } = await put(`event/migration/${eventId}/${name}`, decoded.buf, {
    access: "public",
    addRandomSuffix: true,
    contentType: decoded.mime,
  });
  return url;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  if (!hasDb()) return json(res, 503, { error: "db_unavailable" });

  const uid = await sessionUid(req);
  if (!uid) return json(res, 401, { error: "auth" });
  if (!(await isAdminUid(uid))) return json(res, 403, { error: "admin_requis" });

  const q = req.query || {};
  const dry = String(q.dry || "") === "1";
  if (!dry && !process.env.BLOB_READ_WRITE_TOKEN) {
    return json(res, 503, { error: "stockage_indisponible" });
  }

  const limit = Math.min(Math.max(parseInt(q.limit, 10) || DEFAULT_LIMIT, 1), 25);

  try {
    await ensureSchema();

    // Fiches portant encore au moins une image en base64 (affiche ou galerie).
    const rows = await sql()`
      SELECT id, data FROM event.events
      WHERE data->>'poster' LIKE 'data:%'
         OR (data->'gallery')::text LIKE '%data:%'
      ORDER BY created_at
      LIMIT ${limit}`;

    const traitees = [];
    const echecs = [];
    let octetsLibres = 0;

    for (const row of rows) {
      const data = { ...row.data };
      let images = 0;
      let poids = 0;

      try {
        // Affiche
        if (typeof data.poster === "string" && data.poster.startsWith("data:")) {
          poids += data.poster.length;
          if (dry) {
            images += 1;
          } else {
            const url = await host(row.id, "affiche", null, data.poster);
            if (url) {
              data.poster = url;
              images += 1;
            }
          }
        }

        // Galerie
        if (Array.isArray(data.gallery) && data.gallery.length) {
          const next = [];
          for (let i = 0; i < data.gallery.length; i++) {
            const item = data.gallery[i];
            if (typeof item === "string" && item.startsWith("data:")) {
              poids += item.length;
              if (dry) {
                images += 1;
                next.push(item);
              } else {
                const url = await host(row.id, "galerie", i, item);
                next.push(url || item);
                if (url) images += 1;
              }
            } else {
              next.push(item);
            }
          }
          if (!dry) data.gallery = next;
        }

        if (!dry && images > 0) {
          const payload = JSON.stringify(data);
          await sql()`UPDATE event.events SET data = ${payload}::jsonb WHERE id = ${row.id}`;
        }

        octetsLibres += poids;
        traitees.push({ id: row.id, titre: data.title || null, images });
      } catch (e) {
        console.error("migrate-posters", row.id, e);
        echecs.push({ id: row.id, erreur: String((e && e.message) || e) });
      }
    }

    // Combien reste-t-il après ce lot ?
    const restant = await sql()`
      SELECT COUNT(*)::int AS n FROM event.events
      WHERE data->>'poster' LIKE 'data:%'
         OR (data->'gallery')::text LIKE '%data:%'`;

    return json(res, 200, {
      simulation: dry,
      traitees,
      echecs,
      restant: restant[0]?.n ?? 0,
      // Ordre de grandeur de ce que la base cesse de porter (base64 ≈ +33 %).
      allegementKo: Math.round(octetsLibres / 1024),
      relancer: (restant[0]?.n ?? 0) > 0,
    });
  } catch (e) {
    console.error("migrate-posters:", e);
    return json(res, 500, { error: "server" });
  }
}
