/**
 * Publer MCP — transport HTTP (StreamableHTTP) pour le service 24/7 distant.
 *
 * ⚠️ SÉCURITÉ (non négociable) :
 *   - BIND 127.0.0.1 par défaut, JAMAIS 0.0.0.0 (« localhost n'est pas une frontière de sécurité »).
 *   - Accès distant = via TUNNEL Tailscale uniquement, jamais d'exposition publique.
 *   - Auth Bearer OBLIGATOIRE : le serveur REFUSE de démarrer sans PUBLER_MCP_HTTP_TOKEN.
 *   - Protection DNS-rebinding ACTIVE (allowedHosts) — un site malveillant ne peut pas taper le MCP local.
 * ⚠️ Stateful : 1 transport par session (Mcp-Session-Id), nettoyé à la fermeture.
 */
import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildServer } from "./lib/build-server.js";
import { checkBearer } from "./lib/http-auth.js";

const TOKEN = process.env.PUBLER_MCP_HTTP_TOKEN;
const HOST = process.env.PUBLER_MCP_HTTP_HOST || "127.0.0.1";
const PORT = Number(process.env.PUBLER_MCP_HTTP_PORT || 8789);

if (!TOKEN) {
  process.stderr.write("FATAL: PUBLER_MCP_HTTP_TOKEN manquant — refus de démarrer sans auth.\n");
  process.exit(1);
}
// ⚠️ 0.0.0.0 interdit SAUF en conteneur : là, la frontière est le mapping de port Docker
//    (compose publie sur 127.0.0.1/IP-Tailscale uniquement), pas le bind interne.
if (HOST === "0.0.0.0" && process.env.PUBLER_MCP_CONTAINER !== "1") {
  process.stderr.write(
    "FATAL: bind 0.0.0.0 hors conteneur interdit — 127.0.0.1 + tunnel Tailscale, ou PUBLER_MCP_CONTAINER=1.\n"
  );
  process.exit(1);
}

const app = express();
app.use(express.json());

// Auth Bearer — AVANT tout traitement MCP.
app.use((req, res, next) => {
  if (!checkBearer(req.headers.authorization, TOKEN)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

const transports = {}; // sessionId -> transport
// allowedHosts = défaut local + hôtes supplémentaires (ex: IP Tailscale du VPS) via env, séparés par virgule.
// ⚠️ Garde la protection DNS-rebinding ACTIVE : on AUTORISE explicitement, on ne désactive jamais.
const EXTRA_HOSTS = (process.env.PUBLER_MCP_ALLOWED_HOSTS || "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);
const ALLOWED_HOSTS = [
  `${HOST}:${PORT}`,
  `127.0.0.1:${PORT}`,
  `localhost:${PORT}`,
  ...EXTRA_HOSTS,
];

app.post("/mcp", async (req, res) => {
  const sid = req.headers["mcp-session-id"];
  let transport = sid ? transports[sid] : undefined;

  if (!transport && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: true,
      allowedHosts: ALLOWED_HOSTS,
      onsessioninitialized: (id) => {
        transports[id] = transport;
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) delete transports[transport.sessionId];
    };
    await buildServer().connect(transport);
  } else if (!transport) {
    return res.status(400).json({ error: "session inconnue ou requête non-initialize" });
  }

  await transport.handleRequest(req, res, req.body);
});

// GET (flux SSE serveur→client) + DELETE (fin de session) : même routage par session.
async function bySession(req, res) {
  const sid = req.headers["mcp-session-id"];
  const transport = sid ? transports[sid] : undefined;
  if (!transport) return res.status(400).json({ error: "session inconnue" });
  await transport.handleRequest(req, res);
}
app.get("/mcp", bySession);
app.delete("/mcp", bySession);

app.listen(PORT, HOST, () => {
  process.stderr.write(`Publer MCP HTTP sur http://${HOST}:${PORT}/mcp (Bearer requis)\n`);
});
