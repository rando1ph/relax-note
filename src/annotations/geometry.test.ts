import { describe, expect, it } from "vitest";
import { mergeFragments, filterFragments, toPageLocal } from "./geometry";
import { viewportRectToNormalized, normalizedRectToViewport } from "../pdf/coordinates";
import type { PageViewport } from "pdfjs-dist";

/** A minimal PageViewport mock with inverse convertToPdfPoint/ViewportPoint. */
function makeViewport(scale: number): PageViewport {
  const pageWidth = 612;
  const pageHeight = 792;
  const width = pageWidth * scale;
  const height = pageHeight * scale;
  return {
    width,
    height,
    scale,
    rotation: 0,
    convertToPdfPoint(x: number, y: number): [number, number] {
      return [x / scale, pageHeight - y / scale];
    },
    convertToViewportPoint(x: number, y: number): [number, number] {
      return [x * scale, pageHeight * scale - y * scale];
    },
  } as unknown as PageViewport;
}

describe("mergeFragments (CSS-pixel space)", () => {
  it("merges multiple fragments on one visual line into one rect", () => {
    const rects = [
      { left: 0, top: 10, width: 40, height: 12 },
      { left: 40, top: 10, width: 40, height: 12 },
      { left: 80, top: 10, width: 40, height: 12 },
    ];
    const result = mergeFragments(rects);
    expect(result).toHaveLength(1);
    expect(result[0].left).toBeCloseTo(0);
    expect(result[0].width).toBeCloseTo(120);
  });

  it("keeps separate lines (multi-line) in reading order", () => {
    const rects = [
      { left: 10, top: 100, width: 200, height: 14 },
      { left: 10, top: 20, width: 200, height: 14 },
      { left: 10, top: 60, width: 200, height: 14 },
    ];
    const result = mergeFragments(rects);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.top)).toEqual([20, 60, 100]);
  });

  it("does not merge across a large horizontal gap on the same Y", () => {
    const rects = [
      { left: 0, top: 50, width: 60, height: 12 },
      { left: 300, top: 50, width: 60, height: 12 },
    ];
    const result = mergeFragments(rects);
    expect(result).toHaveLength(2);
  });

  it("does not bridge two columns on the same Y", () => {
    const leftColumn = [
      { left: 0, top: 0, width: 150, height: 12 },
      { left: 0, top: 16, width: 150, height: 12 },
      { left: 0, top: 32, width: 150, height: 12 },
    ];
    const rightColumn = [
      { left: 400, top: 0, width: 150, height: 12 },
      { left: 400, top: 16, width: 150, height: 12 },
      { left: 400, top: 32, width: 150, height: 12 },
    ];
    const result = mergeFragments([...leftColumn, ...rightColumn]);
    // 3 lines per column, never a single 400px-wide box.
    expect(result).toHaveLength(6);
    for (const r of result) {
      expect(r.width).toBeCloseTo(150);
    }
  });

  it("collapses near-duplicate rects", () => {
    const rects = [
      { left: 10, top: 10, width: 50, height: 12 },
      { left: 10.4, top: 10.2, width: 50.1, height: 12.2 },
      { left: 100, top: 10, width: 50, height: 12 },
    ];
    const result = mergeFragments(rects);
    expect(result).toHaveLength(2);
  });
});

describe("filterFragments", () => {
  it("removes sub-pixel noise", () => {
    const rects = [
      { left: 0, top: 0, width: 0.2, height: 10 },
      { left: 0, top: 0, width: 10, height: 0.3 },
      { left: 0, top: 20, width: 40, height: 12 },
    ];
    const result = filterFragments(rects);
    expect(result).toHaveLength(1);
  });
});

describe("toPageLocal", () => {
  it("accounts for the PDF.js page border", () => {
    const local = toPageLocal(
      { left: 109, top: 209, width: 30, height: 40 },
      { left: 100, top: 200 },
      { left: 9, top: 9 },
    );
    expect(local).toEqual({ left: 0, top: 0, width: 30, height: 40 });
  });
});

describe("normalized round-trip", () => {
  it("normalizes and projects back identically at a single scale", () => {
    const viewport = makeViewport(1);
    const rect = { left: 10, top: 20, width: 30, height: 40 };
    const normalized = viewportRectToNormalized(viewport, rect);
    const projected = normalizedRectToViewport(viewport, normalized);
    expect(projected.left).toBeCloseTo(10, 5);
    expect(projected.top).toBeCloseTo(20, 5);
    expect(projected.width).toBeCloseTo(30, 5);
    expect(projected.height).toBeCloseTo(40, 5);
  });

  it("is zoom-stable across scales", () => {
    const v1 = makeViewport(1);
    const v3 = makeViewport(3);
    const rect1 = { left: 20, top: 30, width: 100, height: 24 };
    const n1 = viewportRectToNormalized(v1, rect1);

    // Same physical location at 3x produces the same normalized value.
    const rect3 = { left: 60, top: 90, width: 300, height: 72 };
    const n3 = viewportRectToNormalized(v3, rect3);
    expect(n3.x).toBeCloseTo(n1.x, 8);
    expect(n3.y).toBeCloseTo(n1.y, 8);
    expect(n3.width).toBeCloseTo(n1.width, 8);
    expect(n3.height).toBeCloseTo(n1.height, 8);

    // Projecting back at 3x yields the 3x-scaled viewport rect.
    const projected = normalizedRectToViewport(v3, n1);
    expect(projected.left).toBeCloseTo(60, 4);
    expect(projected.top).toBeCloseTo(90, 4);
    expect(projected.width).toBeCloseTo(300, 4);
    expect(projected.height).toBeCloseTo(72, 4);
  });
});
