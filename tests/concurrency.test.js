/**
 * Concurrence / hyperscaling — PREUVE que N agents simultanés ne se mélangent JAMAIS.
 *
 * ⚠️ Invariant central : l'état « workspace actif » est PAR-SESSION (holder passé à handleTool),
 *    les incidents sont PAR-APPEL. Deux sessions concurrentes (= 2 agents IA) ne doivent partager
 *    NI leur workspace NI leurs incidents. C'est ça qui rend le MCP multi-agent safe.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
process.env.PUBLER_SECRETS_PATH = join(here, "fixtures", "secrets.test.json");

const { handleTool } = await import("../dispatch.js");
const { _resetClient } = await import("../lib/core/client.js");
const { _reset } = await import("../lib/rate-monitor.js");

beforeEach(() => {
  _resetClient();
  _reset();
  vi.unstubAllGlobals();
});

describe("isolation multi-agent (concurrence)", () => {
  it("2 sessions basculent sur des workspaces différents EN PARALLÈLE sans se polluer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ email: "a@b.c" }) }))
    );
    // chaque agent = SON propre holder de session (comme build-server.js en crée 1/session).
    const agentA = { workspace: null };
    const agentB = { workspace: null };

    await Promise.all([
      handleTool("publer_switch_workspace", { workspace: "ws1" }, agentA),
      handleTool("publer_switch_workspace", { workspace: "ws2" }, agentB),
    ]);

    expect(agentA.workspace).toBe("ws1");
    expect(agentB.workspace).toBe("ws2");
  });

  it("50 appels concurrents de sessions distinctes : chacun voit SON workspace", async () => {
    const sessions = Array.from({ length: 50 }, (_, i) => ({
      workspace: i % 2 === 0 ? "ws1" : "ws2",
    }));

    const results = await Promise.all(
      sessions.map((s) => handleTool("publer_health", {}, s))
    );

    results.forEach((out, i) => {
      const expected = i % 2 === 0 ? "ws1" : "ws2";
      expect(out).toContain(`"sessionWorkspace": "${expected}"`);
    });
  });

  it("un incident dans une session NE FUIT PAS dans une session concurrente", async () => {
    // session erreur : méthode invalide → incident scopé. session OK : health sans incident.
    const [errResult, okResult] = await Promise.allSettled([
      handleTool("publer_call", { method: "BOGUS", endpoint: "/x" }, { workspace: "ws1" }),
      handleTool("publer_health", {}, { workspace: "ws2" }),
    ]);

    expect(errResult.status).toBe("rejected");
    expect(errResult.reason.message).toMatch(/Incidents \(1\)/);
    expect(okResult.status).toBe("fulfilled");
    expect(okResult.value).toContain("✅ Aucun incident."); // zéro fuite de l'incident voisin
  });
});
