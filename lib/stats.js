/**
 * Statistiques d'audience et d'activité : collecte, puis calcul pour la page
 * Administration (onglet Statistiques).
 *
 * Ce qui existait déjà permet de remonter dans le temps : la date d'inscription
 * des membres (event.profiles) et la date de création des événements
 * (event.events). Ce qui n'était pas enregistré l'est désormais, jour par jour,
 * dans event.stats_jour : visiteurs, fiches consultées, favoris ajoutés et
 * retirés. Ces trois mesures commencent donc à la mise en ligne de cette
 * fonction ; l'écran l'indique (`mesureDepuis`).
 *
 * ── Vie privée ───────────────────────────────────────────────────────────────
 * Même principe que api/views.js : aucune adresse IP n'est stockée. Un visiteur
 * n'est reconnu que par une empreinte salée, non réversible et renouvelée chaque
 * jour, conservée 7 jours (event.visiteurs_jour) le temps d'éviter les doublons.
 * Ensuite il ne reste que le total du jour.
 *
 * Les tables sont créées ici, à la demande, et non dans ensureSchema() : une
 * erreur dans ce fichier ne doit pas pouvoir mettre hors service le reste de
 * l'API. Les compteurs ne font jamais échouer l'action qu'ils observent.
 */
import { sql } from "../api/_lib.js";

const FUSEAU = "Europe/Paris";
const RETENTION_JOURS = 7;

let pretes = false;
export async function ensureStats() {
  if (pretes) return;
  const q = sql();
  await q`CREATE SCHEMA IF NOT EXISTS event`;
  await q`
    CREATE TABLE IF NOT EXISTS event.stats_jour (
      jour             DATE PRIMARY KEY,
      visiteurs        INTEGER NOT NULL DEFAULT 0,
      vues_fiches      INTEGER NOT NULL DEFAULT 0,
      favoris_ajouts   INTEGER NOT NULL DEFAULT 0,
      favoris_retraits INTEGER NOT NULL DEFAULT 0
    )`;
  await q`
    CREATE TABLE IF NOT EXISTS event.visiteurs_jour (
      jour     DATE NOT NULL,
      visiteur TEXT NOT NULL,
      PRIMARY KEY (jour, visiteur)
    )`;
  pretes = true;
}

/** Ajoute 1 au compteur du jour (fuseau de Paris). Ne lève jamais d'erreur. */
export async function compterStat(nom, n = 1) {
  try {
    await ensureStats();
    const q = sql();
    const k = Math.max(1, Math.floor(Number(n) || 1));
    switch (nom) {
      case "visiteurs":
        await q`INSERT INTO event.stats_jour (jour, visiteurs) VALUES ((now() AT TIME ZONE 'Europe/Paris')::date, ${k}::int)
                ON CONFLICT (jour) DO UPDATE SET visiteurs = event.stats_jour.visiteurs + ${k}::int`;
        break;
      case "vues_fiches":
        await q`INSERT INTO event.stats_jour (jour, vues_fiches) VALUES ((now() AT TIME ZONE 'Europe/Paris')::date, ${k}::int)
                ON CONFLICT (jour) DO UPDATE SET vues_fiches = event.stats_jour.vues_fiches + ${k}::int`;
        break;
      case "favoris_ajouts":
        await q`INSERT INTO event.stats_jour (jour, favoris_ajouts) VALUES ((now() AT TIME ZONE 'Europe/Paris')::date, ${k}::int)
                ON CONFLICT (jour) DO UPDATE SET favoris_ajouts = event.stats_jour.favoris_ajouts + ${k}::int`;
        break;
      case "favoris_retraits":
        await q`INSERT INTO event.stats_jour (jour, favoris_retraits) VALUES ((now() AT TIME ZONE 'Europe/Paris')::date, ${k}::int)
                ON CONFLICT (jour) DO UPDATE SET favoris_retraits = event.stats_jour.favoris_retraits + ${k}::int`;
        break;
      default:
        break;
    }
  } catch (e) {
    console.warn("stats:", e);
  }
}

/** Jour courant à Paris, au format AAAA-MM-JJ (sert de sel à l'empreinte). */
export function jourParis() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: FUSEAU });
}

/**
 * Compte la visite d'un visiteur (empreinte du jour) si c'est la première
 * aujourd'hui. Renvoie vrai si elle a été comptée.
 */
export async function enregistrerVisite(visiteur) {
  await ensureStats();
  const q = sql();
  // Purge opportuniste des empreintes : pas de tâche planifiée à maintenir.
  if (Math.random() < 0.02) {
    try {
      await q`DELETE FROM event.visiteurs_jour WHERE jour < (now() AT TIME ZONE 'Europe/Paris')::date - ${RETENTION_JOURS}::int`;
    } catch (e) {
      console.warn("stats purge:", e);
    }
  }
  const nouvelle = await q`
    INSERT INTO event.visiteurs_jour (jour, visiteur)
    VALUES ((now() AT TIME ZONE 'Europe/Paris')::date, ${visiteur})
    ON CONFLICT DO NOTHING
    RETURNING visiteur`;
  if (!nouvelle.length) return false;
  await compterStat("visiteurs");
  return true;
}

/* ------------------------------------------------------------------ */
/* Calcul                                                              */
/* ------------------------------------------------------------------ */

/* Semaine et mois : un point par jour. Année : un point par mois. */
const PERIODES = {
  semaine: { pas: "jour", n: 7 },
  mois: { pas: "jour", n: 30 },
  annee: { pas: "mois", n: 12 },
};

function ajouterJours(iso, d) {
  const t = new Date(iso + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
}
function ajouterMois(iso, m) {
  const [a, mo] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, mo - 1 + m, 1)).toISOString().slice(0, 10);
}
const debutMois = (iso) => iso.slice(0, 7) + "-01";

/**
 * Tout ce que l'écran affiche, pour `semaine`, `mois` ou `annee` :
 *  - totaux          : l'état du site maintenant ;
 *  - serie           : une valeur par point (jour ou mois) pour chaque mesure ;
 *  - precedent       : le total de la période juste avant, pour l'évolution
 *                      (`debutPrecedent` : son premier jour) ;
 *  - mesureDepuis    : premier jour des mesures enregistrées au jour le jour ;
 *  - classements     : fiches les plus consultées et les plus enregistrées,
 *                      répartition par type.
 */
export async function calculerStats(nomPeriode) {
  const nom = PERIODES[nomPeriode] ? nomPeriode : "semaine";
  const cfg = PERIODES[nom];
  await ensureStats();
  const q = sql();

  const [{ aujourdhui }] = await q`SELECT to_char((now() AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD') AS aujourdhui`;

  let courant, avant, cle;
  if (cfg.pas === "jour") {
    courant = Array.from({ length: cfg.n }, (_, i) => ajouterJours(aujourdhui, i - (cfg.n - 1)));
    avant = Array.from({ length: cfg.n }, (_, i) => ajouterJours(aujourdhui, i - (2 * cfg.n - 1)));
    cle = (j) => j;
  } else {
    const m0 = debutMois(aujourdhui);
    courant = Array.from({ length: cfg.n }, (_, i) => ajouterMois(m0, i - (cfg.n - 1)));
    avant = Array.from({ length: cfg.n }, (_, i) => ajouterMois(m0, i - (2 * cfg.n - 1)));
    cle = debutMois;
  }
  const depart = avant[0];

  const inscriptions = await q`
    SELECT to_char((created_at AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD') AS jour, COUNT(*)::int AS n
    FROM event.profiles
    WHERE (created_at AT TIME ZONE 'Europe/Paris')::date >= ${depart}::date
    GROUP BY 1`;
  const evenements = await q`
    SELECT to_char((created_at AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD') AS jour, COUNT(*)::int AS n
    FROM event.events
    WHERE status = 'approved' AND (created_at AT TIME ZONE 'Europe/Paris')::date >= ${depart}::date
    GROUP BY 1`;
  const jours = await q`
    SELECT to_char(jour, 'YYYY-MM-DD') AS jour, visiteurs, vues_fiches, favoris_ajouts
    FROM event.stats_jour
    WHERE jour >= ${depart}::date`;
  const [{ depuis }] = await q`SELECT to_char(MIN(jour), 'YYYY-MM-DD') AS depuis FROM event.stats_jour`;

  const somme = (lignes, champ, seaux) => {
    const m = new Map(seaux.map((k) => [k, 0]));
    for (const l of lignes) {
      const k = cle(l.jour);
      if (m.has(k)) m.set(k, m.get(k) + (Number(l[champ]) || 0));
    }
    return seaux.map((k) => m.get(k));
  };
  const total = (liste) => liste.reduce((a, b) => a + b, 0);
  const mesures = {
    membres: [inscriptions, "n"],
    evenements: [evenements, "n"],
    favoris: [jours, "favoris_ajouts"],
    visiteurs: [jours, "visiteurs"],
    vues: [jours, "vues_fiches"],
  };
  const serie = {}, precedent = {};
  for (const [k, [lignes, champ]] of Object.entries(mesures)) {
    serie[k] = somme(lignes, champ, courant);
    precedent[k] = total(somme(lignes, champ, avant));
  }

  const [t] = await q`
    SELECT
      (SELECT COUNT(*)::int FROM event.profiles) AS membres,
      (SELECT COUNT(*)::int FROM event.events WHERE status = 'approved') AS en_ligne,
      (SELECT COUNT(*)::int FROM event.events WHERE status <> 'approved') AS en_attente,
      (SELECT COALESCE(SUM(CASE WHEN jsonb_typeof(favorites) = 'array' THEN jsonb_array_length(favorites) ELSE 0 END), 0)::int FROM event.profiles) AS favoris,
      (SELECT COALESCE(SUM(count), 0)::int FROM event.views) AS vues`;

  const plusVues = await q`
    SELECT v.event_id AS id, e.data->>'title' AS titre, v.count AS n
    FROM event.views v JOIN event.events e ON e.id = v.event_id
    WHERE e.status = 'approved' AND v.count > 0
    ORDER BY v.count DESC, e.created_at DESC LIMIT 5`;
  const plusEnregistres = await q`
    SELECT id, data->>'title' AS titre, fav_count AS n
    FROM event.events_lecture
    WHERE status = 'approved' AND fav_count > 0
    ORDER BY fav_count DESC, created_at DESC LIMIT 5`;
  const types = await q`
    SELECT COALESCE(NULLIF(data->>'type', ''), 'Divers') AS type, COUNT(*)::int AS n
    FROM event.events WHERE status = 'approved'
    GROUP BY 1 ORDER BY 2 DESC, 1`;

  return {
    periode: nom,
    pas: cfg.pas,
    debut: courant[0],
    fin: aujourdhui,
    debutPrecedent: depart,
    points: courant,
    serie,
    precedent,
    totaux: { membres: t.membres, enLigne: t.en_ligne, enAttente: t.en_attente, favoris: t.favoris, vues: t.vues },
    mesureDepuis: depuis || null,
    classements: {
      vues: plusVues.map((r) => ({ id: r.id, titre: r.titre || "", n: r.n })),
      favoris: plusEnregistres.map((r) => ({ id: r.id, titre: r.titre || "", n: r.n })),
      types: types.map((r) => ({ type: r.type, n: r.n })),
    },
  };
}
