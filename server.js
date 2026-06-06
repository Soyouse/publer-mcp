/**
 * Publer MCP — bootstrap transport stdio (DÉFAUT, usage local).
 *
 * ⚠️ Transport seul — la construction du Server est dans lib/build-server.js (partagée avec http.js),
 *    la logique outils dans dispatch.js. Les outils sont AUTO-DÉCOUVERTS depuis handlers/*.js.
 * ⚠️ Pour le service 24/7 distant → http.js (StreamableHTTP, bind 127.0.0.1 + Bearer + tunnel).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./lib/build-server.js";

async function main() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  process.stderr.write(`Publer MCP fatal: ${e.message}\n`);
  process.exit(1);
});
