// sources-non-instrumentees-gate.test.js — GATE : aucun fichier SUIVI ne porte de code instrumenté par Stryker.
//
// 🔴 LA CLASSE FERMÉE ICI (incident réel du parc, 09/08/2026 — wz-design-engine) :
//    avec `inPlace`, Stryker ne restaure les sources qu'en fin de run NORMALE. Un timeout,
//    un kill ou un crash saute cette étape ⇒ des fichiers SOURCES restent truffés
//    d'instrumentation sur le disque — et **les tests restent VERTS**, car l'instrumentation
//    est transparente. Le commit suivant embarque alors un moteur corrompu, SANS AUCUN
//    SYMPTÔME. C'est la définition même de la régression silencieuse : rien ne rougit, et la
//    faute part en production.
//
// ⚠️ CE REPO N'ACTIVE PAS `inPlace` AUJOURD'HUI — et c'est exactement pourquoi le gate se pose
//    MAINTENANT : `inPlace` est une ligne à ajouter dans `stryker.conf.json`, et le jour où
//    quelqu'un l'ajoute (ou lance `stryker run --inPlace`) plus personne ne se souviendra du
//    réflexe. Le gate rend inutile la consigne « `git checkout -- .` + purge de `.stryker-tmp/`
//    après tout run interrompu » en la rendant MÉCANIQUE. Prescrit par `stryker-runner-choice.md`.
//
// ⚠️ PÉRIMÈTRE = les fichiers SUIVIS PAR GIT, jamais le disque : le bac à sable `.stryker-tmp/`
//    est gitignoré et contient LÉGITIMEMENT des copies instrumentées. Le juger reviendrait à un
//    mur de faux rouges, donc à un gate qu'on débranche.
//
// ⚠️ DUPLICATION CROSS-REPO ASSUMÉE (même raison que `deps-criticite-gate`) : un repo DOIT tenir
//    seul ; une brique partagée créerait un couplage inter-repos pire que la copie.
import { describe, test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ⚠️ JETONS COMPOSÉS À L'EXÉCUTION, jamais écrits d'un seul tenant : sinon CE FICHIER se
//    dénoncerait lui-même et il faudrait s'auto-exempter — une exemption qui, une fois posée,
//    masquerait aussi une VRAIE instrumentation de ce même fichier. NE JAMAIS « simplifier »
//    ces concaténations.
const JETONS = ["stry" + "MutAct_", "stry" + "NS_", "stry" + "Cov_"];

// EXEMPTIONS — fichiers qui citent LÉGITIMEMENT un jeton parce qu'ils le DÉTECTENT.
// ⚠️ CLIQUET INVERSE : une exemption périmée (fichier disparu, ou ne citant plus rien) est ROUGE
//    elle aussi. Une liste d'exemptions qu'on n'élague jamais finit par tout couvrir.
// Aucune exemption à ce jour — et ce fichier n'a PAS besoin de s'exempter, cf. la note ci-dessus.
const EXEMPTIONS = {};

function fichiersSuivis() {
  // ⚠️ Hors d'un arbre git (bac à sable Stryker, archive extraite), git rend ZÉRO ou THROW. C'est
  //    une MESURE IMPOSSIBLE, jamais un défaut — les confondre produit un verdict MENTEUR.
  try {
    const sortie = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" });
    return sortie.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// PRÉCONDITION D'ENVIRONNEMENT : les sources doivent être atteignables ET suivies.
// 🛑 Ce skip ne rend PAS le gate inerte — la CI et le pre-push tournent dans le vrai dépôt, et
//    c'est là que ce gate mord.
const MESURABLE = existsSync(path.join(ROOT, "package.json")) && fichiersSuivis().length > 0;

function contientUnJeton(chemin) {
  let brut;
  try {
    brut = readFileSync(path.join(ROOT, chemin), "utf8");
  } catch {
    return false; // suivi mais absent du disque (checkout partiel) : pas notre sujet
  }
  return JETONS.some((j) => brut.includes(j));
}

describe.skipIf(!MESURABLE)("gate — aucune source suivie n'est instrumentée par Stryker (SKIP hors arbre git : mesure impossible)", () => {
  const suivis = fichiersSuivis();

  test("⚠️ anti-sonde-muette : le relevé voit bien des fichiers", () => {
    // Sans ce volet, un `git ls-files` cassé rendrait le gate VERT PAR VACUITÉ.
    expect(suivis.length).toBeGreaterThan(20);
  });

  test("⚠️ ANTI-INERTE : le détecteur reconnaît une instrumentation RÉELLE et se tait sur du code sain", () => {
    // Forme réellement émise par Stryker (fonction de garde + compteur de couverture).
    const echantillon = `function ${JETONS[0]}9fa48(){} if (${JETONS[0]}9fa48("12")) { ${JETONS[2]}.x++; }`;
    expect(JETONS.some((j) => echantillon.includes(j))).toBe(true);
    // Et il ne crie pas sur du code sain — sans ce revers, un détecteur qui dit « oui » à tout
    // passerait pour vivant tout en étant inutilisable.
    expect(JETONS.some((j) => "export const x = 1;".includes(j))).toBe(false);
    // Les 3 jetons sont DISTINCTS et non vides (une concaténation cassée les viderait en silence).
    expect(new Set(JETONS).size).toBe(3);
    expect(JETONS.every((j) => j.length > 5)).toBe(true);
  });

  test("⛔ aucun fichier suivi non exempté ne porte de jeton d'instrumentation", () => {
    const coupables = suivis.filter((f) => !(f in EXEMPTIONS)).filter(contientUnJeton);
    expect(
      coupables,
      coupables.length
        ? "\n🔴 SOURCES INSTRUMENTÉES COMMITÉES OU EN ATTENTE DE COMMIT :\n" +
          coupables.map((f) => "   - " + f).join("\n") +
          "\n\nUn run Stryker a été interrompu et n'a pas restauré ses sources.\n" +
          "Les tests restent VERTS dans cet état : ne PAS conclure que tout va bien.\n" +
          "Réparer : `git checkout -- .` puis supprimer le bac à sable `.stryker-tmp/`.\n"
        : "",
    ).toEqual([]);
  });

  test("⚠️ cliquet inverse : aucune exemption périmée", () => {
    const perimees = Object.keys(EXEMPTIONS).filter((f) => !suivis.includes(f) || !contientUnJeton(f));
    expect(
      perimees,
      "Exemption(s) qui ne protègent plus rien — les retirer :\n" + perimees.join("\n"),
    ).toEqual([]);
  });

  test("chaque exemption porte une RAISON (une liste sans raison se remplit toute seule)", () => {
    for (const [f, raison] of Object.entries(EXEMPTIONS)) {
      expect(raison.length, f).toBeGreaterThan(20);
    }
  });
});
