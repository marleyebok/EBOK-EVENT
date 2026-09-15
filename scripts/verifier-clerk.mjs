#!/usr/bin/env node
/**
 * Vérifie qu'une instance Clerk est prête pour EBOK Event.
 *
 *   npm run clerk:check                 → vérifie la clé actuellement dans le code
 *   npm run clerk:check -- pk_test_xxx  → vérifie une clé avant de la coller
 *
 * Contrôle, dans l'ordre :
 *   1. la clé est bien formée et son domaine se décode ;
 *   2. l'instance répond ;
 *   3. la connexion par e-mail est activée ;
 *   4. la connexion Google est activée ;
 *   5. l'instance est en développement ou en production ;
 *   6. la clé secrète est cohérente avec la clé publique (si CLERK_SECRET_KEY
 *      est dans l'environnement — sur Vercel elle n'est pas lisible d'ici).
 *
 * Aucune dépendance : Node seul. Ne modifie aucun fichier.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLERK_JS = join(RACINE, "public/js/clerk.js");

const vert = (t) => `\x1b[32m${t}\x1b[0m`;
const rouge = (t) => `\x1b[31m${t}\x1b[0m`;
const jaune = (t) => `\x1b[33m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;

let echecs = 0;
let alertes = 0;
const ok = (m, d) => console.log(`  ${vert("✓")} ${m}${d ? gris("  " + d) : ""}`);
const ko = (m, d) => { echecs++; console.log(`  ${rouge("✗")} ${m}${d ? "\n      " + d : ""}`); };
const attention = (m, d) => { alertes++; console.log(`  ${jaune("!")} ${m}${d ? "\n      " + d : ""}`); };

/* ------------------------------------------------------------------ */
/* 1. La clé                                                           */
/* ------------------------------------------------------------------ */
function cleDepuisLeCode() {
  const src = readFileSync(CLERK_JS, "utf8");
  const m = src.match(/const PUBLISHABLE_KEY\s*=\s*["']([^"']+)["']/);
  if (!m) throw new Error(`PUBLISHABLE_KEY introuvable dans ${CLERK_JS}`);
  return m[1];
}

/** Décode le domaine de l'instance, comme le fait public/js/clerk.js. */
function domaineDepuisLaCle(cle) {
  if (!/^pk_(live|test)_/.test(cle)) return null;
  const encode = cle.replace(/^pk_(live|test)_/, "");
  let decode;
  try {
    decode = Buffer.from(encode, "base64").toString("utf8");
  } catch {
    return null;
  }
  // La clé encode « <domaine>$ ».
  if (!decode.endsWith("$")) return null;
  const domaine = decode.slice(0, -1);
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domaine) ? domaine : null;
}

const argument = process.argv[2];
let cle;
try {
  cle = argument || cleDepuisLeCode();
} catch (e) {
  console.error(rouge("Erreur : ") + e.message);
  process.exit(1);
}

console.log(`\n${"═".repeat(58)}`);
console.log("  Vérification de l'instance Clerk — EBOK Event");
console.log(`${"═".repeat(58)}\n`);
console.log(`  Clé   ${gris(cle.slice(0, 16) + "…")}`);
console.log(`  Source ${gris(argument ? "argument de la commande" : "public/js/clerk.js")}\n`);

console.log("1. Format de la clé");
const domaine = domaineDepuisLaCle(cle);
if (!domaine) {
  ko(
    "Clé illisible.",
    "Attendu : pk_test_… ou pk_live_…, copiée telle quelle depuis Clerk\n      (sans guillemets, sans « PUBLISHABLE_KEY= » devant)."
  );
  console.log(`\n${rouge("Arrêt")} : impossible de continuer sans domaine.\n`);
  process.exit(1);
}
ok("Clé bien formée");
ok("Domaine de l'instance", domaine);

const typeCle = cle.startsWith("pk_live_") ? "production" : "développement";

/* ------------------------------------------------------------------ */
/* 2 à 5. L'instance répond et est bien réglée                         */
/* ------------------------------------------------------------------ */
console.log("\n2. L'instance répond");

const url =
  `https://${domaine}/v1/environment` +
  `?__clerk_api_version=2021-02-05&_clerk_js_version=5.0.0`;

let env = null;
try {
  const reponse = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (reponse.status === 404 || reponse.status === 401) {
    // Réponses de Clerk lui-même : l'instance n'existe pas / la clé est mauvaise.
    ko(`L'instance a répondu ${reponse.status}.`,
       "Cette instance n'existe pas. Vérifie que la clé a été copiée depuis\n      une application Clerk existante, sans caractère en trop.");
  } else if (!reponse.ok) {
    // 403, 407, 5xx : presque toujours un intermédiaire réseau (proxy
    // d'entreprise, filtrage), pas Clerk. On ne crie pas à l'erreur.
    attention(
      `Réponse inattendue : ${reponse.status}.`,
      "Souvent le fait d'un proxy ou d'un filtrage réseau plutôt que de Clerk.\n      Réessaie depuis une autre connexion. Les réglages n'ont pas pu\n      être vérifiés."
    );
  } else {
    env = await reponse.json();
    ok("Instance joignable");
  }
} catch (e) {
  attention(
    "Instance injoignable depuis cette machine.",
    `${e.message}\n      Réseau, pare-feu ou proxy d'entreprise ? Les réglages\n      ci-dessous n'ont pas pu être vérifiés.`
  );
}

if (env) {
  console.log("\n3. Moyens de connexion");

  const attributs = env.user_settings?.attributes ?? {};
  const emailActif = attributs.email_address?.enabled === true;
  emailActif
    ? ok("Connexion par e-mail activée")
    : ko("Connexion par e-mail désactivée.",
         "Clerk → User & Authentication → Email, Phone, Username → activer « Email address ».");

  // Selon les versions, les connexions sociales arrivent sous deux formes.
  const social = env.user_settings?.social ?? {};
  const google = social.oauth_google ?? social.google;
  const googleActif = google?.enabled === true;
  googleActif
    ? ok("Connexion Google activée")
    : ko("Connexion Google désactivée.",
         "Clerk → User & Authentication → Social Connections → activer « Google ».");

  const autres = Object.entries(social)
    .filter(([nom, v]) => v?.enabled === true && !/google/i.test(nom))
    .map(([nom]) => nom.replace(/^oauth_/, ""));
  if (autres.length) {
    attention(`Autres connexions activées : ${autres.join(", ")}.`,
              "Ce n'est pas un problème, mais le site n'a été pensé que pour e-mail + Google.");
  }

  console.log("\n4. Environnement");
  const typeInstance = env.display_config?.instance_environment_type;
  if (typeInstance === "production") {
    ok("Instance de production");
  } else if (typeInstance === "development") {
    attention(
      "Instance de développement.",
      "Elle fonctionne, mais limite le nombre de comptes et affiche un bandeau.\n      Pour le vrai lancement : ajouter le domaine event.ebok.fr dans\n      Clerk → Domains, puis repasser avec les clés pk_live_… / sk_live_…"
    );
  } else {
    attention("Type d'instance inconnu.", `Valeur reçue : ${typeInstance ?? "(absente)"}`);
  }
}

/* ------------------------------------------------------------------ */
/* 6. Cohérence avec la clé secrète                                    */
/* ------------------------------------------------------------------ */
console.log("\n5. Clé secrète");
const secret = process.env.CLERK_SECRET_KEY;
if (!secret) {
  console.log(`  ${gris("–")} ${gris("CLERK_SECRET_KEY absente de cet environnement — normal en local.")}`);
  console.log(`      ${gris("Elle se règle sur Vercel → Settings → Environment Variables.")}`);
} else if (!/^sk_(live|test)_/.test(secret)) {
  ko("CLERK_SECRET_KEY mal formée.", "Attendu : sk_test_… ou sk_live_…");
} else {
  const typeSecret = secret.startsWith("sk_live_") ? "production" : "développement";
  typeSecret === typeCle
    ? ok("Clé secrète cohérente avec la clé publique", `(${typeSecret})`)
    : ko(
        `Incohérence : clé publique en ${typeCle}, clé secrète en ${typeSecret}.`,
        "Les deux doivent venir de la MÊME instance, sinon la vérification des\n      jetons échoue et personne ne peut se connecter."
      );
}

/* ------------------------------------------------------------------ */
/* Conclusion                                                          */
/* ------------------------------------------------------------------ */
console.log(`\n${"═".repeat(58)}`);
if (echecs) {
  console.log(rouge(`  ${echecs} problème(s) à corriger avant d'aller plus loin.`));
} else if (alertes) {
  console.log(jaune(`  Utilisable, avec ${alertes} point(s) d'attention ci-dessus.`));
} else {
  console.log(vert("  Tout est bon. L'instance est prête."));
}
console.log(`${"═".repeat(58)}\n`);

if (!echecs && !argument) {
  console.log("Prochaine étape : vérifier le site une fois déployé —");
  console.log("créer un compte, se déconnecter, se reconnecter, tester Google.\n");
} else if (!echecs && argument) {
  console.log("Pour l'utiliser : remplacer PUBLISHABLE_KEY dans public/js/clerk.js,");
  console.log("puis mettre la clé sk_… correspondante dans CLERK_SECRET_KEY sur Vercel.\n");
}

process.exit(echecs ? 1 : 0);
