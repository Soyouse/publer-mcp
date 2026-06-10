import { describe, it, expect, beforeEach, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// env secrets AVANT l'import (les handlers importent client.js qui lit SECRETS_PATH à l'éval).
const here = dirname(fileURLToPath(import.meta.url));
process.env.PUBLER_SECRETS_PATH = join(here, "fixtures", "secrets.test.json");

const { tool: discover } = await import("../handlers/discover.js");
const { tool: health } = await import("../handlers/health.js");
const { tool: switchWs } = await import("../handlers/switch.js");
const { tool: call } = await import("../handlers/call.js");
const { _resetClient } = await import("../lib/core/client.js");
const { createIncidentContext } = await import("../incidents.js");

function ctx(session = {}) {
  return { incidents: createIncidentContext(), session };
}

beforeEach(() => {
  _resetClient();
  vi.unstubAllGlobals();
});

describe("publer_discover", () => {
  it("sans catégorie : résumé des catégories, sans la clé méta _note", async () => {
    const out = JSON.parse(await discover.handle({}));
    expect(out.categories.users).toMatch(/endpoints/);
    expect(out.categories.posts).toMatch(/endpoints/);
    expect(out.categories._note).toBeUndefined();
  });

  it("avec catégorie connue : détail des endpoints", async () => {
    const out = JSON.parse(await discover.handle({ category: "posts" }));
    expect(Array.isArray(out.posts)).toBe(true);
    expect(out.posts[0]).toHaveProperty("path");
  });

  it("catégorie inconnue : message d'aide", async () => {
    const out = await discover.handle({ category: "zzz" });
    expect(out).toMatch(/Catégorie inconnue/);
  });

  it("AUTO-ENSEIGNANT : tout endpoint d'écriture (POST/PUT/PATCH) du catalogue a params OU example", async () => {
    // contrat : un agent doit pouvoir se servir seul → les écritures portent leur recette.
    const cat = JSON.parse(await discover.handle({ category: "posts" }));
    const writes = cat.posts.filter((e) => ["POST", "PUT", "PATCH"].includes(e.method));
    expect(writes.length).toBeGreaterThan(0);
    for (const e of writes) {
      expect(Boolean(e.params) || Boolean(e.example)).toBe(true);
    }
  });
});

describe("publer_health", () => {
  it("renvoie ok, workspaces configurés, workspace de session, snapshot rate", async () => {
    const out = JSON.parse(await health.handle({}, ctx({ workspace: "ws2" })));
    expect(out.ok).toBe(true);
    expect(out.workspaces.workspaces.sort()).toEqual(["ws1", "ws2"]);
    expect(out.workspaces.default).toBe("ws1");
    expect(out.sessionWorkspace).toBe("ws2");
    expect(out.rateLimit).toHaveProperty("invalidTotal");
    expect(out.rateLimit.warn).toBe(false);
  });

  it("workspace de session null par défaut", async () => {
    const out = JSON.parse(await health.handle({}, ctx()));
    expect(out.sessionWorkspace).toBe(null);
  });
});

describe("publer_switch_workspace", () => {
  it("sans argument : liste les workspaces + session courante", async () => {
    const out = JSON.parse(await switchWs.handle({}, ctx()));
    expect(out.workspaces.sort()).toEqual(["ws1", "ws2"]);
    expect(out.default).toBe("ws1");
    expect(out.session).toBe(null);
  });

  it("avec workspace + clé prouvée (GET /users/me ok) : committe la session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ email: "x@y.z", plan: "business" }),
      }))
    );
    const c = ctx();
    const msg = await switchWs.handle({ workspace: "ws2" }, c);
    expect(msg).toContain("Workspace actif : « ws2 »");
    expect(msg).toContain("x@y.z");
    expect(msg).toContain("business");
    expect(c.session.workspace).toBe("ws2"); // committé APRÈS preuve
  });

  it("avec workspace mais clé non vérifiable (401) : NE committe PAS + incident", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, text: async () => "{}" }))
    );
    const c = ctx();
    await expect(switchWs.handle({ workspace: "ws2" }, c)).rejects.toThrow();
    expect(c.session.workspace).toBeUndefined(); // pas de bascule
    expect(c.incidents.count).toBe(1);
  });

  it("workspace inconnu : throw avant tout réseau", async () => {
    await expect(switchWs.handle({ workspace: "ghost" }, ctx())).rejects.toThrow(/inconnu/);
  });
});

describe("publer_call", () => {
  it("succès : renvoie le JSON de la réponse (stringifié)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ id: 7 }) }))
    );
    const out = await call.handle({ method: "GET", endpoint: "/posts/7" }, ctx());
    expect(JSON.parse(out)).toEqual({ id: 7 });
  });

  it("réponse vide (null) : renvoie { ok: true }", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => "" })));
    const out = await call.handle({ method: "DELETE", endpoint: "/posts/7" }, ctx());
    expect(JSON.parse(out)).toEqual({ ok: true });
  });

  it("précédence : workspace explicite de l'appel > workspace de session", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => "{}" }));
    vi.stubGlobal("fetch", fetchMock);
    await call.handle({ method: "GET", endpoint: "/x", workspace: "ws2" }, ctx({ workspace: "ws1" }));
    expect(fetchMock.mock.calls[0][1].headers["Publer-Workspace-Id"]).toBe("WID2");
  });

  it("sans workspace d'appel : retombe sur le workspace de session", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => "{}" }));
    vi.stubGlobal("fetch", fetchMock);
    await call.handle({ method: "GET", endpoint: "/x" }, ctx({ workspace: "ws2" }));
    expect(fetchMock.mock.calls[0][1].headers["Publer-Workspace-Id"]).toBe("WID2");
  });

  it("file fourni : passé jusqu'à fetch en MULTIPART (FormData), sans Content-Type", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ id: "m1" }) }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await call.handle(
      { method: "POST", endpoint: "/media", file: { name: "c.png", data: Buffer.from("x").toString("base64"), type: "image/png" } },
      ctx()
    );
    expect(JSON.parse(out)).toEqual({ id: "m1" });
    const [, options] = fetchMock.mock.calls[0];
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.headers["Content-Type"]).toBeUndefined();
  });

  it("erreur réseau : ajoute un incident détaillé (method+endpoint) puis rethrow", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, text: async () => "{}" }))
    );
    const c = ctx();
    await expect(call.handle({ method: "POST", endpoint: "/posts" }, c)).rejects.toThrow();
    expect(c.incidents.count).toBe(1);
    expect(c.incidents.list()[0].message).toMatch(/POST \/posts/);
    expect(c.incidents.list()[0].meta).toEqual({ status: 500 });
  });
});
