import type { PageViewport } from "pdfjs-dist";
import type { EventBus, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";

/**
 * Minimal annotation seam for future Relax Note overlays (M2).
 *
 * Attaches an empty, pointer-transparent overlay container to one official
 * `PDFPageView.div` and keeps it attached across `PDFPageView.reset()` and
 * page-buffer eviction.
 *
 * IMPORTANT OFFICIAL BEHAVIOR: `PDFPageView.reset()` removes every child of
 * the page div except the five built-in layers (canvasWrapper, textLayer,
 * annotationLayer, annotationEditorLayer, xfaLayer). A custom overlay child
 * is therefore dropped on every scale change and on buffer eviction, so the
 * seam re-attaches on official events (`scalechanging`, `pagerendered`,
 * `updateviewarea`). Future annotation drawing will re-position inside the
 * same `redraw` callback using `coordinates.normalizedRectToViewport` against
 * the page viewport — no PDF.js internals are modified.
 */

export interface PageViewLike {
  div: HTMLDivElement;
  viewport: PageViewport;
}

export function getPageView(viewer: PDFViewer, pageNumber: number): PageViewLike | null {
  const pv = viewer.getPageView(pageNumber - 1) as unknown;
  if (pv && typeof pv === "object") {
    const candidate = pv as PageViewLike;
    if (candidate.div instanceof HTMLDivElement && candidate.viewport) {
      return candidate;
    }
  }
  return null;
}

export interface PageOverlay {
  el: HTMLDivElement;
  detach: () => void;
}

/**
 * Attach a Relax Note overlay to the given page. Returns the overlay element
 * plus a detach function. The overlay is empty for now; M2 will draw
 * annotations into `el` (re)positioned via the page viewport.
 */
export function attachPageOverlay(
  viewer: PDFViewer,
  eventBus: EventBus,
  pageNumber: number,
): PageOverlay | null {
  const pageView = getPageView(viewer, pageNumber);
  if (!pageView) return null;

  const el = document.createElement("div");
  el.className = "relax-overlay";
  el.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:3;";

  const ensureAttached = () => {
    const pv = getPageView(viewer, pageNumber);
    if (pv && !pv.div.contains(el)) {
      pv.div.append(el);
    }
  };

  ensureAttached();
  eventBus.on("scalechanging", ensureAttached);
  eventBus.on("pagerendered", ensureAttached);
  eventBus.on("updateviewarea", ensureAttached);

  const detach = () => {
    eventBus.off("scalechanging", ensureAttached);
    eventBus.off("pagerendered", ensureAttached);
    eventBus.off("updateviewarea", ensureAttached);
    el.remove();
  };

  return { el, detach };
}
