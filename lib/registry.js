/**
 * Registry — AUTO-ENREGISTREMENT des handlers.
 *
 * ⚠️ AUCUN HANDLER_MAP manuel. Déposer un fichier dans handlers/ qui exporte
 * `tool = {name, description, inputSchema, handle}` suffit. Impossible d'oublier.
 * Convention > configuration. Dupliqué = throw.
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const handlersDir = join(here, "..", "handlers");

let cache = null;

export async function loadRegistry() {
  if (cache) return cache;
  const files = (await readdir(handlersDir)).filter((f) => f.endsWith(".js"));
  const registry = new Map();
  for (const f of files) {
    const mod = await import(new URL(`../handlers/${f}`, import.meta.url));
    const tool = mod.tool;
    if (!tool?.name || typeof tool.handle !== "function") continue;
    if (registry.has(tool.name)) throw new Error(`Outil dupliqué : ${tool.name}`);
    registry.set(tool.name, tool);
  }
  return (cache = registry);
}
