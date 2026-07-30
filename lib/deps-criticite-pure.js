// deps-criticite-pure.js — LES DÉCISIONS du gate de criticité des dépendances, séparées de son I/O.
//
// ⚠️⚠️ POURQUOI CE FICHIER EXISTE : ces règles vivaient DANS le fichier du gate. Or
//    **Stryker ne mute pas le code des tests** — la logique du gate y était donc INVÉRIFIABLE : un `!==`
//    devenu `===`, une borne inversée, un `filter` qui ne filtre plus seraient restés VERTS pour toujours.
//    Un gate faux est pire qu'un gate absent : il RASSURE. Ici, chaque règle est PURE ⇒ mutable ⇒ prouvée.
// ⚠️ CONTRAT : zéro I/O (ni fs, ni git, ni réseau). Le gate garde sa lecture des `package.json` et ne fait
//    plus que CONSTATER puis appeler. Ne JAMAIS remettre d'accès disque ici « pour simplifier » — ce
//    serait reperdre la mutabilité qui justifie le fichier (règle du repo : la logique va dans `*-pure`).
// ⚠️ Duplication cross-repo VOULUE (le même module existe dans chaque repo du parc) : un repo doit tenir
//    SEUL — GitHub est un bonus, jamais une dépendance de prod. Une brique partagée créerait un couplage
//    inter-repos pire que la copie. Ce qui diffère d'un repo à l'autre, c'est le MANIFESTE, pas la règle.

// ⚠️ ÉPINGLÉ EXACT = une version, pas une plage. Sont AUTORISÉS le suffixe de PRÉ-RELEASE (`1.5.4-r.1`,
//    cas RÉEL de `@duckdb/node-api`) et les métadonnées de build (`1.2.3+sha`) : ces formes désignent UNE
//    version précise. Sont INTERDITS `^ ~ x * >= <= ||` et les espaces — tout ce qui laisse npm CHOISIR.
// ⚠️ Refuser une forme exacte légitime serait un FAUX POSITIF, et un gate à faux positifs finit désactivé.
export const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

// ⚠️ LE `typeof` N'EST PAS DÉCORATIF — piège prouvé par Stryker le 31/07/2026 : `/regex/.test(x)`
//    CONVERTIT son argument en chaîne, donc `EXACT_VERSION.test(['1.2.3'])` vaut **true**. Sans cette
//    garde, un `package.json` malformé (valeur en tableau) passerait pour une version exacte.
// ⚠️ SOURCE UNIQUE du repli défensif, et ce n'est PAS cosmétique : dupliqué dans chaque fonction, il
//    produisait 2 mutants ÉQUIVALENTS (remplacer `[]` par un tableau non vide donnait le même résultat,
//    car `.map((d) => d.nom)` sur une non-valeur rend `undefined`). Factorisé ici, le repli est traversé
//    par les tests de `depsNonClassees(null)` — le mutant devient TUABLE. Éviter un mutant équivalent PAR
//    CONSTRUCTION vaut mieux que le désactiver.
function liste(x) {
  return Array.isArray(x) ? x : [];
}

export function estEpingleExact(plage) {
  return typeof plage === 'string' && EXACT_VERSION.test(plage);
}

// Dépendances classées `moteur` qui ne sont PAS épinglées exact. `deps` = [{nom, plage, ou}].
// ⚠️ Rend la LISTE (pas un booléen) : un gate doit dire QUOI corriger, pas seulement « non ».
// ⚠️ `hasOwnProperty` OBLIGATOIRE : sans lui, une dépendance nommée `toString`/`constructor` serait vue
//    comme classée « moteur » (clé héritée d'Object) ⇒ rouge incompréhensible.
export function fautesEpinglage(deps, moteurs) {
  if (!moteurs) return [];
  return liste(deps).filter((d) => d && Object.prototype.hasOwnProperty.call(moteurs, d.nom) && !estEpingleExact(d.plage));
}

// Dépendances qu'AUCUNE des deux classes ne mentionne. Non classée = ROUGE : c'est le cliquet qui force à
// TRANCHER, et qui empêche un moteur de rendu d'entrer sur un caret en silence.
// ⚠️ DÉDUPLIQUÉ : la même dépendance déclarée dans 2 `package.json` n'est signalée qu'UNE fois.
export function depsNonClassees(deps, moteurs, ordinaires) {
  const connues = new Set([...Object.keys(moteurs || {}), ...Object.keys(ordinaires || {})]);
  const vues = new Set();
  const out = [];
  for (const d of liste(deps)) {
    if (!d || connues.has(d.nom) || vues.has(d.nom)) continue;
    vues.add(d.nom);
    out.push(d);
  }
  return out;
}

// Entrées du manifeste que PLUS PERSONNE n'installe : une classification fantôme fait croire à une
// couverture qui n'existe pas. Le manifeste doit refléter le réel DANS LES DEUX SENS.
export function entreesFantomes(deps, moteurs, ordinaires) {
  const installees = new Set(liste(deps).filter(Boolean).map((d) => d.nom));
  return [...Object.keys(moteurs || {}), ...Object.keys(ordinaires || {})].filter((n) => !installees.has(n));
}
