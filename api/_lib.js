/**
 * Bibliothèque commune des fonctions serverless EBOK Event (Neon + Clerk).
 *
 * Calquée sur le patron déjà validé sur EBOK-MERCATO.
 *
 * Identité : gérée par CLERK (compte unique de la galaxie EBOK, clerk.ebok.fr).
 * Les fonctions ci-dessous valident le token de session Clerk envoyé par le
 * front (`Authorization: Bearer <token>`), et lisent l'e-mail / le nom réel à la
 * volée depuis Clerk (« zéro miroir » : aucune copie locale des identités).
 *
 * Données (DATABASE_URL, base Neon partagée de la galaxie — schéma `event`) :
 *   event.events   : fiches événements (colonnes indexables + JSONB `data`)
 *   event.views    : compteurs de « curieux » (vues) par événement
 *   event.profiles : profils diffuseurs propres à Event (JSONB) + favoris,
 *                    indexés par l'ID utilisateur Clerk. Ne contient NI e-mail
 *                    NI nom réel (lus en direct depuis Clerk).
 *
 * Admin : allowlist d'e-mails (env ADMIN_EMAILS, défaut marley.ebok@gmail.com),
 * comparée à l'e-mail Clerk du porteur du token. Aucune table `admins`.
 */
import { neon } from "@neondatabase/serverless";
import { verifyToken, createClerkClient } from "@clerk/backend";

export function hasDb() {
  return Boolean(process.env.DATABASE_URL);
}
export function sql() {
  return neon(process.env.DATABASE_URL);
}

/* Emails administrateurs (comptes propriétaires du site). marley.ebok@gmail.com
   est admin d'office ; on peut en ajouter via l'env ADMIN_EMAILS (séparés par
   des virgules). Emails comparés en minuscules. */
const OWNER_EMAIL = "marley.ebok@gmail.com";
export const ADMIN_EMAILS = [
  OWNER_EMAIL,
  ...String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
];
export function isAdminEmail(email) {
  return !!email && ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/* ------------------------------------------------------------------ */
/* Schéma (créé automatiquement au premier appel)                      */
/* ------------------------------------------------------------------ */
let ready = false;
export async function ensureSchema() {
  if (ready) return;
  const q = sql();
  await q`CREATE SCHEMA IF NOT EXISTS event`;
  await q`
    CREATE TABLE IF NOT EXISTS event.events (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      user_id TEXT,
      featured BOOLEAN NOT NULL DEFAULT false,
      data JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  await q`CREATE INDEX IF NOT EXISTS events_status_idx ON event.events (status)`;
  await q`CREATE INDEX IF NOT EXISTS events_user_idx ON event.events (user_id)`;
  await q`
    CREATE TABLE IF NOT EXISTS event.views (
      event_id TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0
    )`;
  await q`
    CREATE TABLE IF NOT EXISTS event.profiles (
      user_id TEXT PRIMARY KEY,
      profile JSONB NOT NULL DEFAULT '{}',
      favorites JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  ready = true;
}

/* ------------------------------------------------------------------ */
/* Sessions & identité — CLERK                                         */
/* ------------------------------------------------------------------ */
let _clerk = null;
export function clerk() {
  if (!_clerk) _clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  return _clerk;
}

/** Récupère le token de session : en-tête Bearer, sinon cookie __session. */
function bearerToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const raw = req.headers.cookie || "";
  const m = raw.split(";").map((c) => c.trim()).find((c) => c.startsWith("__session="));
  return m ? decodeURIComponent(m.slice("__session=".length)) : null;
}

/** Valide le token Clerk et renvoie l'ID utilisateur (le `sub`), ou null. */
export async function sessionUid(req) {
  const token = bearerToken(req);
  if (!token) return null;
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Infos d'identité lues à la volée depuis Clerk (zéro miroir). */
export async function clerkUser(uid) {
  try {
    const u = await clerk().users.getUser(uid);
    const emails = u.emailAddresses || [];
    const primary = emails.find((e) => e.id === u.primaryEmailAddressId) || emails[0];
    const email = primary?.emailAddress || "";
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "";
    return { email, name };
  } catch {
    return { email: "", name: "" };
  }
}

/** Vrai si le porteur du token est administrateur (email Clerk dans l'allowlist). */
export async function isAdminUid(uid) {
  if (!uid) return false;
  const { email } = await clerkUser(uid);
  return isAdminEmail(email);
}

/* ------------------------------------------------------------------ */
/* Aides requête / réponse                                             */
/* ------------------------------------------------------------------ */
export function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}
export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
export function newId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
export function ms(d) {
  if (typeof d === "number") return d;
  if (!d) return 0;
  const n = new Date(d).getTime();
  return Number.isNaN(n) ? 0 : n;
}
