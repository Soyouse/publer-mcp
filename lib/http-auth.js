/**
 * Auth Bearer du transport HTTP — PUR & testable (zéro I/O).
 *
 * ⚠️ Comparaison à TEMPS CONSTANT (timingSafeEqual) — un === fuit la longueur/contenu par timing.
 * ⚠️ Le serveur HTTP REFUSE de démarrer sans token (voir http.js) — pas d'endpoint ouvert.
 */
import { timingSafeEqual } from "node:crypto";

/** Extrait le token d'un header `Authorization: Bearer xxx` (sinon ""). */
export function extractBearer(header) {
  const h = String(header || "");
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

/** true ssi le header porte exactement le token attendu (comparaison constante). */
export function checkBearer(header, expected) {
  const got = extractBearer(header);
  if (!expected || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual throw si longueurs ≠
  return timingSafeEqual(a, b);
}
