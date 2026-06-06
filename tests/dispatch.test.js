import { describe, it, expect, beforeEach, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// env secrets AVANT l'import (dispatch → registry → handlers → client lit SECRETS_PATH à l'éval).
const here = dirname(fileURLToPath(import.meta.url));
process.env.PUBLER_SECRETS_PATH = join(here, "fixtures", "secrets.test.json");

const { handleTool, listTools } = await import("../dispatch.js");
const { _resetClient } = await import("../lib/core/client.js");
const { snapshot, _reset } = await import("../lib/rate-monitor.js");

describe("dispatch", () => {
  beforeEach(() => {
    _resetClient();
    _reset();
    vi.unstubAllGlobals();
  });

  it("listTools expose les 4 outils avec leur métadonnée", async () => {
    const tools = await listTools();
    expect(tools).toHaveLength(4);
    for (const t of tools) {
      expect(t.name).toBeTypeOf("string");
      expect(t.description).toBeTypeOf("string");
      expect(t.inputSchema).toBeTypeOf("object");
    }
  });

  it("outil inconnu → throw", async () => {
    await expect(handleTool("nope", {})).rejects.toThrow(/Outil inconnu/);
  });

  it("session threadée par appel : 2 sessions ne partagent PAS leur workspace", async () => {
    const a = await handleTool("publer_health", {}, { workspace: "ws2" });
    const b = await handleTool("publer_health", {}, { workspace: "ws1" });
    expect(a).toContain('"sessionWorkspace": "ws2"');
    expect(b).toContain('"sessionWorkspace": "ws1"');
  });

  it("incidents scopés : une erreur d'outil remonte avec le contexte d'incidents", async () => {
    await expect(handleTool("publer_call", { method: "BOGUS", endpoint: "/x" })).rejects.toThrow(
      /Incidents \(1\)/
    );
  });

  it("appel réussi : le résultat est suffixé du bilan d'incidents (aucun)", async () => {
    const out = await handleTool("publer_health", {}, {});
    expect(out).toContain("✅ Aucun incident.");
  });

  it("middleware monitor : une réponse invalide (429) est comptée par workspace", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, text: async () => "{}" })));
    await expect(
      handleTool("publer_call", { method: "GET", endpoint: "/x", workspace: "ws1" })
    ).rejects.toThrow();
    expect(snapshot().invalidTotal).toBe(1);
    expect(snapshot().perWorkspace.ws1).toBe(1);
  });
});
