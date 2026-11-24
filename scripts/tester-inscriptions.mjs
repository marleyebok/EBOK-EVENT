/**
 * Tests de la logique des inscriptions (lib/inscriptions.js), sans base ni
 * réseau :   npm run test:inscriptions
 */
import assert from "node:assert/strict";
import {
  normaliserConfig, validerReponses, etatOuverture, capacite, dispoAuto, versCsv, messageOrganisateur,
} from "../lib/inscriptions.js";

let ok = 0;
function test(nom, fn) {
  try { fn(); ok++; console.log("✓", nom); }
  catch (e) { console.error("✗", nom, "\n ", e.message); process.exitCode = 1; }
}

test("config : nettoie les questions et écarte le superflu", () => {
  const c = normaliserConfig({
    actif: 1, dateLimite: "2026-12-01", pirate: "x",
    questions: [
      { libelle: "  Taille de maillot ", type: "choix", options: ["S", "M", "M", " ", "L"], obligatoire: 1 },
      { libelle: "", type: "texte" },
      { libelle: "Poste", type: "choix", options: [] },
      { id: "q1", libelle: "Allergies", type: "bizarre" },
    ],
  });
  assert.equal(c.actif, true);
  assert.equal(c.dateLimite, "2026-12-01");
  assert.equal(c.pirate, undefined);
  assert.equal(c.questions.length, 3);
  assert.deepEqual(c.questions[0].options, ["S", "M", "L"]);
  assert.equal(c.questions[1].type, "texte", "choix sans option → texte");
  assert.equal(new Set(c.questions.map((q) => q.id)).size, 3, "ids uniques");
});

test("config : date limite invalide ignorée, 10 questions max", () => {
  const c = normaliserConfig({ dateLimite: "demain", questions: Array.from({ length: 15 }, (_, i) => ({ libelle: "Q" + i })) });
  assert.equal(c.dateLimite, "");
  assert.equal(c.questions.length, 10);
  assert.equal(c.actif, false);
});

const questions = normaliserConfig({ questions: [
  { id: "qt", libelle: "Taille", type: "choix", options: ["S", "M"], obligatoire: true },
  { id: "qa", libelle: "Allergies", type: "texte" },
  { id: "qm", libelle: "Mineur ?", type: "ouinon", obligatoire: true },
] }).questions;

test("réponses : valides", () => {
  const v = validerReponses(questions, { qt: "M", qa: " arachide ", qm: false, autre: "ignoré" });
  assert.equal(v.ok, true);
  assert.deepEqual(v.reponses, { qt: "M", qa: "arachide", qm: "non" });
});
test("réponses : obligatoire manquante", () => {
  const v = validerReponses(questions, { qm: "oui" });
  assert.equal(v.ok, false);
  assert.equal(v.erreur, "reponse_manquante");
  assert.equal(v.question, "qt");
});
test("réponses : choix hors liste refusé", () => {
  assert.equal(validerReponses(questions, { qt: "XXL", qm: "oui" }).erreur, "choix_invalide");
});

test("ouverture", () => {
  const base = { status: "approved", dateStart: "2026-12-10", dateEnd: "2026-12-12", inscriptions: { actif: true } };
  assert.equal(etatOuverture(base, "2026-11-24").ouvert, true);
  assert.equal(etatOuverture({ ...base, inscriptions: { actif: false } }, "2026-11-24").raison, "inactif");
  assert.equal(etatOuverture({ ...base, status: "pending" }, "2026-11-24").raison, "non_publie");
  assert.equal(etatOuverture(base, "2026-12-13").raison, "termine");
  assert.equal(etatOuverture({ ...base, inscriptions: { actif: true, dateLimite: "2026-11-20" } }, "2026-11-24").raison, "date_limite");
  assert.equal(etatOuverture({ ...base, inscriptions: { actif: true, dateLimite: "2026-11-24" } }, "2026-11-24").ouvert, true, "le jour J de la date limite reste ouvert");
});

test("capacité et badge", () => {
  assert.equal(capacite({ placesTotal: "40" }), 40);
  assert.equal(capacite({ placesTotal: null }), null);
  assert.equal(capacite({ placesTotal: 0 }), null);
  assert.equal(dispoAuto(40, 10), "dispo");
  assert.equal(dispoAuto(40, 33), "limite");
  assert.equal(dispoAuto(40, 40), "complet");
  assert.equal(dispoAuto(5, 3), "limite");
  assert.equal(dispoAuto(null, 3), null);
});

test("CSV : BOM, « ; », guillemets et formules neutralisées", () => {
  const csv = versCsv([
    { statut: "confirme", nom: 'Jo "Le Mur"', email: "jo@ex.fr", inscritLe: 0, reponses: { qt: "M", qa: "=HYPERLINK(1)" } },
    { statut: "attente", rang: 1, nom: "Ana", email: "ana@ex.fr", reponses: {} },
  ], questions);
  assert.ok(csv.startsWith("﻿"));
  const lignes = csv.slice(1).trim().split("\r\n");
  assert.equal(lignes.length, 3);
  assert.ok(lignes[0].startsWith('"Statut";"Nom"'));
  assert.ok(lignes[1].includes('"Jo ""Le Mur"""'));
  assert.ok(lignes[1].includes(`"'=HYPERLINK(1)"`));
  assert.ok(lignes[2].includes("Liste d'attente (1)"));
});

test("e-mail organisateur : HTML échappé", () => {
  const m = messageOrganisateur({ id: "e1", title: "Camp <b>" }, "https://ebok.fr", { sujet: "Infos", corps: "<script>x</script>\nLigne 2" });
  assert.ok(!m.html.includes("<script>"));
  assert.ok(m.html.includes("&lt;script&gt;x&lt;/script&gt;<br>Ligne 2"));
  assert.ok(m.sujet.includes("Camp <b>"), "le sujet reste du texte brut");
});

console.log(`\n${ok} test(s) réussi(s)`);
