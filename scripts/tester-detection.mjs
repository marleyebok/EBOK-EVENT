#!/usr/bin/env node
/**
 * Test du moteur de détection (lib/detection.js), sans réseau ni base :
 * la page, l'IA, le géocodage et la base sont simulés.
 *
 *   node scripts/tester-detection.mjs
 */
import assert from "node:assert/strict";
import { analyserSource, empreinte, raisonRejet, resumeBilan, simplifier } from "../lib/detection.js";

const today = "2026-11-10";
const page = `<html><head><title>Agenda du comité</title></head><body>
  <h1>Les tournois de la saison</h1>
  <p>Tournoi de Noël U13 à Montpellier le 20 décembre 2026, gymnase Jean Bouin.</p>
  <p>Camp de Pâques à Lyon du 12 au 16 avril 2027 pour les U15.</p>
  <p>Assemblée générale du comité le 5 décembre.</p>
  </body></html>`;

// Réponse que renverrait l'IA, avec les pièges habituels.
const reponseIA = {
  events: [
    { title: "Tournoi de Noël U13", type: "Tournoi", city: "Montpellier", dateStart: "2026-12-20", dateEnd: "", age: ["U13"], sexe: "Mixte" },
    { title: "Camp de Pâques", type: "Camp", city: "Lyon", dateStart: "2027-04-12", dateEnd: "2027-04-16", age: "U15" },
    { title: "Tournoi de Noël U13", type: "Tournoi", city: "Montpellier", dateStart: "2026-12-20" }, // doublon dans la page
    { title: "Tournoi d'été", type: "Tournoi", city: "Nice", dateStart: "2026-07-01" },              // passé
    { title: "Stage sans lieu", type: "Camp", city: "", dateStart: "2027-02-10" },                     // sans ville
    { title: "Rencontre", type: "Tournoi", city: "Paris", dateStart: "" },                             // sans date
    { title: "Camp ASVEL", type: "Camp", city: "Villeurbanne", dateStart: "2027-07-05" },              // déjà en base
  ],
};

const crees = [];
const memoire = new Set([empreinte({ title: "Ancien refusé", dateStart: "2027-01-01", city: "Brest" })]);
const deps = {
  today,
  maintenant: "2026-11-10T05:17:00.000Z",
  lirePage: async () => page,
  extraire: async (prompt) => {
    assert.match(prompt, /Date du jour : 2026-11-10/);
    assert.match(prompt, /Tournoi de Noël U13 à Montpellier/);
    return reponseIA;
  },
  geocoder: async (ev) => ({ lat: 43.6, lng: 3.87, region: ev.city === "Lyon" ? "Auvergne-Rhône-Alpes" : "Occitanie" }),
  dejaVu: async (liste) => new Set(liste.filter(e => memoire.has(e))),
  doublonSaisi: async (ev) => simplifier(ev.title) === "camp asvel",
  creer: async (fiche, emp) => { crees.push(fiche); memoire.add(emp); },
};
const source = { id: "src1", url: "https://comite.example/agenda", nom: "Comité test" };

// 1re analyse
const b1 = await analyserSource(source, deps);
assert.equal(b1.trouves, 7);
assert.equal(b1.crees, 2, "deux événements valides et nouveaux");
assert.equal(b1.doublons, 1, "le Camp ASVEL existe déjà en base");
assert.equal(b1.rejetes, 3);
assert.deepEqual(b1.raisons, { "passé": 1, "sans ville": 1, "sans date": 1 });
const noel = crees.find(f => f.city === "Montpellier");
assert.equal(noel.dateEnd, "2026-12-20", "date de fin = date de début si absente");
assert.equal(noel.poster, null, "l'affiche n'est jamais recopiée");
assert.equal(noel.detection.auto, true);
assert.equal(noel.detection.sourceUrl, source.url);
assert.equal(noel.org.site, source.url, "lien vers la source à défaut de site");
assert.deepEqual(crees.find(f => f.city === "Lyon").age, ["U15"]);
assert.equal(crees.find(f => f.city === "Lyon").region, "Auvergne-Rhône-Alpes");
console.log("1re analyse :", resumeBilan(b1));

// 2e analyse de la même page : rien de nouveau (déjà détectés).
const b2 = await analyserSource(source, deps);
assert.equal(b2.crees, 0);
assert.equal(b2.doublons, 3);
console.log("2e analyse  :", resumeBilan(b2));

// Page illisible
const b3 = await analyserSource(source, { ...deps, lirePage: async () => null });
assert.match(b3.erreur, /illisible/);
console.log("Page KO     :", resumeBilan(b3));

// IA en panne
const b4 = await analyserSource(source, { ...deps, extraire: async () => { throw new Error("modèles saturés"); } });
assert.match(b4.erreur, /saturés/);
console.log("IA KO       :", resumeBilan(b4));

// Règles unitaires
assert.equal(raisonRejet({ title: "x", city: "y", dateStart: "2026-11-01", dateEnd: "2026-11-15" }, today), "", "en cours = gardé");
assert.equal(empreinte({ title: "Tournoi  de NOËL", dateStart: "2026-12-20", city: "montpellier" }),
             empreinte({ title: "tournoi de noel", dateStart: "2026-12-20", city: "Montpellier" }), "empreinte insensible à la casse et aux accents");

console.log("\n✅ Tous les tests de détection passent.");
