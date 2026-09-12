import type { ViewportRect } from "../pdf/types";

/**
 * Geometry helpers that operate in page-local CSS-pixel space (NOT normalized
 * space). Normalized x/width are fractions of page width while y/height are
 * fractions of page height, so line/gap decisions must not be made in
 * normalized space — a "gap" in normalized units is not dimensionally
 * comparable to a "line height" in normalized units on non-square pages.
 *
 * NormalizedRect remains the canonical STORED representation; these helpers
 * only shape geometry before it is normalized (and after it is projected back
 * to viewport space).
 */

export interface MergeOptions {
  /** Sub-pixel noise threshold (px). */
  minSize?: number;
  /** Near-duplicate corner tolerance (px). */
  dupCornerTol?: number;
  /** Near-duplicate size tolerance (fraction of the larger side). */
  dupSizeTol?: number;
  /** Horizontal merge gap threshold, as a fraction of the line height. */
  gapFactor?: number;
  /** Vertical overlap fraction required to consider two rects on one line. */
  lineOverlapTol?: number;
}

const DEFAULTS: Required<MergeOptions> = {
  minSize: 0.5,
  dupCornerTol: 1,
  dupSizeTol: 0.02,
  gapFactor: 0.75,
  lineOverlapTol: 0.5,
};

function rectsNearEqual(
  a: ViewportRect,
  b: ViewportRect,
  opts: Required<MergeOptions>,
): boolean {
  const sizeA = Math.max(a.width, a.height);
  const sizeB = Math.max(b.width, b.height);
  const size = Math.max(sizeA, sizeB);
  return (
    Math.abs(a.left - b.left) <= opts.dupCornerTol &&
    Math.abs(a.top - b.top) <= opts.dupCornerTol &&
    Math.abs(a.width - b.width) <= opts.dupSizeTol * size &&
    Math.abs(a.height - b.height) <= opts.dupSizeTol * size
  );
}

/**
 * Removes sub-pixel noise and near-duplicate fragments. Preserves raw
 * fragments whenever uncertain.
 */
export function filterFragments(
  rects: ViewportRect[],
  options: MergeOptions = {},
): ViewportRect[] {
  const opts: Required<MergeOptions> = { ...DEFAULTS, ...options };
  const kept: ViewportRect[] = [];
  for (const rect of rects) {
    if (rect.width < opts.minSize || rect.height < opts.minSize) continue;
    const duplicate = kept.some((k) => rectsNearEqual(k, rect, opts));
    if (!duplicate) kept.push(rect);
  }
  return kept;
}

interface LineCluster {
  top: number;
  bottom: number;
  rects: ViewportRect[];
}

function clusterByLine(rects: ViewportRect[], opts: Required<MergeOptions>): LineCluster[] {
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: LineCluster[] = [];
  for (const r of sorted) {
    const rTop = r.top;
    const rBottom = r.top + r.height;
    let placed = false;
    for (const line of lines) {
      const overlap = Math.min(line.bottom, rBottom) - Math.max(line.top, rTop);
      const minHeight = Math.min(r.height, line.bottom - line.top);
      if (overlap >= opts.lineOverlapTol * minHeight) {
        line.rects.push(r);
        line.top = Math.min(line.top, rTop);
        line.bottom = Math.max(line.bottom, rBottom);
        placed = true;
        break;
      }
    }
    if (!placed) {
      lines.push({ top: rTop, bottom: rBottom, rects: [r] });
    }
  }
  return lines;
}

function mergeLine(rects: ViewportRect[], opts: Required<MergeOptions>): ViewportRect[] {
  const sorted = [...rects].sort((a, b) => a.left - b.left);
  const runs: ViewportRect[] = [];
  let run = {
    left: sorted[0].left,
    right: sorted[0].left + sorted[0].width,
    top: sorted[0].top,
    bottom: sorted[0].top + sorted[0].height,
  };
  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i];
    const rRight = r.left + r.width;
    const gap = r.left - run.right;
    const lineHeight = run.bottom - run.top;
    if (gap <= opts.gapFactor * lineHeight) {
      // Overlap or a small justified gap: extend the run.
      run.right = Math.max(run.right, rRight);
      run.top = Math.min(run.top, r.top);
      run.bottom = Math.max(run.bottom, r.top + r.height);
    } else {
      // Large horizontal gap (e.g. a column gutter): keep separate.
      runs.push({
        left: run.left,
        top: run.top,
        width: run.right - run.left,
        height: run.bottom - run.top,
      });
      run = { left: r.left, right: rRight, top: r.top, bottom: r.top + r.height };
    }
  }
  runs.push({
    left: run.left,
    top: run.top,
    width: run.right - run.left,
    height: run.bottom - run.top,
  });
  return runs;
}

/**
 * Conservative fragment merge in page-local CSS pixels:
 *   noise filter → near-duplicate removal → same-line clustering →
 *   horizontal-gap merge (never bridging a large gap).
 *
 * Returns one rect per maximal horizontally-connected run. A two-column page
 * at the same Y produces two (or more) separate segments, never one giant box.
 */
export function mergeFragments(
  rects: ViewportRect[],
  options: MergeOptions = {},
): ViewportRect[] {
  const opts: Required<MergeOptions> = { ...DEFAULTS, ...options };
  const cleaned = filterFragments(rects, opts);
  if (cleaned.length <= 1) return cleaned;

  const lines = clusterByLine(cleaned, opts);
  const result: ViewportRect[] = [];
  for (const line of lines) {
    result.push(...mergeLine(line.rects, opts));
  }
  // Restore reading order (top-to-bottom, then left-to-right).
  result.sort((a, b) => a.top - b.top || a.left - b.left);
  return result;
}

/**
 * Maps a client (viewport) rect to page-local CSS pixels, accounting for the
 * PDF.js `.page` border. `pageBox` is the page's border box
 * (`getBoundingClientRect()`); `border` is the computed border width on the
 * left/top edges (mirrors how PDF.js itself computes content offsets via
 * `clientLeft`/`clientTop`).
 */
export function toPageLocal(
  client: { left: number; top: number; width: number; height: number },
  pageBox: { left: number; top: number },
  border: { left: number; top: number },
): ViewportRect {
  return {
    left: client.left - pageBox.left - border.left,
    top: client.top - pageBox.top - border.top,
    width: client.width,
    height: client.height,
  };
}
