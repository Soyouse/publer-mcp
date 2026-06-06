import { describe, it, expect } from "vitest";
import { createIncidentContext } from "../incidents.js";

describe("incidents (scopé par appel)", () => {
  it("contexte vide : count 0, format = aucun incident", () => {
    const c = createIncidentContext();
    expect(c.count).toBe(0);
    expect(c.list()).toEqual([]);
    expect(c.format()).toBe("✅ Aucun incident.");
  });

  it("add enregistre level/message/meta/ts", () => {
    const c = createIncidentContext();
    c.add("error", "boom", { status: 500 });
    const [i] = c.list();
    expect(i.level).toBe("error");
    expect(i.message).toBe("boom");
    expect(i.meta).toEqual({ status: 500 });
    expect(typeof i.ts).toBe("string");
  });

  it("meta par défaut = null si omis", () => {
    const c = createIncidentContext();
    c.add("warn", "x");
    expect(c.list()[0].meta).toBe(null);
  });

  it("count suit le nombre d'incidents", () => {
    const c = createIncidentContext();
    c.add("warn", "a");
    c.add("warn", "b");
    expect(c.count).toBe(2);
  });

  it("list() renvoie une COPIE (pas la référence interne)", () => {
    const c = createIncidentContext();
    c.add("warn", "a");
    const snap = c.list();
    snap.push("intrus");
    expect(c.count).toBe(1); // l'interne n'a pas bougé
  });

  it("format : en-tête compté + 1 ligne par incident séparées par newline", () => {
    const c = createIncidentContext();
    c.add("error", "a");
    c.add("warn", "b");
    expect(c.format()).toBe("⚠️ Incidents (2) :\n- [error] a\n- [warn] b");
  });
});
