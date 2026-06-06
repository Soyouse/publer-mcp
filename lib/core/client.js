/**
 * Client Publer MULTI-WORKSPACE — wrap `fetch` natif + throttle p-throttle (rate-limit 50 req/min/compte).
 *
 * ⚠️ Publer n'a PAS de SDK officiel → fetch natif (Node ≥22). Le throttle (100 req/2min, doc Publer) est
 *    délégué à p-throttle (sindresorhus, ESM, activement maintenu — pile notre cas « N appels/intervalle »).
 *    NE PAS réinventer la file/limiteur à la main. (bottleneck écarté : mort depuis 2019, CJS.)
 * ⚠️ Rate-limit Publer = 100 req/2min PAR-COMPTE (api_key) → 1 throttle p-throttle PAR api_key (Map), jamais partagé.
 * ⚠️ Secrets rechargés À CHAUD depuis .secrets.json (watch mtime) — aucun restart au reset.
 * ⚠️ api_key JAMAIS en dur, jamais committée (.secrets.json est gitignore).
 *
 * Auth Publer (prouvé live) : header `Authorization: Bearer-API <api_key>` + `Publer-Workspace-Id: <id>`.
 *
 * Schéma .secrets.json (multi-workspace) :
 *   { "default": "webzenon", "workspaces": { "webzenon": { "api_key": "...", "workspace_id": "..." } } }
 * Rétrocompat (legacy mono) : { "api_key": "...", "workspace_id": "..." } → workspace "default".
 *
 * Résolution du workspace pour un appel (ordre) : opts.workspace explicite > défaut de session > défaut secrets.
 * ⚠️ Le « défaut de session » vit dans ctx.session.workspace (PAR-SESSION, build-server.js), JAMAIS un
 *    global de process : sinon il FUIT entre sessions HTTP concurrentes (2 agents → l'un écrase l'autre).
 */
import pThrottle from "p-throttle";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SECRETS_PATH =
  process.env.PUBLER_SECRETS_PATH || join(here, "..", "..", ".secrets.json");
const API_BASE = process.env.PUBLER_API_BASE || "https://app.publer.com/api/v1";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

// État rechargé à chaud. throttledByKey = Map<api_key, throttledFn> — 1 throttle par compte.
let workspaces = null; // { [id]: { api_key, workspace_id } }
let defaultWorkspace = null;
let loadedMtime = -1;
const throttledByKey = new Map();
// ⚠️ PAS d'état de session ICI. Le workspace de session est PAR-SESSION (ctx.session.workspace),
//    pas un global de process — sinon fuite entre sessions HTTP concurrentes (multi-agents).

/**
 * Normalise les deux schémas (multi-workspace ET legacy mono) vers une forme unique.
 * ⚠️ Exporté pour test offline — ne touche AUCUN réseau.
 */
export function normalizeSecrets(raw) {
  if (raw && typeof raw === "object" && raw.workspaces && typeof raw.workspaces === "object") {
    const ids = Object.keys(raw.workspaces);
    if (ids.length === 0) throw new Error(".secrets.json : `workspaces` est vide");
    for (const id of ids) {
      const w = raw.workspaces[id];
      if (!w?.api_key) throw new Error(`.secrets.json : workspace \`${id}\` sans api_key`);
      if (!w?.workspace_id) throw new Error(`.secrets.json : workspace \`${id}\` sans workspace_id`);
    }
    const def = raw.default || ids[0];
    if (!raw.workspaces[def]) throw new Error(`.secrets.json : default \`${def}\` absent de workspaces`);
    return { workspaces: raw.workspaces, defaultWorkspace: def };
  }
  if (raw && typeof raw === "object" && raw.api_key && raw.workspace_id) {
    // legacy mono → workspace "default"
    return {
      workspaces: { default: { api_key: raw.api_key, workspace_id: raw.workspace_id } },
      defaultWorkspace: "default",
    };
  }
  throw new Error(".secrets.json : ni `workspaces` ni `api_key`+`workspace_id` — format invalide");
}

async function loadSecrets() {
  const { mtimeMs } = await stat(SECRETS_PATH);
  if (mtimeMs !== loadedMtime) {
    const raw = JSON.parse(await readFile(SECRETS_PATH, "utf8"));
    const norm = normalizeSecrets(raw);
    workspaces = norm.workspaces;
    defaultWorkspace = norm.defaultWorkspace;
    loadedMtime = mtimeMs;
    // pas de purge des throttles : ils sont indexés par api_key, une clé inchangée garde sa fenêtre.
  }
}

/**
 * Résout l'id du workspace à utiliser pour un appel (sans réseau).
 * Ordre : explicite > session (foldé par les handlers dans `requested`) > défaut secrets. Throw si inconnu.
 */
export function resolveWorkspaceId(requested) {
  const id = requested || defaultWorkspace;
  if (!workspaces[id]) {
    const known = Object.keys(workspaces).join(", ");
    throw new Error(`Workspace inconnu : ${id} (disponibles : ${known})`);
  }
  return id;
}

/** Fonction throttlée (p-throttle) pour un compte (api_key) : 100 appels / 2 min (bucket doc Publer),
 *  en file (zéro perte). Wrappe un dispatcher générique → tous les appels d'un compte partagent la fenêtre. */
function getThrottled(apiKey) {
  let t = throttledByKey.get(apiKey);
  if (!t) {
    const throttle = pThrottle({ limit: 100, interval: 120_000 });
    t = throttle((verb, route, payload, key, wsId) => doFetch(verb, route, payload, key, wsId));
    throttledByKey.set(apiKey, t);
  }
  return t;
}

/**
 * Construit la requête HTTP (URL + options) — PUR, testable offline, aucun réseau.
 * ⚠️ Auth Publer : `Authorization: Bearer-API <api_key>` (PAS "Bearer") + `Publer-Workspace-Id`.
 */
export function buildRequest(verb, route, payload, apiKey, workspaceId) {
  const headers = {
    Authorization: `Bearer-API ${apiKey}`,
    "Publer-Workspace-Id": workspaceId,
    "Content-Type": "application/json",
  };
  const options = { method: verb, headers };
  if (payload != null && verb !== "GET") options.body = JSON.stringify(payload);
  return { url: `${API_BASE}${route}`, options };
}

/** Exécute la requête (I/O fetch). Throw une erreur portant `.status` (lu par rate-monitor). */
async function doFetch(verb, route, payload, apiKey, workspaceId) {
  const { url, options } = buildRequest(verb, route, payload, apiKey, workspaceId);
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(`Publer ${verb} ${route} → HTTP ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/** Remet l'état à zéro (workspaces, mtime, throttles) — réservé aux tests. */
export function _resetClient() {
  workspaces = null;
  defaultWorkspace = null;
  loadedMtime = -1;
  throttledByKey.clear();
}

/** Liste les ids de workspaces configurés (offline). Recharge à chaud. */
export async function listWorkspaces() {
  await loadSecrets();
  return { workspaces: Object.keys(workspaces), default: defaultWorkspace };
}

/** Valide qu'un workspace existe (throw sinon). Le STOCKAGE du choix est PAR-SESSION
 *  (ctx.session.workspace), jamais un global. Utilisé par publer_switch_workspace avant de committer. */
export async function assertWorkspace(id) {
  await loadSecrets();
  if (!workspaces[id]) {
    const known = Object.keys(workspaces).join(", ");
    throw new Error(`Workspace inconnu : ${id} (disponibles : ${known})`);
  }
  return id;
}

/**
 * Appel brut à N'IMPORTE QUEL endpoint REST de Publer (couverture 100 %).
 * @param {string} method GET|POST|PUT|PATCH|DELETE
 * @param {string} endpoint ex: "/posts" ou "/users/me"
 * @param {object} [payload] corps JSON (POST/PATCH/PUT)
 * @param {object} [opts] { workspace } — id du workspace ; défaut = session puis secrets.default
 */
export async function publerCall(method, endpoint, payload, opts = {}) {
  const verb = String(method).toUpperCase();
  if (!METHODS.has(verb)) throw new Error(`Méthode non supportée : ${method}`); // ⚠️ AVANT secrets (testable offline)
  await loadSecrets();
  const wsId = resolveWorkspaceId(opts.workspace);
  const { api_key, workspace_id } = workspaces[wsId];
  const route = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const throttled = getThrottled(api_key);
  return throttled(verb, route, payload, api_key, workspace_id);
}
