import { describe, it, expect } from "vitest";
import { extractBearer, checkBearer } from "../lib/http-auth.js";

describe("http-auth", () => {
  it("extractBearer extrait le token après 'Bearer '", () => {
    expect(extractBearer("Bearer abc123")).toBe("abc123");
  });

  it("extractBearer renvoie '' sans préfixe Bearer", () => {
    expect(extractBearer("abc123")).toBe("");
    expect(extractBearer("")).toBe("");
    expect(extractBearer(undefined)).toBe("");
    expect(extractBearer("Basic xyz")).toBe("");
  });

  it("checkBearer true ssi token exact", () => {
    expect(checkBearer("Bearer secret", "secret")).toBe(true);
  });

  it("checkBearer false si token différent", () => {
    expect(checkBearer("Bearer wrong", "secret")).toBe(false);
  });

  it("checkBearer false si longueurs différentes (pas de throw timingSafeEqual)", () => {
    expect(checkBearer("Bearer short", "longer-secret")).toBe(false);
  });

  it("checkBearer false si token attendu vide ou header absent", () => {
    expect(checkBearer("Bearer x", "")).toBe(false);
    expect(checkBearer("", "secret")).toBe(false);
  });
});
