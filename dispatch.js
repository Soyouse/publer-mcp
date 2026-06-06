/**
 * Dispatch central — registry auto + contexte SCOPÉ + chaîne middleware composable.
 *
 * ⚠️ server.js / http.js délèguent ici (logique testable sans démarrer le transport).
 *   1. Registry auto-découvert (pas de HANDLER_MAP manuel)
 *   2. Contexte incidents scopé par appel (multi-user safe)
 *   3. Couture middleware : auth / rate-log / metrics se branchent ici SANS toucher les handlers
 */
import { loadRegistry } from "./lib/registry.js";
import { createIncidentContext } from "./incidents.js";
import { recordResult } from "./lib/rate-monitor.js";

// Middleware : compte les réponses invalides (401/403/429) par workspace → observabilité quota/auth.
// N'altère RIEN du flux : observe sur throw, ré-émet l'erreur telle quelle.
export function monitorInvalidResponses(next) {
  return async (args, ctx) => {
    try {
      return await next(args, ctx);
    } catch (e) {
      if (typeof e?.status === "number") recordResult(args?.workspace, e.status);
      throw e;
    }
  };
}

// Chaîne middleware composable. Chaque middleware : (next) => async (args, ctx) => result.
const MIDDLEWARE = [monitorInvalidResponses];

function compose(handle) {
  return MIDDLEWARE.reduceRight((next, mw) => mw(next), handle);
}

export async function handleTool(name, args, session = {}) {
  const registry = await loadRegistry();
  const tool = registry.get(name);
  if (!tool) throw new Error(`Outil inconnu : ${name}`);

  // ⚠️ incidents = scopé PAR APPEL. session = scopé PAR SESSION (créé dans build-server, partagé
  //    entre les appels d'UNE session, jamais entre sessions) → workspace par-session, zéro fuite.
  const ctx = { incidents: createIncidentContext(), session };
  const run = compose(tool.handle);
  try {
    const result = await run(args ?? {}, ctx);
    return `${result}\n\n${ctx.incidents.format()}`;
  } catch (e) {
    e.message = `${e.message}\n\n${ctx.incidents.format()}`;
    throw e;
  }
}

export async function listTools() {
  const registry = await loadRegistry();
  return [...registry.values()].map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}
