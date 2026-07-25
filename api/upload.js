/**
 * Upload d'image (affiche d'événement) → Vercel Blob.
 *   POST /api/upload   corps = octets du fichier
 *     en-têtes : x-filename, x-folder, content-type
 *
 * Les affiches étaient stockées en data-URI dans la base (JSONB) : lourd pour
 * Neon, et inutilisable comme image d'aperçu au partage (og:image exige une
 * vraie URL). Elles sont désormais hébergées comme fichiers.
 *
 * Nécessite un Blob store connecté (variable BLOB_READ_WRITE_TOKEN). Sans elle,
 * la route répond 503 et l'app retombe proprement sur le data-URI.
 *
 * Calqué sur le patron déjà validé sur EBOK-MERCATO.
 */
import { put } from "@vercel/blob";
import { json, sessionUid } from "./_lib.js";

export const config = { api: { bodyParser: false } };

const MAX = 8 * 1024 * 1024; // 8 Mo
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method" });

  // Seul un compte connecté peut déposer un fichier.
  const uid = await sessionUid(req);
  if (!uid) return json(res, 401, { error: "auth" });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return json(res, 503, { error: "stockage_indisponible" });
  }

  const contentType = String(req.headers["content-type"] || "").split(";")[0].trim();
  if (!ALLOWED.has(contentType)) return json(res, 415, { error: "type_non_supporte" });

  try {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX) return json(res, 413, { error: "trop_lourd" });
      chunks.push(c);
    }
    const buf = Buffer.concat(chunks);
    if (!buf.length) return json(res, 400, { error: "vide" });

    const folder = String(req.headers["x-folder"] || "divers").replace(/[^a-z0-9_-]/gi, "");
    // Le nom arrive encodé (encodeURIComponent) pour survivre à l'en-tête HTTP.
    let rawName = String(req.headers["x-filename"] || "image");
    try {
      rawName = decodeURIComponent(rawName);
    } catch {
      /* nom déjà brut */
    }
    const name = rawName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);

    const { url } = await put(`event/${uid}/${folder}/${Date.now()}_${name}`, buf, {
      access: "public",
      addRandomSuffix: true,
      contentType,
    });
    return json(res, 200, { url });
  } catch (e) {
    // Le détail reste dans les logs serveur ; le front ne reçoit qu'un code
    // générique pour ne pas exposer d'erreur technique au visiteur.
    console.error("upload:", e);
    return json(res, 500, { error: "server" });
  }
}
