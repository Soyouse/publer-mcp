import { describe, it, expect } from "vitest";
import { loadRegistry } from "../lib/registry.js";

describe("registry (auto-découverte)", () => {
  it("découvre les 4 outils, chacun avec name + handle", async () => {
    const reg = await loadRegistry();
    const names = [...reg.keys()].sort();
    expect(names).toEqual(
      ["publer_call", "publer_discover", "publer_health", "publer_switch_workspace"].sort()
    );
    for (const tool of reg.values()) {
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.handle).toBe("function");
      expect(tool.inputSchema).toBeTypeOf("object");
    }
  });

  it("met en cache : 2 appels renvoient la MÊME instance de Map", async () => {
    const a = await loadRegistry();
    const b = await loadRegistry();
    expect(a).toBe(b);
  });
});
