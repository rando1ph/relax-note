import type { PageViewport } from "pdfjs-dist";
import type { NormalizedRect, ViewportRect } from "./types";

/**
 * Coordinate conventions used across Relax Note:
 *
 * - PDF user space: origin is the bottom-left corner, y grows upward.
 * - Viewport space: origin is the top-left corner (CSS px), y grows downward.
 * - Normalized space: fractions of the page size within [0, 1], with the same
 *   top-left origin convention as viewport space. This is the canonical,
 *   zoom/resize independent representation used to anchor annotations.
 */

function pdfBounds(viewport: PageViewport): {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
} {
  const [x0, y0] = viewport.convertToPdfPoint(0, 0);
  const [x1, y1] = viewport.convertToPdfPoint(viewport.width, viewport.height);
  return {
    xMin: Math.min(x0, x1),
    yMin: Math.min(y0, y1),
    xMax: Math.max(x0, x1),
    yMax: Math.max(y0, y1),
  };
}

export function viewportRectToNormalized(
  viewport: PageViewport,
  rect: ViewportRect,
): NormalizedRect {
  const bounds = pdfBounds(viewport);
  const pageWidth = bounds.xMax - bounds.xMin;
  const pageHeight = bounds.yMax - bounds.yMin;

  const [left, top] = viewport.convertToPdfPoint(rect.left, rect.top);
  const [right, bottom] = viewport.convertToPdfPoint(
    rect.left + rect.width,
    rect.top + rect.height,
  );

  const xMin = Math.min(left, right);
  const xMax = Math.max(left, right);
  const yMin = Math.min(top, bottom);
  const yMax = Math.max(top, bottom);

  return {
    x: (xMin - bounds.xMin) / pageWidth,
    y: 1 - (yMax - bounds.yMin) / pageHeight,
    width: (xMax - xMin) / pageWidth,
    height: (yMax - yMin) / pageHeight,
  };
}

export function normalizedRectToViewport(
  viewport: PageViewport,
  rect: NormalizedRect,
): ViewportRect {
  const bounds = pdfBounds(viewport);
  const pageWidth = bounds.xMax - bounds.xMin;
  const pageHeight = bounds.yMax - bounds.yMin;

  const x = bounds.xMin + rect.x * pageWidth;
  const yBottom = bounds.yMin + (1 - rect.y - rect.height) * pageHeight;
  const width = rect.width * pageWidth;
  const height = rect.height * pageHeight;

  const [left, top] = viewport.convertToViewportPoint(x, yBottom + height);
  const [right, bottom] = viewport.convertToViewportPoint(x + width, yBottom);

  return {
    left: Math.min(left, right),
    top: Math.min(top, bottom),
    width: Math.abs(right - left),
    height: Math.abs(bottom - top),
  };
}
