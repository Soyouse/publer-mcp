/**
 * Construction du Server MCP — PARTAGÉE entre les transports stdio et HTTP.
 *
 * ⚠️ La logique outils vit dans dispatch.js (testable sans transport). Ici = seulement le
 *    câblage des 2 request handlers MCP. Tout nouveau transport réutilise buildServer().
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { handleTool, listTools } from "../dispatch.js";

export function buildServer() {
  const server = new Server(
    { name: "publer-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // ⚠️ État de session PAR INSTANCE de Server. http.js appelle buildServer() une fois PAR session
  //    (server.js une fois pour le stdio) → ce holder est isolé entre sessions concurrentes.
  //    NE JAMAIS remonter ce `workspace` dans un module global (= fuite inter-sessions, bug multi-agents).
  const session = { workspace: null };

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = await listTools();
    return {
      tools: tools.map((t) => ({
        ...t,
        inputSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          ...t.inputSchema,
          additionalProperties: false,
        },
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      const result = await handleTool(name, args || {}, session);
      return { content: [{ type: "text", text: String(result) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  });

  return server;
}
