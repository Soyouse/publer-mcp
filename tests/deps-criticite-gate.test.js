// deps-criticite-gate.test.js — GATE : toute dépendance est CLASSÉE, et tout MOTEUR est ÉPINGLÉ EXACT.
//
// ⚠️ POURQUOI ICI (propagation parc, 30/07/2026) : le gate est né dans `agent-social` après une asymétrie
//    mesurée — le moteur VIDÉO épinglé exact, les 3 moteurs SVG restés sur des carets EN PROD pendant des
//    mois, parce que **rien ne le vérifiait**. La doctrine CLAUDE.md impose de propager une amélioration au
//    parc DANS LE MÊME GESTE : sans ça les autres repos gardent un handicap INVISIBLE.
// ⚠️⚠️ CE REPO N'A AUCUN MOTEUR AUJOURD'HUI — ET C'EST EXACTEMENT LE CAS DANGEREUX. Un gate dont le
//    périmètre est VIDE est un gate DORMANT : il passe au vert sans rien vérifier, et le jour où
//    quelqu'un ajoute un moteur de rendu sur un caret, personne ne sait s'il aurait mordu. D'où le test
//    d'ANTI-DORMANCE ci-dessous : il fabrique un moteur FACTICE mal épinglé et exige que le vérificateur
//    le rejette. La mécanique est prouvée vivante même avec zéro moteur réel.
// ⚠️ DUPLICATION CROSS-REPO ASSUMÉE : ce gate est volontairement recopié dans chaque repo du parc plutôt
//    que factorisé dans un paquet partagé. Un repo DOIT tenir seul (GitHub = bonus, jamais une dépendance
//    de prod) ; une brique commune créerait un couplage inter-repos pire que la copie.
import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// ⚠️ Les RÈGLES vivent dans `lib/deps-criticite-pure.js` (mutées par Stryker) — un gate ne fait que
//    CONSTATER. Une décision enfermée dans un fichier de test n'est jamais mutée, donc jamais prouvée.
import { estEpingleExact, fautesEpinglage as fautesPures, depsNonClassees, entreesFantomes } from "../lib/deps-criticite-pure.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// ⚠️ BOM TOLÉRÉ À LA LECTURE : npm accepte un package.json avec BOM UTF-8, `JSON.parse` LÈVE dessus
//    (cas réel trouvé ailleurs dans le parc). Un gate ne doit pas MOURIR sur le défaut qu'il rapporte.
const lireJson = (f) => JSON.parse(readFileSync(f, "utf8").replace(/^﻿/, ""));
const MANIFESTE = lireJson(path.join(ROOT, "deps-criticite.json"));

// ⚠️ Dossiers portant des package.json qui ne sont PAS les nôtres (dépendances, bacs à sable d'outils).
const IGNORE = new Set(["node_modules", ".git", ".stryker-tmp", "coverage", "reports", "dist"]);

// Liste des package.json DÉRIVÉE de l'arborescence, jamais écrite — un sous-paquet ajouté plus tard est
// couvert sans que personne y pense.
function packageJsons(dir = ROOT, out = []) {
  for (const e of readdirSync(dir)) {
    if (IGNORE.has(e)) continue;
    const p = path.join(dir, e);
    if (e === "package.json") out.push(p);
    else if (statSync(p).isDirectory()) packageJsons(p, out);
  }
  return out;
}

function toutesDeps() {
  const out = [];
  for (const file of packageJsons()) {
    const ou = path.relative(ROOT, path.dirname(file)).replace(/\\/g, "/") || ".";
    const pkg = lireJson(file);
    for (const bloc of ["dependencies", "devDependencies"]) {
      for (const [nom, plage] of Object.entries(pkg[bloc] || {})) out.push({ nom, plage, ou });
    }
  }
  return out;
}

describe("criticité des dépendances", () => {
  test("toute dépendance est CLASSÉE dans deps-criticite.json (non classée = ROUGE, jamais un oubli silencieux)", () => {
    const deps = toutesDeps();
    // ⚠️ ANTI-GATE-CREUX : si la découverte cassait (IGNORE trop large, dossier renommé), ce test
    //    passerait au vert en ne vérifiant RIEN.
    expect(deps.length).toBeGreaterThanOrEqual(7);

    const inconnues = depsNonClassees(deps, MANIFESTE.moteur, MANIFESTE.ordinaire).map((d) => `${d.nom} (${d.ou})`);
    expect(
      inconnues,
      `\nDÉPENDANCE(S) NON CLASSÉE(S) :\n  ${inconnues.join("\n  ")}\n\n=> Ajouter chacune à deps-criticite.json sous "moteur" (elle DÉTERMINE la sortie livrée ⇒ épinglage EXACT obligatoire) ou "ordinaire" (elle ne change pas la sortie ⇒ caret souhaitable), avec la RAISON. Trancher EST le but du gate.\n`,
    ).toEqual([]);
  });

  test("toute dépendance classée `moteur` est ÉPINGLÉE EXACT (ni ^, ni ~, ni plage)", () => {
    const fautes = fautesPures(toutesDeps(), MANIFESTE.moteur).map((d) => `${d.ou} · ${d.nom} = "${d.plage}" — classé MOTEUR ⇒ DOIT être épinglé EXACT. Une plage fait dériver la SORTIE à chaque install, en silence.`);
    expect(fautes, `\n${fautes.join("\n")}\n`).toEqual([]);
  });

  test("ANTI-DORMANCE : le vérificateur MORD, même si ce repo n'a aucun moteur aujourd'hui", () => {
    // ⚠️ SANS CE TEST, le gate précédent serait VIDE DE SENS ici : zéro moteur classé ⇒ zéro faute
    //    possible ⇒ vert éternel. On prouve donc la mécanique sur un moteur FACTICE : on prend une
    //    dépendance réelle du repo (forcément sur un caret) et on la déclare moteur le temps du test.
    const deps = toutesDeps();
    const surPlage = deps.find((d) => !estEpingleExact(d.plage));
    expect(surPlage, "aucune dépendance sur une plage : impossible de prouver que le gate mord").toBeTruthy();

    const factice = { [surPlage.nom]: "MOTEUR FACTICE — présent UNIQUEMENT pour prouver que le gate mord." };
    // ⚠️ Nombre attendu DÉRIVÉ du réel, jamais écrit « 1 » : la même dépendance peut être déclarée dans
    //    PLUSIEURS package.json — chaque déclaration doit produire sa faute. Écrire 1 en dur fait rougir
    //    le test pour une mauvaise raison (vécu à la pose, sur un repo multi-paquets).
    const attendu = deps.filter((d) => d.nom === surPlage.nom && !estEpingleExact(d.plage)).length;
    expect(attendu).toBeGreaterThanOrEqual(1);
    expect(fautesPures(deps, factice)).toHaveLength(attendu);
    // Et l'inverse : correctement épinglée, elle ne doit PAS être signalée (pas de gate qui crie à tort).
    expect(fautesPures([{ ...surPlage, plage: "1.2.3" }], factice)).toEqual([]);
  });

  test("le manifeste ne classe AUCUNE dépendance fantôme (une entrée que plus personne n'installe)", () => {
    // ⚠️ Une entrée que personne n'écrit donne une FAUSSE impression de couverture. Le manifeste doit
    //    refléter le réel DANS LES DEUX SENS.
    const fantomes = entreesFantomes(toutesDeps(), MANIFESTE.moteur, MANIFESTE.ordinaire);
    expect(
      fantomes,
      `entrée(s) de deps-criticite.json qu'AUCUN package.json n'installe : ${fantomes.join(", ")} — retirer (une classification fantôme fait croire à une couverture qui n'existe pas)`,
    ).toEqual([]);
  });
});
