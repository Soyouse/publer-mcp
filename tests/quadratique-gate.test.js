// ─────────────────────────────────────────────────────────────────────────────
// GATE « LA COMPLEXITÉ SE DÉCLARE » — 3ᵉ jumeau du TEMPS et de l'ESPACE.
//
// ⚠️ POURQUOI CE GATE EXISTE
//    La cible est une flotte de CENTAINES de clients. Un défaut d'échelle ne « ralentit » pas :
//    il FERME UN CONTRAT (plusieurs dizaines de k€), et son retrofit est prohibitif ⇒ il
//    appartient à la SPEC, jamais à un réglage ultérieur.
//    La règle existait EN PROSE dans CLAUDE.md et a été violée PLUSIEURS FOIS dans la même
//    session, par l'agent qui venait de l'appliquer dix minutes plus tôt. Le biais est
//    STRUCTUREL : on raisonne sur ce qu'on MESURE, et on mesure toujours le PRÉSENT.
//    ⇒ De la prose ne refuse rien.
//
// ⚠️ SÉPARATION DES RÔLES, ne jamais la fusionner :
//      • `rules/no-undeclared-quadratic.yml` = DÉTECTION exacte, AUCUNE exemption dedans
//      • CE FICHIER                          = POLITIQUE (budget par fichier) + CLIQUET
//    Deux jeux d'exemptions divergeraient en silence.
//
// 🛑 NE JAMAIS remonter un `max` pour faire passer un push. Le cliquet ne DESCEND que.
// 🛑 NE JAMAIS modifier du code de production pour faire baisser un compte au moment de poser le
//    gate : le budget DÉCLARE l'existant, il ne le corrige pas.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RACINE, scanRegle, scanRegleSansCache, invaliderCacheAstGrep, parFichier } from "./ast-grep.js";

const REGLE = path.join(RACINE, "rules", "no-undeclared-quadratic.yml");

// ⚠️ SOUS STRYKER, CE GATE NE LIT PAS NOTRE CODE — il lit du code INSTRUMENTÉ, dont les gardes
//    ajoutées par l'instrumentation FABRIQUENT des imbrications qui n'existent nulle part chez
//    nous. 🛑 Ce n'est PAS un assouplissement : le gate tourne INTÉGRALEMENT en `npm test`, sur
//    les sources RÉELLES. On refuse seulement de juger du code qui n'est pas le nôtre.
const SOUS_STRYKER = RACINE.includes(".stryker-tmp");

// ── PÉRIMÈTRE = TOUT LE CODE QUI TOURNE, DÉRIVÉ DU DISQUE ────────────────────
// ⚠️ DÉRIVÉ, jamais une liste écrite à la main : un dossier ou un module racine ajouté demain
//    entre seul dans le périmètre. Une liste manuelle annonce « tout couvert » et laisse un angle
//    mort silencieux le jour où quelqu'un crée `workers/`.
// ⚠️ Les EXCLUSIONS sont une liste FERMÉE et JUSTIFIÉE (jamais un filtre « qui ressemble à ») :
//    `tests` = nos propres tests (jamais livrés), le reste ne contient aucun code exécuté en prod.
const EXCLUS = new Set(["node_modules", "tests", "coverage", "reports", "docs", "data", "rules", ".git"]);

function perimetre() {
  return fs
    .readdirSync(RACINE, { withFileTypes: true })
    .filter((e) => !e.name.startsWith(".") && !EXCLUS.has(e.name))
    .filter((e) => e.isDirectory() || /\.(js|mjs|cjs)$/.test(e.name))
    .map((e) => e.name)
    .sort();
}

// ── LIGNE DE BASE, GÉNÉRÉE PAR MESURE le 2026-08-20 avec l'outil QUI GATE ────
// (ast-grep + rules/no-undeclared-quadratic.yml — jamais un chiffre choisi, jamais recopié d'un
//  autre dépôt : un chiffre choisi serait le jugement d'un jour.)
//
// ⚠️ `DETTE_HERITEE` = la MESURE DU JOUR, PAS un blanc-seing et PAS une justification : personne
//    n'a instruit ces fichiers un par un. Le volet ⑤ en DISPENSE la justification À DESSEIN —
//    en exiger une produirait des phrases INVENTÉES, qui feraient ensuite croire le cas tranché.
//    Une justification fausse est PIRE que pas de justification.
// CONDITION DE SORTIE : zéro entrée `DETTE_HERITEE` restante.
const CLASSES = new Set(["O(N)", "O(N log N)", "DETTE", "DETTE_HERITEE"]);

const BUDGET = {
  "http.js": { max: 1, classe: "DETTE_HERITEE" },
  "lib/deps-criticite-pure.js": { max: 1, classe: "DETTE_HERITEE" },
  "scripts/fuite-gate.mjs": { max: 2, classe: "DETTE_HERITEE" },
  "scripts/live-concurrency.mjs": { max: 2, classe: "DETTE_HERITEE" },
};

const scan = () => parFichier(scanRegle(REGLE, perimetre()));

const AIDE =
  "\n→ SORTIE : index inversé / Map / Set — élaguer ce qu'on PROUVE hors seuil." +
  "\n→ Vraiment borné (jetons, workspaces, statuts) ? Déclarer la classe O(N) + le POURQUOI." +
  "\n🛑 JAMAIS un algorithme probabiliste (LSH/échantillonnage) : un faux négatif a un coût client.";

describe.skipIf(SOUS_STRYKER)("la complexité se déclare — parcours imbriqués (AST)", () => {
  // ── ANTI-SONDE-MUETTE ──────────────────────────────────────────────────────
  // ⚠️ Sans ce volet, une règle cassée, un binaire absent ou un périmètre vide rendraient `{}` ⇒
  //    TOUS les autres volets passeraient au vert PAR VACUITÉ. C'est la pire panne possible d'un
  //    gate : celle qui ressemble à une bonne nouvelle.
  // 🔍 MESURÉ à la pose : ast-grep rend un JSON VIDE, en sortie 0, quand on lui donne un chemin
  //    HORS du projet — un scan muet est donc un mode de panne RÉEL ici, pas théorique.
  test("le scan MESURE réellement quelque chose", { timeout: 60000 }, () => {
    expect(perimetre().length, "Périmètre VIDE — la dérivation du disque ne rend plus rien.").toBeGreaterThan(0);
    expect(
      Object.keys(scan()).length,
      "Le scan ne rend AUCUN fichier — règle cassée, binaire absent ou périmètre vide.\n" +
        "Un budget confronté à zéro mesure serait vert POUR TOUJOURS."
    ).toBeGreaterThan(0);
  });

  // ── ① FICHIER NON DÉCLARÉ = TENU À ZÉRO ────────────────────────────────────
  test("aucun parcours imbriqué dans un fichier NON déclaré", { timeout: 60000 }, () => {
    const clandestins = Object.entries(scan()).filter(([f]) => !BUDGET[f]);
    expect(
      clandestins,
      "Parcours imbriqué NON DÉCLARÉ : " +
        clandestins.map(([f, n]) => f + "(" + n + ")").join(", ") +
        "\nUn fichier absent du budget est tenu à ZÉRO — c'est ce qui donne 100 % de la règle sur" +
        "\ntout code NEUF sans exiger de réparer d'abord tout l'existant." +
        AIDE
    ).toEqual([]);
  });

  // ── ② CLIQUET MONTANT ──────────────────────────────────────────────────────
  test("aucun budget dépassé (le cliquet ne remonte jamais)", { timeout: 60000 }, () => {
    const par = scan();
    const trop = Object.entries(BUDGET)
      .filter(([f, e]) => (par[f] || 0) > e.max)
      .map(([f, e]) => f + " : " + par[f] + " > " + e.max);
    expect(
      trop,
      "Budget de complexité DÉPASSÉ :\n  " +
        trop.join("\n  ") +
        "\n🛑 NE PAS remonter le `max`. Ce serait déclarer que le code a le droit d'empirer." +
        AIDE
    ).toEqual([]);
  });

  // ── ③ CLIQUET INVERSE : un progrès non enregistré se REPERD ─────────────────
  test("aucun progrès non enregistré (cliquet inverse)", { timeout: 60000 }, () => {
    const par = scan();
    const baisses = Object.entries(BUDGET)
      .filter(([f, e]) => (par[f] || 0) < e.max && (par[f] || 0) > 0)
      .map(([f, e]) => f + " : " + par[f] + " < " + e.max);
    expect(
      baisses,
      "Progrès NON ENREGISTRÉ :\n  " +
        baisses.join("\n  ") +
        "\n→ Baisser le `max` à la valeur mesurée, dans le MÊME geste. Sans ça le terrain gagné" +
        "\n  est repris en silence par le prochain, qui a droit à l'ancien plafond."
    ).toEqual([]);
  });

  // ── ④ ZÉRO ENTRÉE FANTÔME ──────────────────────────────────────────────────
  test("aucune entrée périmée au budget", { timeout: 60000 }, () => {
    const par = scan();
    const fantomes = Object.keys(BUDGET).filter((f) => !par[f]);
    expect(
      fantomes,
      "Entrée de budget qui ne correspond à RIEN : " +
        fantomes.join(", ") +
        "\n→ Fichier supprimé/renommé, ou occurrences toutes corrigées : RETIRER la ligne." +
        "\n⚠️ Une entrée fantôme est un PERMIS DORMANT : un fichier recréé hériterait du droit."
    ).toEqual([]);
  });

  // ── ⑤ LA DÉCLARATION DOIT DIRE QUELQUE CHOSE ───────────────────────────────
  test("toute entrée porte une classe connue, et toute entrée INSTRUITE se justifie", () => {
    const inconnues = Object.entries(BUDGET)
      .filter(([, e]) => !CLASSES.has(e.classe))
      .map(([f, e]) => f + " (classe " + e.classe + ")");
    expect(
      inconnues,
      "Classe hors liste FERMÉE : " + inconnues.join(", ") + "\nClasses admises : " + [...CLASSES].join(" · ")
    ).toEqual([]);

    // ⚠️ `DETTE_HERITEE` DISPENSÉE de justification, À DESSEIN (cf. en-tête du BUDGET).
    //    Toute AUTRE classe est un acte d'instruction : elle se défend au diff.
    const sansPourquoi = Object.entries(BUDGET)
      .filter(([, e]) => e.classe !== "DETTE_HERITEE" && String(e.pourquoi || "").length <= 60)
      .map(([f]) => f);
    expect(
      sansPourquoi,
      "Entrée instruite SANS justification (>60 car.) : " +
        sansPourquoi.join(", ") +
        "\n→ Écrire sur QUOI porte la boucle interne et pourquoi elle est bornée."
    ).toEqual([]);

    // ⚠️ Un budget mesure la QUANTITÉ, jamais la GRAVITÉ. « N en dette » met sur le même plan une
    //    imbrication bénigne et une qui ferme un contrat.
    const sansImpact = Object.entries(BUDGET)
      .filter(([, e]) => e.classe === "DETTE" && String(e.impact || "").length < 40)
      .map(([f]) => f);
    expect(
      sansImpact,
      "DETTE sans impact CHIFFRÉ (≥40 car.) : " +
        sansImpact.join(", ") +
        "\n→ Écrire ce que ça coûte à 10 000 : « à 5 000 éléments = 12,5 M de paires »."
    ).toEqual([]);
  });
});

// ═══ NEGATIVE-CHECK OBLIGATOIRE (anti-gate-creux) ═════════════════════════════
// ⚠️ Un gate non saboté ne prouve RIEN. On prouve que la règle voit ce qu'elle prétend voir, ET
//    qu'elle se tait sur le sain (un gate à faux positifs finit désactivé).
// ⚠️ LES LEURRES VIVENT DANS UN DOSSIER DÉDIÉ, HORS du périmètre de production : écrire un faux
//    fichier dans `lib/` ferait rougir AU HASARD les gates qui tournent EN PARALLÈLE. Un gate ne
//    doit jamais rendre un AUTRE gate flaky — une suite qui rougit au hasard cesse d'être lue.
describe.skipIf(SOUS_STRYKER)("NEGATIVE-CHECK : la règle voit ce qu'elle prétend voir", () => {
  const BAC = path.join(RACINE, ".sonde-quadratique");

  function avecLeurre(contenu, verif) {
    fs.mkdirSync(BAC, { recursive: true });
    const nom = ".sonde-quadratique/leurre.js";
    fs.writeFileSync(path.join(BAC, "leurre.js"), contenu);
    try {
      invaliderCacheAstGrep();
      verif(parFichier(scanRegleSansCache(REGLE, [".sonde-quadratique"])), nom);
    } finally {
      fs.rmSync(BAC, { recursive: true, force: true });
      invaliderCacheAstGrep(); // sinon un test suivant lirait un cache CONTAMINÉ
    }
  }

  test("une boucle DANS une boucle est DÉTECTÉE", { timeout: 60000 }, () => {
    avecLeurre(
      "export const f = (xs, ys) => { for (const x of xs) { for (const y of ys) { void x, y; } } };\n",
      (vu, nom) => expect(Object.keys(vu), "for..of dans for..of DOIT être vu").toContain(nom)
    );
  });

  test("⚠️ un parcours FONCTIONNEL imbriqué est DÉTECTÉ", { timeout: 60000 }, () => {
    // 🔴 CE VOLET EXISTE PARCE QU'UNE RÈGLE ÉCRITE AVEC DES MÉTAVARIABLES CAPTURANTES LE RATE :
    //    elles s'UNIFIENT entre les deux étages, donc celle liée au tableau extérieur exigerait le
    //    MÊME tableau à l'intérieur. La règle verrait 4 formes sur 5 et aurait l'air correcte.
    //    C'est la forme la plus courante du O(N²) moderne. NE JAMAIS retirer ce volet ni les `_`.
    avecLeurre(
      "export const f = (xs, ys) => xs.map((x) => ys.find((y) => y.id === x.id));\n",
      (vu, nom) => expect(Object.keys(vu), "parcours fonctionnel imbriqué DOIT être vu").toContain(nom)
    );
  });

  test("une recherche linéaire DANS une boucle est DÉTECTÉE", { timeout: 60000 }, () => {
    // Le seul O(N²) réellement MESURÉ dans ce parc était un `.find()` DANS une boucle :
    // syntaxiquement ce n'est PAS une boucle imbriquée. Une règle qui ne verrait que
    // `for`-dans-`for` serait donc creuse, et contournable en réécrivant en `.map()`.
    avecLeurre(
      "export const f = (xs, ys) => { for (const x of xs) { if (ys.includes(x)) return x; } };\n",
      (vu, nom) => expect(Object.keys(vu), "une recherche linéaire en boucle DOIT être vue").toContain(nom)
    );
  });

  test("⚠️ une boucle SIMPLE n'est PAS comptée (zéro faux positif)", { timeout: 60000 }, () => {
    avecLeurre(
      "export const f = (xs) => { for (const x of xs) { console.log(x); } };\n",
      (vu, nom) => expect(Object.keys(vu), "un parcours linéaire ne DOIT PAS compter").not.toContain(nom)
    );
  });

  test("⚠️ une imbrication en COMMENTAIRE ou en CHAÎNE n'est PAS comptée", { timeout: 60000 }, () => {
    // Le symétrique : un gate à faux positifs finit désactivé. C'est ce que l'AST supprime — et
    // c'est pourquoi un grep, qui rend un mur de candidats presque tous faux, a été rejeté.
    avecLeurre(
      "// for (const a of b) { for (const c of d) {} }\nexport const s = 'for (x of y) { z.find(w) }';\n",
      (vu, nom) => expect(Object.keys(vu), "prose et chaînes ne DOIVENT PAS compter").not.toContain(nom)
    );
  });
});
