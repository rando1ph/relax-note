import type { NormalizedRect, ViewportRect } from "../pdf/types";
import type { PageViewport } from "../pdf/pdfjs";
import { mergeFragments, toPageLocal } from "./geometry";
import { viewportRectToNormalized } from "../pdf/coordinates";

/**
 * An ephemeral snapshot of a PDF text selection, captured at selection time so
 * that interacting with floating UI (which can collapse the browser Selection)
 * never loses the geometry/text.
 */
export interface SelectionSnapshot {
  pageNumber: number;
  text: string;
  rects: NormalizedRect[];
}

export interface PageViewLike {
  div: HTMLElement;
  viewport: PageViewport;
}

function closestTextLayer(node: Node | null): Element | null {
  if (!node) return null;
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  return el?.closest(".textLayer") ?? null;
}

function pageNumberFor(textLayer: Element): number | null {
  const page = textLayer.closest(".page");
  const raw = page?.getAttribute("data-page-number");
  const n = raw == null ? NaN : Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function borderWidths(el: Element): { left: number; top: number } {
  const cs = getComputedStyle(el);
  return {
    left: Number.parseFloat(cs.borderLeftWidth) || 0,
    top: Number.parseFloat(cs.borderTopWidth) || 0,
  };
}

/**
 * Captures a text selection into a page-relative geometry snapshot.
 *
 * The selection is valid only when BOTH endpoints live inside the same PDF.js
 * `.textLayer` (same page). Geometry is produced by mapping `Range` client
 * rects into page-local CSS pixels (accounting for the `.page` border),
 * conservatively merging them in pixel space, and only then normalizing.
 *
 * Returns null for any selection that is collapsed, outside the text layer,
 * spanning pages, or empty after noise filtering.
 */
export function captureSelection(
  getPageView: (pageNumber: number) => PageViewLike | null,
  selection: Selection | null = window.getSelection(),
): SelectionSnapshot | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const startLayer = closestTextLayer(range.startContainer);
  const endLayer = closestTextLayer(range.endContainer);
  if (!startLayer || !endLayer || startLayer !== endLayer) return null;

  const pageNumber = pageNumberFor(startLayer);
  if (pageNumber == null) return null;

  const pageView = getPageView(pageNumber);
  if (!pageView) return null;

  const pageEl = pageView.div;
  const pageBox = pageEl.getBoundingClientRect();
  const border = borderWidths(pageEl);

  const pixelRects: ViewportRect[] = [];
  for (const rect of Array.from(range.getClientRects())) {
    pixelRects.push(
      toPageLocal(
        { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        { left: pageBox.left, top: pageBox.top },
        border,
      ),
    );
  }

  const merged = mergeFragments(pixelRects);
  if (merged.length === 0) return null;

  const rects: NormalizedRect[] = merged.map((rect) =>
    viewportRectToNormalized(pageView.viewport, rect),
  );

  return {
    pageNumber,
    text: range.toString(),
    rects,
  };
}
