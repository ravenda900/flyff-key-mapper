import { describe, expect, it } from "vitest";
import { resolveMatchedHpPercent } from "./autoPills";

describe("resolveMatchedHpPercent", () => {
  it("returns null when no template matched", () => {
    expect(resolveMatchedHpPercent([])).toBeNull();
  });

  it("returns the same value for a single match", () => {
    expect(resolveMatchedHpPercent([40])).toBe(40);
  });

  it("returns the lowest HP when multiple templates match", () => {
    expect(resolveMatchedHpPercent([100, 80, 40])).toBe(40);
    expect(resolveMatchedHpPercent([60, 20, 40])).toBe(20);
    expect(resolveMatchedHpPercent([20, 40])).toBe(20);
  });
});
