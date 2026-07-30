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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFESTE = JSON.parse(readFileSync(path.join(ROOT, "deps-criticite.json"), "utf8"));

// ⚠️ Dossiers portant des package.json qui ne sont PAS les nôtres (dépendances, bacs à sable d'outils).
const IGNORE = new Set(["node_modules", ".git", ".stryker-tmp", "coverage", "reports", "dist"]);

// ⚠️ ÉPINGLÉ EXACT = une version, pas une plage. Le suffixe de pré-release est AUTORISÉ (`1.5.4-r.1` est
//    parfaitement exact) : ce qu'on interdit, c'est `^`, `~`, `x`, `>=`, `||` — tout ce qui laisse npm
//    choisir la version installée, donc dériver la sortie en silence.
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

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
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    for (const bloc of ["dependencies", "devDependencies"]) {
      for (const [nom, plage] of Object.entries(pkg[bloc] || {})) out.push({ nom, plage, ou });
    }
  }
  return out;
}

// ⚠️ DÉCISION PURE, séparée de l'I/O — c'est elle que le test d'anti-dormance peut interroger avec un
//    manifeste FACTICE. Une règle enfermée dans un test n'est ni réutilisable ni prouvable.
function fautesEpinglage(deps, moteurs) {
  return deps
    .filter((d) => moteurs[d.nom] && !EXACT.test(d.plage))
    .map(
      (d) =>
        `${d.ou} · ${d.nom} = "${d.plage}" — classé MOTEUR (${moteurs[d.nom].slice(0, 90)}…) ⇒ DOIT être épinglé EXACT. Une plage fait dériver la SORTIE à chaque install, en silence.`,
    );
}

describe("criticité des dépendances", () => {
  test("toute dépendance est CLASSÉE dans deps-criticite.json (non classée = ROUGE, jamais un oubli silencieux)", () => {
    const deps = toutesDeps();
    // ⚠️ ANTI-GATE-CREUX : si la découverte cassait (IGNORE trop large, dossier renommé), ce test
    //    passerait au vert en ne vérifiant RIEN.
    expect(deps.length).toBeGreaterThanOrEqual(7);

    const connues = new Set([...Object.keys(MANIFESTE.moteur), ...Object.keys(MANIFESTE.ordinaire)]);
    const inconnues = [...new Set(deps.filter((d) => !connues.has(d.nom)).map((d) => `${d.nom} (${d.ou})`))];
    expect(
      inconnues,
      `\nDÉPENDANCE(S) NON CLASSÉE(S) :\n  ${inconnues.join("\n  ")}\n\n=> Ajouter chacune à deps-criticite.json sous "moteur" (elle DÉTERMINE la sortie livrée ⇒ épinglage EXACT obligatoire) ou "ordinaire" (elle ne change pas la sortie ⇒ caret souhaitable), avec la RAISON. Trancher EST le but du gate.\n`,
    ).toEqual([]);
  });

  test("toute dépendance classée `moteur` est ÉPINGLÉE EXACT (ni ^, ni ~, ni plage)", () => {
    const fautes = fautesEpinglage(toutesDeps(), MANIFESTE.moteur);
    expect(fautes, `\n${fautes.join("\n")}\n`).toEqual([]);
  });

  test("ANTI-DORMANCE : le vérificateur MORD, même si ce repo n'a aucun moteur aujourd'hui", () => {
    // ⚠️ SANS CE TEST, le gate précédent serait VIDE DE SENS ici : zéro moteur classé ⇒ zéro faute
    //    possible ⇒ vert éternel. On prouve donc la mécanique sur un moteur FACTICE : on prend une
    //    dépendance réelle du repo (forcément sur un caret) et on la déclare moteur le temps du test.
    const deps = toutesDeps();
    const surPlage = deps.find((d) => !EXACT.test(d.plage));
    expect(surPlage, "aucune dépendance sur une plage : impossible de prouver que le gate mord").toBeTruthy();

    const factice = { [surPlage.nom]: "MOTEUR FACTICE — présent UNIQUEMENT pour prouver que le gate mord." };
    expect(fautesEpinglage(deps, factice)).toHaveLength(1);
    // Et l'inverse : correctement épinglée, elle ne doit PAS être signalée (pas de gate qui crie à tort).
    expect(fautesEpinglage([{ ...surPlage, plage: "1.2.3" }], factice)).toEqual([]);
  });

  test("le manifeste ne classe AUCUNE dépendance fantôme (une entrée que plus personne n'installe)", () => {
    // ⚠️ Une entrée que personne n'écrit donne une FAUSSE impression de couverture. Le manifeste doit
    //    refléter le réel DANS LES DEUX SENS.
    const installees = new Set(toutesDeps().map((d) => d.nom));
    const fantomes = [...Object.keys(MANIFESTE.moteur), ...Object.keys(MANIFESTE.ordinaire)].filter(
      (n) => !installees.has(n),
    );
    expect(
      fantomes,
      `entrée(s) de deps-criticite.json qu'AUCUN package.json n'installe : ${fantomes.join(", ")} — retirer (une classification fantôme fait croire à une couverture qui n'existe pas)`,
    ).toEqual([]);
  });
});
