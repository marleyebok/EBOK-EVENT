/**
 * Profil du compte unique EBOK, en LECTURE SEULE.
 *   GET /api/profile → { filled, rows: [{ label, value }] }
 *
 * Il n'y a qu'un seul formulaire de profilage dans la galaxie : le questionnaire
 * d'inscription servi par le site mère (https://ebok.fr/onboarding), qui écrit
 * dans `shared.users` (schéma `shared`, hors schéma `event`). Cette route ne
 * fait que relire ce profil pour l'afficher — aucune écriture.
 *
 * Les libellés sont ceux du questionnaire, pour qu'un membre relise exactement
 * ce qu'il a coché. Ils sont calculés ici (côté serveur) pour que la page n'ait
 * plus qu'à afficher des chaînes.
 */
import { hasDb, sql, json, sessionUid } from "./_lib.js";

const ROLE_LABELS = {
  joueur: "Joueur / Joueuse",
  coach: "Coach",
  staff: "Staff technique ou médical",
  club: "Club",
  organisation: "Organisation (ligue, comité…)",
  spectateur: "Spectateur / Supporter",
  parent: "Parent",
  autre: "Autre",
};
const STAFF_LABELS = {
  assistant: "Coach assistant",
  dev_joueur: "Développement joueur",
  video: "Analyste vidéo",
  prepa_physique: "Préparateur physique",
  prepa_mental: "Préparateur mental",
  kine: "Kinésithérapeute",
  osteo: "Ostéopathe",
  medecin: "Médecin",
  autre: "Autre",
};
const SEXE_LABELS = {
  homme: "Homme",
  femme: "Femme",
  autre: "Autre",
  non_precise: "Préfère ne pas dire",
};
const TOOL_LABELS = {
  video: "Vidéo",
  playbook: "Playbook",
  event: "Event",
  stats: "Stats",
  mercato: "Mercato",
  notebook: "Notebook",
  academie: "Académie",
  scouting: "Scouting",
  blog: "Blog",
  forum: "Forum",
  workout: "Workout",
  medias: "Médias",
};

function toRows(r) {
  const rows = [];
  const push = (label, value) => {
    const v = value === null || value === undefined ? "" : String(value).trim();
    if (v) rows.push({ label, value: v });
  };

  push("Pseudo", r.pseudo);
  push("Nom", [r.first_name, r.last_name].filter(Boolean).join(" "));

  if (r.role) {
    let role = ROLE_LABELS[r.role] || r.role;
    if (r.role === "staff" && r.staff_role) {
      const fn =
        r.staff_role === "autre" && r.staff_role_other
          ? r.staff_role_other
          : STAFF_LABELS[r.staff_role] || r.staff_role;
      role += ` — ${fn}`;
    } else if (r.role === "autre" && r.role_other) {
      role += ` — ${r.role_other}`;
    }
    push("Rôle", role);
  }

  push("Âge", r.age);
  push("Sexe", r.sexe ? SEXE_LABELS[r.sexe] || r.sexe : "");
  push(
    "Outils qui vous intéressent",
    (Array.isArray(r.interests) ? r.interests : []).map((id) => TOOL_LABELS[id] || id).join(", ")
  );

  return rows;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "method" });
  if (!hasDb()) return json(res, 503, { error: "db_unavailable" });

  const uid = await sessionUid(req);
  if (!uid) return json(res, 401, { error: "auth" });

  try {
    const rows = await sql()`
      SELECT first_name, last_name, pseudo, role, role_other, staff_role,
             staff_role_other, age, sexe, interests
      FROM shared.users WHERE clerk_id = ${uid}`;
    const r = rows[0];
    return json(res, 200, { filled: Boolean(r), rows: r ? toRows(r) : [] });
  } catch {
    // Table absente (aucune inscription encore enregistrée) : profil vide.
    return json(res, 200, { filled: false, rows: [] });
  }
}
