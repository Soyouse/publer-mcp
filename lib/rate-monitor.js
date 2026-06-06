/**
 * Monitor des réponses invalides (401/403/429) — observabilité quota/auth.
 *
 * ⚠️ POURQUOI : le rate-limit Publer est 50 req/min PAR-COMPTE (api_key). Bottleneck (client.js) lisse
 *    le débit en amont, mais on compte quand même les 429 (throttle atteint malgré tout) et 401/403
 *    (clé invalide/scope manquant) en fenêtre glissante, par workspace, pour repérer un souci AVANT
 *    qu'il ne bloque l'agence.
 * ⚠️ État module-global ASSUMÉ ICI : métriques agrégées (par nature globales au process), PAS de l'état
 *    par-appel (cf incidents.js qui, lui, DOIT rester scopé). Ne pas confondre.
 * ⚠️ Horloge injectable (now) → tests déterministes, jamais de flake temporel.
 */
const INVALID = new Set([401, 403, 429]);
const WINDOW_MS = 60 * 1000; // fenêtre Publer = 1 min (rate-limit par-compte)
const SOFT_LIMIT = 50; // débit nominal Publer = 50 req/min/compte
const WARN_RATIO = 0.4; // alerte si ≥40% de la fenêtre part en réponses invalides (20/min)

let events = []; // [{ ts, workspace, status }]

/** Enregistre une réponse SI elle est invalide (401/403/429). No-op sinon. */
export function recordResult(workspace, status, now = Date.now) {
  if (!INVALID.has(status)) return;
  events.push({ ts: now(), workspace: workspace || "(défaut)", status });
}

function prune(t) {
  const cutoff = t - WINDOW_MS;
  if (events.length && events[0].ts < cutoff) {
    events = events.filter((e) => e.ts >= cutoff);
  }
}

/** Photo de la fenêtre glissante : total, par workspace, et alerte si trop d'invalides. */
export function snapshot(now = Date.now) {
  const t = now();
  prune(t);
  const perWorkspace = {};
  for (const e of events) perWorkspace[e.workspace] = (perWorkspace[e.workspace] || 0) + 1;
  const total = events.length;
  return {
    windowMinutes: WINDOW_MS / 60000,
    invalidTotal: total,
    perWorkspace,
    softLimit: SOFT_LIMIT,
    warn: total >= SOFT_LIMIT * WARN_RATIO,
  };
}

/** Remise à zéro — réservé aux tests. */
export function _reset() {
  events = [];
}
