# publer-mcp

**An MCP server that lets an AI agent drive [Publer](https://publer.com) (multi-network social scheduling) with full API coverage — multi-workspace, concurrent-session safe.**

A pure, stateless MCP wrapper: raw pass-through with a self-teaching endpoint catalog, a multi-workspace multiplexer, and per-account rate-limit discipline. No database, no web layer — just a clean bridge between an agent and the Publer API.

## Design

- **Raw pass-through, nothing capped.** `publer_call` forwards `method / endpoint / payload / workspace` straight to the API. The catalog documents; it never gates. JSON by default, multipart when a `file` is passed (binary upload through the *same* tool — no per-endpoint wrapper, that's how tool-sprawl starts).
- **Per-account throttle.** Publer rate-limits 100 req / 2 min *per API key* → one [`p-throttle`](https://github.com/sindresorhus/p-throttle) per key, never shared, never hand-rolled.
- **Correct auth, proven live.** `Authorization: Bearer-API <key>` (not plain `Bearer`) + `Publer-Workspace-Id`.
- **Session-scoped state.** The active workspace lives per MCP session, never a process-global — no leakage between concurrent HTTP agents. A switch commits only after identity is proven via `GET /users/me`.
- **Self-teaching catalog.** Every write endpoint carries `params` or an `example`, sourced from Publer docs and live calls — zero invented endpoints.

## Tools

| Tool | Purpose |
|------|---------|
| `publer_call` | Raw API pass-through (JSON or multipart upload) |
| `publer_discover` | Self-documenting endpoint catalog |
| `publer_switch_workspace` | Switch active workspace (identity-proven) |
| `publer_health` | Workspaces + invalid-request window |

## Transports

- **stdio** — local use (`npm start`)
- **HTTP** — StreamableHTTP for a remote service (`npm run start:http`): binds a Tailscale IP or `127.0.0.1` (never `0.0.0.0` outside a container), constant-time Bearer auth (refuses to boot without it), active DNS-rebind protection, one transport per session.

## Stack

Node ≥22, ESM. `@modelcontextprotocol/sdk` · Express 5 · `p-throttle`.
**Testing:** Vitest (unit) + Stryker (mutation, ratcheted gate at 80%), wired into Husky pre-commit/pre-push. Network I/O is excluded from mutation; pure logic is fully mutated.

## Quick start

```bash
npm install
cp .secrets.example.json .secrets.json   # add your api key(s)
npm start            # stdio
npm run start:http   # HTTP service
```

Secrets shape: `{ default, workspaces: { <id>: { api_key, workspace_id } } }` — never committed (`.gitignore`).

---
<sub>Part of a set of home-built MCP servers. Built to be driven by an agent, hardened for concurrency.</sub>
