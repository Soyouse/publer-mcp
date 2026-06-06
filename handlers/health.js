/**
 * Outil `publer_health` — observabilité du service (healthcheck + drapeau orange quota).
 *
 * ⚠️ Zéro réseau : renvoie les workspaces configurés + la fenêtre glissante des réponses invalides
 *    (401/403/429) par workspace. `warn:true` = trop d'invalides (throttle/quota/auth) sur 1 min.
 */
import { listWorkspaces } from "../lib/core/client.js";
import { snapshot } from "../lib/rate-monitor.js";

// Stryker disable all : métadonnée déclarative (description/schema) — aucun contrat comportemental.
export const tool = {
  name: "publer_health",
  description:
    "État du service : workspaces configurés, workspace actif, et compteur glissant des réponses " +
    "invalides (401/403/429) par workspace. warn=true signale un risque quota/auth.",
  inputSchema: { type: "object", properties: {} },
  // Stryker restore all
  async handle(args, ctx) {
    const workspaces = await listWorkspaces();
    // workspace actif = celui de CETTE session (par-session, pas un global partagé).
    const sessionWorkspace = ctx?.session?.workspace ?? null;
    return JSON.stringify(
      { ok: true, workspaces, sessionWorkspace, rateLimit: snapshot() },
      null,
      2
    );
  },
};
