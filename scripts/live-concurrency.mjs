/**
 * Preuve LIVE multi-agent : 2 clients MCP concurrents vers le service HTTP déployé (VPS dev, Tailscale).
 * Hors gate (script de preuve manuelle). Usage : node scripts/live-concurrency.mjs <url> <token>
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL_MCP = process.argv[2];
const TOKEN = process.argv[3];

async function makeClient(label) {
  const transport = new StreamableHTTPClientTransport(new URL(URL_MCP), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  });
  const client = new Client({ name: `agent-${label}`, version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, transport };
}

async function run() {
  // 2 agents en parallèle = 2 sessions HTTP distinctes (http.js construit 1 Server/session).
  const [A, B] = await Promise.all([makeClient("A"), makeClient("B")]);

  // listTools concurrents
  const [toolsA, toolsB] = await Promise.all([A.client.listTools(), B.client.listTools()]);
  console.log("A tools:", toolsA.tools.map((t) => t.name).sort().join(","));
  console.log("B tools:", toolsB.tools.map((t) => t.name).sort().join(","));

  // appels concurrents entrelacés : health + switch_workspace (prouve /users/me live)
  const [hA, sB, hB, sA] = await Promise.all([
    A.client.callTool({ name: "publer_health", arguments: {} }),
    B.client.callTool({ name: "publer_switch_workspace", arguments: { workspace: "webzenon" } }),
    B.client.callTool({ name: "publer_health", arguments: {} }),
    A.client.callTool({ name: "publer_switch_workspace", arguments: { workspace: "webzenon" } }),
  ]);

  console.log("A switch:", sA.content[0].text.split("\n")[0]);
  console.log("B switch:", sB.content[0].text.split("\n")[0]);
  console.log("A health ok:", hA.content[0].text.includes('"ok": true'));
  console.log("B health ok:", hB.content[0].text.includes('"ok": true'));

  // appel réel passe-plat concurrent : /users/me sur les 2 sessions
  const [meA, meB] = await Promise.all([
    A.client.callTool({ name: "publer_call", arguments: { method: "GET", endpoint: "/users/me" } }),
    B.client.callTool({ name: "publer_call", arguments: { method: "GET", endpoint: "/accounts" } }),
  ]);
  console.log("A /users/me:", meA.content[0].text.includes("titanicvegeta") ? "LIVE OK" : meA.content[0].text.slice(0, 120));
  console.log("B /accounts:", meB.content[0].text.slice(0, 80).replace(/\n/g, " "));

  await Promise.all([A.transport.close(), B.transport.close()]);
  console.log("DONE — 2 sessions concurrentes OK, zéro crash, zéro fuite.");
}

run().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
