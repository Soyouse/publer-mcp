import { describe, it, expect, beforeEach, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ⚠️ SECRETS_PATH est lu à l'évaluation du module client.js → définir l'env AVANT l'import dynamique.
const here = dirname(fileURLToPath(import.meta.url));
process.env.PUBLER_SECRETS_PATH = join(here, "fixtures", "secrets.test.json");

const {
  normalizeSecrets,
  resolveWorkspaceId,
  buildRequest,
  publerCall,
  listWorkspaces,
  _resetClient,
} = await import("../lib/core/client.js");

describe("client / normalizeSecrets", () => {
  it("schéma multi-workspace : conserve les workspaces + choisit le default", () => {
    const out = normalizeSecrets({
      default: "b",
      workspaces: { a: { api_key: "k1", workspace_id: "w1" }, b: { api_key: "k2", workspace_id: "w2" } },
    });
    expect(out.defaultWorkspace).toBe("b");
    expect(Object.keys(out.workspaces)).toEqual(["a", "b"]);
  });

  it("default implicite = premier workspace si non fourni", () => {
    const out = normalizeSecrets({
      workspaces: { a: { api_key: "k1", workspace_id: "w1" } },
    });
    expect(out.defaultWorkspace).toBe("a");
  });

  it("legacy mono { api_key, workspace_id } → workspace 'default'", () => {
    const out = normalizeSecrets({ api_key: "k", workspace_id: "w" });
    expect(out.defaultWorkspace).toBe("default");
    expect(out.workspaces.default).toEqual({ api_key: "k", workspace_id: "w" });
  });

  it("throw si workspaces vide", () => {
    expect(() => normalizeSecrets({ workspaces: {} })).toThrow(/vide/);
  });

  it("throw si api_key manquante", () => {
    expect(() => normalizeSecrets({ workspaces: { a: { workspace_id: "w" } } })).toThrow(/api_key/);
  });

  it("throw si workspace_id manquant", () => {
    expect(() => normalizeSecrets({ workspaces: { a: { api_key: "k" } } })).toThrow(/workspace_id/);
  });

  it("throw si default absent des workspaces", () => {
    expect(() =>
      normalizeSecrets({ default: "x", workspaces: { a: { api_key: "k", workspace_id: "w" } } })
    ).toThrow(/default/);
  });

  it("throw sur format invalide", () => {
    expect(() => normalizeSecrets({})).toThrow(/format invalide/);
    expect(() => normalizeSecrets(null)).toThrow(/format invalide/);
  });
});

describe("client / resolveWorkspaceId", () => {
  beforeEach(() => _resetClient());

  it("undefined → workspace par défaut (après chargement)", async () => {
    await listWorkspaces(); // charge le fixture
    expect(resolveWorkspaceId(undefined)).toBe("ws1");
  });

  it("explicite → ce workspace", async () => {
    await listWorkspaces();
    expect(resolveWorkspaceId("ws2")).toBe("ws2");
  });

  it("inconnu → throw", async () => {
    await listWorkspaces();
    expect(() => resolveWorkspaceId("nope")).toThrow(/inconnu/);
  });
});

describe("client / buildRequest (pur)", () => {
  it("GET : pas de body, headers d'auth Publer corrects", () => {
    const { url, options } = buildRequest("GET", "/users/me", undefined, "KEY1", "WID1");
    expect(url.endsWith("/users/me")).toBe(true);
    expect(options.method).toBe("GET");
    expect(options.headers.Authorization).toBe("Bearer-API KEY1");
    expect(options.headers["Publer-Workspace-Id"]).toBe("WID1");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.body).toBeUndefined();
  });

  it("POST avec payload : body = JSON sérialisé", () => {
    const { options } = buildRequest("POST", "/posts", { text: "hi" }, "KEY1", "WID1");
    expect(options.body).toBe(JSON.stringify({ text: "hi" }));
  });

  it("POST sans payload : pas de body", () => {
    const { options } = buildRequest("POST", "/posts", null, "KEY1", "WID1");
    expect(options.body).toBeUndefined();
  });

  it("PUT avec payload : body sérialisé", () => {
    const { options } = buildRequest("PUT", "/posts/1", { a: 1 }, "KEY1", "WID1");
    expect(options.method).toBe("PUT");
    expect(options.body).toBe(JSON.stringify({ a: 1 }));
  });

  it("GET avec payload : JAMAIS de body (verb GET exclu)", () => {
    const { options } = buildRequest("GET", "/posts", { a: 1 }, "KEY1", "WID1");
    expect(options.body).toBeUndefined();
  });
});

describe("client / publerCall", () => {
  beforeEach(() => {
    _resetClient();
    vi.unstubAllGlobals();
  });

  it("méthode non supportée → throw AVANT tout réseau (offline)", async () => {
    await expect(publerCall("BOGUS", "/x")).rejects.toThrow(/Méthode non supportée/);
  });

  it("GET ok : appelle fetch avec url + headers du workspace par défaut, renvoie le JSON parsé", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ email: "x@y.z" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await publerCall("GET", "/users/me");
    expect(res).toEqual({ email: "x@y.z" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.endsWith("/users/me")).toBe(true);
    expect(options.headers.Authorization).toBe("Bearer-API KEY1");
    expect(options.headers["Publer-Workspace-Id"]).toBe("WID1");
  });

  it("workspace explicite → utilise SA clé + son id", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => "{}" }));
    vi.stubGlobal("fetch", fetchMock);

    await publerCall("GET", "/accounts", undefined, { workspace: "ws2" });
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer-API KEY2");
    expect(options.headers["Publer-Workspace-Id"]).toBe("WID2");
  });

  it("réponse non-ok → throw avec .status", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "unauthorized" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(publerCall("GET", "/users/me")).rejects.toMatchObject({ status: 401 });
  });

  it("endpoint sans slash initial : normalisé (slash ajouté)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => "{}" }));
    vi.stubGlobal("fetch", fetchMock);
    await publerCall("GET", "users/me");
    expect(fetchMock.mock.calls[0][0].endsWith("/users/me")).toBe(true);
  });

  it("endpoint avec slash initial : inchangé (pas de double slash)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => "{}" }));
    vi.stubGlobal("fetch", fetchMock);
    await publerCall("GET", "/users/me");
    expect(fetchMock.mock.calls[0][0].endsWith("/api/v1/users/me")).toBe(true);
  });
});
