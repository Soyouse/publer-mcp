// SOURCE UNIQUE de l'INVOCATION d'ast-grep par les gates de ce dépôt (outil de test, non muté).
//
// ⚠️ Ce code est un NID À PIÈGES — deux copies divergeraient au premier piège corrigé d'un seul
//    côté. Tout gate statique AST de ce dépôt passe par ici :
//      • ast-grep sort en code NON-ZÉRO dès qu'il TROUVE une occurrence (comportement NORMAL d'un
//        linter en `severity: error`). Le JSON attendu est alors dans `err.stdout` : sans ce
//        catch, le gate échoue TOUJOURS — y compris quand tout va bien.
//      • Windows : l'invocation passe par cmd.exe (`shell: true`), donc la règle est passée en
//        FICHIER (`-r chemin.yml`), JAMAIS un pattern en argv qui serait découpé aux espaces.
//      • Le binaire local (`node_modules/.bin`) est préféré à `npx` (déterministe, hors ligne).
//
// 🛑 FAIL-CLOSED : binaire absent ou règle invalide ⇒ THROW. Jamais un résultat vide, qui
//    passerait pour « aucune occurrence » — la pire panne d'un gate est celle qui ressemble à une
//    bonne nouvelle.
//
// ⚠️ `execFileSync` SYNCHRONE et assumé : le process est terminé quand la fonction rend la main,
//    fuite impossible par construction.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function binAstGrep() {
  const ext = process.platform === "win32" ? ".cmd" : "";
  const local = path.join(RACINE, "node_modules", ".bin", `ast-grep${ext}`);
  if (!fs.existsSync(local)) {
    throw new Error(
      "ast-grep INTROUVABLE dans node_modules/.bin — `npm install` d'abord.\n" +
        "🛑 Ne PAS neutraliser ce throw : un scan qui rend [] sans binaire rendrait TOUS les gates AST verts."
    );
  }
  return local;
}

/**
 * Scan RÉEL (sans cache). Rend UNE entrée PAR OCCURRENCE, chemin RELATIF à la racine, en POSIX.
 *
 * ⚠️ Chemin RELATIF et jamais le basename : deux fichiers homonymes dans deux dossiers
 *    (`handlers/config.js` vs `lib/core/config.js`) se confondraient et un budget couvrirait
 *    silencieusement l'autre.
 * @param {string} regleYml chemin absolu du .yml
 * @param {string[]} cibles chemins RELATIFS à la racine
 * @returns {string[]}
 */
export function scanRegleSansCache(regleYml, cibles) {
  const bin = binAstGrep();
  const opts = {
    cwd: RACINE,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    maxBuffer: 32 * 1024 * 1024,
  };
  let out;
  try {
    out = execFileSync(bin, ["scan", "-r", regleYml, ...cibles, "--json=compact"], opts);
  } catch (err) {
    // ⚠️ Un code non-zéro AVEC un stdout JSON = des occurrences trouvées, PAS un échec.
    if (typeof err.stdout !== "string" || err.stdout.trim() === "") throw err;
    out = err.stdout;
  }
  return JSON.parse(out || "[]").map((m) => String(m.file).split("\\").join("/"));
}

// ⚠️ CACHE PAR (règle × cibles) — le code source ne change pas PENDANT un run, et un gate ne doit
//    jamais coûter assez cher pour faire rougir un AUTRE test. `invaliderCacheAstGrep()` existe
//    pour les negative-checks, qui eux modifient les sources en cours de run.
const _cache = new Map();

export function invaliderCacheAstGrep() {
  _cache.clear();
}

export function scanRegle(regleYml, cibles) {
  const cle = `${regleYml}::${cibles.join("|")}`;
  if (!_cache.has(cle)) _cache.set(cle, scanRegleSansCache(regleYml, cibles));
  return _cache.get(cle);
}

/** Agrège une liste d'occurrences en { cheminRelatif: compte }. */
export function parFichier(occurrences) {
  const par = {};
  for (const f of occurrences) par[f] = (par[f] || 0) + 1;
  return par;
}
