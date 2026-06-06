/**
 * Outil `publer_call` — passe-plat brut. Couverture API Publer 100 %.
 *
 * ⚠️ Aucun endpoint n'est "wrappé" → rien à oublier, rien ne plafonne.
 * Le throttle 50 req/min (p-throttle) est géré par client.js sous le capot.
 */
import { publerCall } from "../lib/core/client.js";

// Stryker disable all : métadonnée déclarative (description/schema) — aucun contrat comportemental.
export const tool = {
  name: "publer_call",
  description:
    "Appel brut à n'importe quel endpoint de l'API REST Publer (v1). Couverture 100 %. " +
    "Utiliser publer_discover pour le catalogue des endpoints. Le workspace actif (publer_switch_workspace) " +
    "est appliqué automatiquement via l'en-tête Publer-Workspace-Id.",
  inputSchema: {
    type: "object",
    properties: {
      method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
      endpoint: { type: "string", description: "Chemin API, ex: /posts ou /users/me" },
      payload: { type: "object", description: "Corps JSON optionnel (POST/PATCH/PUT)" },
      workspace: {
        type: "string",
        description:
          "Workspace à utiliser (id du profil). Optionnel : défaut = workspace de session (publer_switch_workspace) puis défaut secrets.",
      },
    },
    required: ["method", "endpoint"],
  },
  // Stryker restore all
  async handle(args, ctx) {
    const { method, endpoint, payload, workspace } = args;
    // Précédence : `workspace` explicite de l'appel > workspace de session > défaut secrets.
    const effectiveWorkspace = workspace ?? ctx.session?.workspace ?? undefined;
    try {
      const res = await publerCall(method, endpoint, payload, { workspace: effectiveWorkspace });
      return JSON.stringify(res ?? { ok: true }, null, 2);
    } catch (e) {
      ctx.incidents.add("error", `${method} ${endpoint} → ${e.message}`, {
        status: e.status ?? null,
      });
      throw e;
    }
  },
};
