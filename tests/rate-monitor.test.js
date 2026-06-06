import { describe, it, expect, beforeEach } from "vitest";
import { recordResult, snapshot, _reset } from "../lib/rate-monitor.js";

describe("rate-monitor", () => {
  beforeEach(() => _reset());

  it("ne compte QUE les réponses invalides (401/403/429)", () => {
    const now = () => 1000;
    recordResult("ws1", 200, now);
    recordResult("ws1", 404, now);
    recordResult("ws1", 401, now);
    recordResult("ws1", 429, now);
    expect(snapshot(now).invalidTotal).toBe(2);
  });

  it("agrège par workspace", () => {
    const now = () => 1000;
    recordResult("ws1", 401, now);
    recordResult("ws1", 403, now);
    recordResult("ws2", 429, now);
    const snap = snapshot(now);
    expect(snap.perWorkspace).toEqual({ ws1: 2, ws2: 1 });
  });

  it("workspace absent → libellé (défaut)", () => {
    const now = () => 1000;
    recordResult(undefined, 401, now);
    expect(snapshot(now).perWorkspace).toEqual({ "(défaut)": 1 });
  });

  it("purge les events hors fenêtre (2 min)", () => {
    recordResult("ws1", 401, () => 0);
    // 121s plus tard : l'event de t=0 est hors de la fenêtre de 120s
    expect(snapshot(() => 121_000).invalidTotal).toBe(0);
  });

  it("warn=true au-delà de 40% du débit nominal (≥40/2min)", () => {
    const now = () => 1000;
    for (let i = 0; i < 39; i++) recordResult("ws1", 429, now);
    expect(snapshot(now).warn).toBe(false);
    recordResult("ws1", 429, now);
    expect(snapshot(now).warn).toBe(true);
  });

  it("snapshot expose la fenêtre (2 min) et le débit nominal (100)", () => {
    const snap = snapshot(() => 0);
    expect(snap.windowMinutes).toBe(2);
    expect(snap.softLimit).toBe(100);
  });

  it("ne purge PAS un event encore dans la fenêtre", () => {
    recordResult("ws1", 401, () => 1000);
    // 60s après : toujours dans la fenêtre de 120s → conservé
    expect(snapshot(() => 61_000).invalidTotal).toBe(1);
  });
});
