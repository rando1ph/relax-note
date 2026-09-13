import { describe, expect, it } from "vitest";
import { buildWavyUnderlinePath, BASE_WAVELENGTH } from "./underline";

function pathBounds(d: string): { minX: number; maxX: number } {
  const numbers = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const xs: number[] = [];
  // Path commands are M/Q with x y pairs; take every other number.
  for (let i = 0; i < numbers.length; i += 2) xs.push(numbers[i]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs) };
}

describe("buildWavyUnderlinePath", () => {
  it("stays within the segment x-range", () => {
    const d = buildWavyUnderlinePath(10, 20, 50);
    const { minX, maxX } = pathBounds(d);
    expect(minX).toBeGreaterThanOrEqual(10);
    expect(maxX).toBeLessThanOrEqual(60);
  });

  it("ends exactly at x + width", () => {
    const d = buildWavyUnderlinePath(10, 20, 50);
    expect(d.trimEnd().endsWith("60.00 20.00")).toBe(true);
  });

  it("never extends a short word past its width", () => {
    const d = buildWavyUnderlinePath(5, 30, BASE_WAVELENGTH / 3);
    const { minX, maxX } = pathBounds(d);
    expect(minX).toBeGreaterThanOrEqual(5);
    expect(maxX).toBeLessThanOrEqual(5 + BASE_WAVELENGTH / 3 + 1e-9);
  });

  it("returns an empty path for zero/negative width", () => {
    expect(buildWavyUnderlinePath(0, 0, 0)).toBe("");
    expect(buildWavyUnderlinePath(0, 0, -5)).toBe("");
  });

  it("is deterministic", () => {
    expect(buildWavyUnderlinePath(1, 2, 20)).toBe(buildWavyUnderlinePath(1, 2, 20));
  });
});
