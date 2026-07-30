// deps-criticite-pure.test.js — EDGE CASES des décisions du gate de criticité (module PUR, muté).
//
// ⚠️ CE QUE CETTE SUITE PROTÈGE : les règles qui décident si le gate crie ou se tait. Tant qu'elles
//    vivaient dans le fichier du gate, Stryker ne les mutait pas — une comparaison inversée serait restée
//    verte pour toujours. Ici chaque règle est éprouvée sur ses BORNES et ses entrées ADVERSES.
// ⚠️ HERMÉTIQUE : zéro fs, zéro réseau, zéro SSH.
import { describe, test, expect } from "vitest";
import {
  EXACT_VERSION, estEpingleExact, fautesEpinglage, depsNonClassees, entreesFantomes,
} from "../lib/deps-criticite-pure.js";

const d = (nom, plage, ou = ".") => ({ nom, plage, ou });

describe("deps-criticite-pure", () => {
  test("estEpingleExact : ACCEPTE les formes qui désignent UNE version (dont pré-release et build)", () => {
    for (const v of ["1.2.3", "0.0.0", "10.20.30", "1.5.4-r.1", "2.0.0-beta.7", "1.2.3+sha.abc", "1.2.3-rc.1+b2"]) {
      expect(estEpingleExact(v), `"${v}" est EXACT et a été rejeté — faux positif, le gate finira désactivé`).toBe(true);
    }
  });

  test("estEpingleExact : REFUSE tout ce qui laisse npm choisir (le cœur du gate)", () => {
    for (const v of ["^1.2.3", "~1.2.3", "1.2.x", "1.x", "*", "", "latest", ">=1.2.3", "<2.0.0", "1.2.3 || 2.0.0",
      "1.2", "1", "1.2.3.4", " 1.2.3", "1.2.3 ", "v1.2.3", "1.2.3-", "=1.2.3"]) {
      expect(estEpingleExact(v), `"${v}" a été pris pour une version EXACTE — une dérive passerait`).toBe(false);
    }
  });

  test("estEpingleExact : entrées NON-STRING ⇒ false, jamais une exception (fail-closed)", () => {
    // ⚠️ Un package.json malformé ne doit pas faire CRASHER le gate : il doit le faire ROUGIR.
    for (const v of [null, undefined, 123, {}, [], true, NaN]) expect(estEpingleExact(v)).toBe(false);
  });

  test("estEpingleExact : ADVERSE — un TABLEAU contenant une version ne passe PAS (coercition JS)", () => {
    // ⚠️ PIÈGE PROUVÉ PAR STRYKER : `/regex/.test(x)` convertit son argument en chaîne, donc
    //    `EXACT_VERSION.test(['1.2.3'])` vaut **true**. La garde `typeof` est ce qui bloque ça.
    expect(EXACT_VERSION.test(["1.2.3"]), "prémisse : la regex seule se laisse berner").toBe(true);
    expect(estEpingleExact(["1.2.3"]), "la garde typeof a sauté : un tableau passe pour exact").toBe(false);
    expect(estEpingleExact(new String("1.2.3"))).toBe(false);
  });

  test("EXACT_VERSION est ANCRÉE des deux côtés (sinon « pas-1.2.3-du-tout » passerait)", () => {
    expect(EXACT_VERSION.source.startsWith("^")).toBe(true);
    expect(EXACT_VERSION.source.endsWith("$")).toBe(true);
    expect(estEpingleExact("prefixe1.2.3")).toBe(false);
    expect(estEpingleExact("1.2.3suffixe!")).toBe(false);
  });

  test("fautesEpinglage : ne signale QUE les moteurs mal épinglés", () => {
    const deps = [d("moteur-x", "^1.0.0"), d("vitest", "^3.0.0"), d("autre", "2.0.0")];
    const f = fautesEpinglage(deps, { "moteur-x": "raison", autre: "raison" });
    expect(f.map((x) => x.nom)).toEqual(["moteur-x"]);
  });

  test("fautesEpinglage : la MÊME dépendance dans 2 package.json produit 2 fautes", () => {
    const f = fautesEpinglage([d("m", "^1.0.0", "."), d("m", "^1.0.0", "sous-paquet")], { m: "r" });
    expect(f.length).toBe(2);
    expect(f.map((x) => x.ou)).toEqual([".", "sous-paquet"]);
  });

  test("fautesEpinglage : ADVERSE — une clé héritée du prototype n'est PAS un moteur", () => {
    // ⚠️ Sans `hasOwnProperty`, `moteurs['toString']` serait « vrai » (hérité d'Object).
    for (const nom of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      expect(fautesEpinglage([d(nom, "^1.0.0")], {}), `"${nom}" pris pour un moteur classé`).toEqual([]);
    }
  });

  test("fautesEpinglage : entrées vides/absurdes ⇒ [] sans throw", () => {
    expect(fautesEpinglage([], {})).toEqual([]);
    expect(fautesEpinglage(null, { m: "r" })).toEqual([]);
    expect(fautesEpinglage([d("m", "^1.0.0")], null)).toEqual([]);
    expect(fautesEpinglage([null, undefined, d("m", "1.0.0")], { m: "r" })).toEqual([]);
  });

  test("depsNonClassees : signale l'inconnue UNE SEULE FOIS même déclarée plusieurs fois", () => {
    const deps = [d("connue", "^1.0.0"), d("inconnue", "^2.0.0", "a"), d("inconnue", "^2.0.0", "b")];
    expect(depsNonClassees(deps, {}, { connue: "r" }).map((x) => x.nom)).toEqual(["inconnue"]);
  });

  test("depsNonClassees : les DEUX classes valent classement ; aucune ⇒ ROUGE", () => {
    expect(depsNonClassees([d("m", "1.0.0")], { m: "r" }, {})).toEqual([]);
    expect(depsNonClassees([d("o", "^1.0.0")], {}, { o: "r" })).toEqual([]);
    expect(depsNonClassees([d("x", "^1.0.0")], {}, {}).length).toBe(1);
  });

  test("depsNonClassees : le repli sur liste VIDE ne fabrique AUCUNE entrée fantôme", () => {
    // ⚠️ Un gate qui invente une dépendance inexistante crierait sur du néant et serait désactivé.
    const r = depsNonClassees(undefined, {}, {});
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBe(0);
    expect(depsNonClassees("pas-un-tableau", {}, {})).toEqual([]);
    expect(depsNonClassees([null], {}, {})).toEqual([]);
  });

  test("entreesFantomes : détecte une classification que plus personne n'installe", () => {
    expect(entreesFantomes([d("vivante", "1.0.0")], { vivante: "r" }, { morte: "r" })).toEqual(["morte"]);
    expect(entreesFantomes([d("vivante", "1.0.0")], { vivante: "r" }, {})).toEqual([]);
    expect(entreesFantomes([], {}, {})).toEqual([]);
    expect(entreesFantomes(null, { a: "r" }, null)).toEqual(["a"]);
  });
});
