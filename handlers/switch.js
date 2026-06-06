/**
 * Outil `publer_switch_workspace` — multiplexeur multi-workspace (façon discord_switch_bot).
 *
 * ⚠️ Sans `workspace` : liste les profils disponibles + le workspace actif de CETTE session (ne change rien).
 * ⚠️ Avec `workspace` : vérifie par GET /users/me (clé valide) PUIS, sur succès, pose le défaut de
 *    SESSION (ctx.session.workspace) → renvoie le compte réel (anti-hallucination : on prouve, on ne suppose pas).
 * ⚠️ État de session PAR-SESSION (ctx.session) — JAMAIS global : sinon il fuit entre agents HTTP concurrents.
 */
import { listWorkspaces, assertWorkspace, publerCall } from "../lib/core/client.js";

// Stryker disable all : métadonnée déclarative (description/schema) — aucun contrat comportemental.
export const tool = {
  name: "publer_switch_workspace",
  description:
    "Sélectionne le workspace actif (profil client) pour les appels suivants. Sans argument : liste " +
    "les workspaces disponibles. Avec {workspace} : bascule + confirme la clé (GET /users/me).",
  inputSchema: {
    type: "object",
    properties: {
      workspace: { type: "string", description: "Id du profil workspace à activer (ex: webzenon)" },
    },
  },
  // Stryker restore all
  async handle(args, ctx) {
    const { workspace } = args;
    if (!workspace) {
      const state = await listWorkspaces();
      return JSON.stringify(
        { workspaces: state.workspaces, default: state.default, session: ctx.session?.workspace ?? null },
        null,
        2
      );
    }
    await assertWorkspace(workspace); // existe ? (throw AVANT réseau si inconnu)
    try {
      const me = await publerCall("GET", "/users/me", undefined, { workspace });
      // Clé PROUVÉE → on committe le workspace SUR LA SESSION (jamais sur un global).
      if (ctx.session) ctx.session.workspace = workspace;
      return `Workspace actif : « ${workspace} » (compte ${me?.email ?? me?.name ?? "?"}, plan ${me?.plan ?? "?"})`;
    } catch (e) {
      // clé non vérifiable → on NE committe PAS le switch → incident, on remonte
      ctx.incidents.add("warn", `switch ${workspace} : /users/me a échoué → ${e.message}`, {
        status: e.status ?? null,
      });
      throw e;
    }
  },
};
