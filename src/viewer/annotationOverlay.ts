import type { PageViewport } from "pdfjs-dist";
import type { EventBus, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { Annotation } from "../annotations/types";
import { normalizedRectToViewport } from "../pdf/coordinates";
import {
  markerKind,
  markerColor,
  markerHitSize,
  layoutMarkerRail,
  NOTE_VISUAL_SIZE,
  VOCAB_VISUAL_SIZE,
} from "../annotations/marker";
import type { MarkerKind } from "../annotations/marker";
import { buildWavyUnderlinePath, UNDERLINE_INSET } from "../vocabulary/underline";

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

const SVG_NS = "http://www.w3.org/2000/svg";
const RAIL_GAP = 4; // px between the page edge and a rail marker
const MARKER_GAP = 2; // px vertical gap between rail markers

interface OverlayData {
  byPage: Map<number, Annotation[]>;
  selectedId: string | null;
}

interface PageLayers {
  fill: SVGSVGElement;
  outline: SVGSVGElement;
  underline: SVGSVGElement;
}

export interface AnnotationOverlayController {
  setData: (byPage: Map<number, Annotation[]>, selectedId: string | null) => void;
  redrawAll: () => void;
  dispose: () => void;
}

function borderWidths(el: Element): { left: number; top: number } {
  const cs = getComputedStyle(el);
  return {
    left: Number.parseFloat(cs.borderLeftWidth) || 0,
    top: Number.parseFloat(cs.borderTopWidth) || 0,
  };
}

/**
 * Imperative Relax Note annotation overlay.
 *
 * - Highlight fill: SVG layer inside the official `canvasWrapper` (immediately
 *   above the rasterized page canvas), `mix-blend-mode: multiply` in CSS.
 * - Selection outline: separate SVG, normal blending, crisp ring.
 * - Page-margin markers: a VIEWER-LEVEL rail layer (`.relax-annotation-rail-layer`)
 *   that is a sibling of the scroll container inside `.viewer-root`, NOT a
 *   child of `.page`/`.canvasWrapper`. Marker positions are computed in
 *   viewer-viewport CSS pixels from live `getBoundingClientRect()` data, so
 *   they are never clipped by page/scroll overflow and stay fixed-size across
 *   zoom. When the right rail would exceed the viewport, markers flip to the
 *   left page edge.
 *
 * Fill/outline layers survive `PDFPageView.reset()` by re-attaching on
 * `pagerendered`; rail markers recompute on `pagerendered`, `updateviewarea`
 * (scroll), `pagechanging` and `scalechanging` via the same EventBus seams.
 */
export function createAnnotationOverlay(options: {
  viewer: PDFViewer;
  eventBus: EventBus;
  container: HTMLElement;
  root: HTMLElement;
  onSelect: (id: string | null) => void;
  signal: AbortSignal;
}): AnnotationOverlayController {
  const { viewer, eventBus, container, root, onSelect, signal } = options;
  const data: OverlayData = { byPage: new Map(), selectedId: null };
  const layers = new Map<number, PageLayers>();

  const rail = document.createElement("div");
  rail.className = "relax-annotation-rail-layer";
  root.append(rail);

  function dropPage(pageNumber: number): void {
    const entry = layers.get(pageNumber);
    entry?.fill.remove();
    entry?.outline.remove();
    entry?.underline.remove();
    layers.delete(pageNumber);
  }

  function ensurePageLayers(pageNumber: number): PageLayers | null {
    const pageView = getPageView(viewer, pageNumber);
    if (!pageView) {
      dropPage(pageNumber);
      return null;
    }
    const canvasWrapper = pageView.div.querySelector(".canvasWrapper") as HTMLElement | null;
    if (!canvasWrapper) {
      dropPage(pageNumber);
      return null;
    }

    let entry = layers.get(pageNumber);
    if (!entry) {
      const fill = document.createElementNS(SVG_NS, "svg");
      fill.setAttribute("class", "relax-highlight-layer");
      const outline = document.createElementNS(SVG_NS, "svg");
      outline.setAttribute("class", "relax-highlight-outline");
      const underline = document.createElementNS(SVG_NS, "svg");
      underline.setAttribute("class", "relax-vocab-underline-layer");
      entry = { fill, outline, underline };
      layers.set(pageNumber, entry);
    }

    const { width, height } = pageView.viewport;
    for (const svg of [entry.fill, entry.outline, entry.underline]) {
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.setAttribute("preserveAspectRatio", "none");
      svg.style.width = "100%";
      svg.style.height = "100%";
      // canvasWrapper may have been recreated by reset(): (re)attach.
      if (svg.parentElement !== canvasWrapper) {
        canvasWrapper.append(svg);
      }
    }
    return entry;
  }

  function appendRect(
    svg: SVGSVGElement,
    left: number,
    top: number,
    width: number,
    height: number,
  ): SVGRectElement {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(left));
    rect.setAttribute("y", String(top));
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(height));
    svg.append(rect);
    return rect;
  }

  function createMarker(annotation: Annotation, kind: MarkerKind): SVGSVGElement {
    const hit = markerHitSize(kind);
    const color = markerColor(annotation);
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "relax-marker");
    svg.setAttribute("viewBox", `0 0 ${hit} ${hit}`);
    svg.setAttribute("width", String(hit));
    svg.setAttribute("height", String(hit));

    if (kind === "note") {
      // Abstract note-sheet glyph: a note-card body in the annotation color,
      // a subtle folded upper-right corner, and a short content stroke — white
      // internal detail so the annotation hue stays dominant while remaining
      // legible on light annotation colors.
      const off = (hit - NOTE_VISUAL_SIZE) / 2;
      const body = document.createElementNS(SVG_NS, "rect");
      body.setAttribute("x", String(off));
      body.setAttribute("y", String(off));
      body.setAttribute("width", String(NOTE_VISUAL_SIZE));
      body.setAttribute("height", String(NOTE_VISUAL_SIZE));
      body.setAttribute("rx", "1");
      body.setAttribute("fill", color);
      body.setAttribute("stroke", "rgba(0, 0, 0, 0.2)");
      body.setAttribute("stroke-width", "0.75");
      svg.append(body);

      const fold = document.createElementNS(SVG_NS, "path");
      fold.setAttribute(
        "d",
        `M${off + NOTE_VISUAL_SIZE - 4.5} ${off} H${off + NOTE_VISUAL_SIZE} V${off + 4.5} Z`,
      );
      fold.setAttribute("fill", "rgba(255, 255, 255, 0.92)");
      svg.append(fold);

      const line = document.createElementNS(SVG_NS, "path");
      line.setAttribute("d", `M${off + 2.5} ${off + 9.5} H${off + NOTE_VISUAL_SIZE - 2.5}`);
      line.setAttribute("stroke", "rgba(255, 255, 255, 0.92)");
      line.setAttribute("stroke-width", "1.2");
      line.setAttribute("stroke-linecap", "round");
      svg.append(line);
    } else {
      const c = hit / 2;
      const r = VOCAB_VISUAL_SIZE / 2;
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", String(c));
      circle.setAttribute("cy", String(c));
      circle.setAttribute("r", String(r));
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke", color);
      circle.setAttribute("stroke-width", "1.8");
      svg.append(circle);
    }

    svg.addEventListener("click", (e) => {
      e.stopPropagation();
      onSelect(annotation.id);
    });
    return svg;
  }

  function redrawPage(pageNumber: number): void {
    const pageView = getPageView(viewer, pageNumber);
    const entry = ensurePageLayers(pageNumber);
    if (!pageView || !entry) return;

    entry.fill.replaceChildren();
    entry.outline.replaceChildren();
    entry.underline.replaceChildren();

    const annotations = data.byPage.get(pageNumber);
    if (annotations) {
      for (const annotation of annotations) {
        const isVocabulary = annotation.type === "vocabulary";
        for (const segment of annotation.segments) {
          const rect = normalizedRectToViewport(pageView.viewport, segment.rect);
          if (isVocabulary) {
            // Vocabulary uses a wavy underline only; no highlight fill.
            const path = document.createElementNS(SVG_NS, "path");
            path.setAttribute(
              "d",
              buildWavyUnderlinePath(
                rect.left,
                rect.top + rect.height - UNDERLINE_INSET,
                rect.width,
              ),
            );
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", annotation.color);
            path.setAttribute("stroke-width", "1.4");
            path.setAttribute("stroke-linecap", "round");
            entry.underline.append(path);
          } else {
            const el = appendRect(entry.fill, rect.left, rect.top, rect.width, rect.height);
            el.setAttribute("fill", annotation.color);
          }
        }
      }
    }

    const selected = annotations?.find((a) => a.id === data.selectedId);
    if (selected) {
      for (const segment of selected.segments) {
        const rect = normalizedRectToViewport(pageView.viewport, segment.rect);
        appendRect(entry.outline, rect.left, rect.top, rect.width, rect.height);
      }
    }
  }

  function redrawRail(): void {
    rail.replaceChildren();

    const rootRect = root.getBoundingClientRect();

    for (const pageNumber of [...layers.keys()]) {
      const pageView = getPageView(viewer, pageNumber);
      if (!pageView) continue;
      const annotations = data.byPage.get(pageNumber);
      if (!annotations || annotations.length === 0) continue;

      const pageRect = pageView.div.getBoundingClientRect();
      const marked: { annotation: Annotation; kind: MarkerKind; y: number }[] = [];
      const entries: { id: string; y: number; size: number }[] = [];

      for (const annotation of annotations) {
        const kind = markerKind(annotation);
        if (!kind || annotation.segments.length === 0) continue;
        const firstRect = normalizedRectToViewport(
          pageView.viewport,
          annotation.segments[0].rect,
        );
        const desiredY =
          pageRect.top - rootRect.top + firstRect.top + firstRect.height / 2;
        marked.push({ annotation, kind, y: desiredY });
        entries.push({ id: annotation.id, y: desiredY, size: markerHitSize(kind) });
      }

      if (marked.length === 0) continue;

      const placed = layoutMarkerRail(entries, MARKER_GAP);
      for (const item of marked) {
        const top = placed.get(item.annotation.id);
        if (top == null) continue;
        const marker = createMarker(item.annotation, item.kind);
        const hit = markerHitSize(item.kind);

        // Right rail; flip to the left page edge if it would leave the viewport.
        let left = pageRect.right - rootRect.left + RAIL_GAP;
        if (left + hit > rootRect.width) {
          left = Math.max(0, pageRect.left - rootRect.left - RAIL_GAP - hit);
        }

        marker.style.left = `${left}px`;
        marker.style.top = `${top}px`;
        rail.append(marker);
      }
    }
  }

  function redrawAll(): void {
    for (const pageNumber of [...layers.keys()]) {
      redrawPage(pageNumber);
    }
    redrawRail();
  }

  eventBus.on(
    "pagerendered",
    (evt: { pageNumber?: number }) => {
      if (typeof evt.pageNumber === "number") redrawPage(evt.pageNumber);
      redrawRail();
    },
    { signal },
  );
  eventBus.on("updateviewarea", redrawRail, { signal });
  eventBus.on("pagechanging", redrawRail, { signal });
  eventBus.on("scalechanging", () => {
    requestAnimationFrame(redrawRail);
  }, { signal });

  function onClick(e: MouseEvent): void {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (!target || target.closest("a, button, input, textarea, select, .relax-marker")) return;

    const pageEl = target.closest(".page") as HTMLElement | null;
    if (!pageEl) {
      onSelect(null);
      return;
    }
    const raw = pageEl.getAttribute("data-page-number");
    const pageNumber = raw == null ? NaN : Number.parseInt(raw, 10);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) return;

    const pageView = getPageView(viewer, pageNumber);
    if (!pageView) return;

    const border = borderWidths(pageEl);
    const box = pageEl.getBoundingClientRect();
    const x = e.clientX - box.left - border.left;
    const y = e.clientY - box.top - border.top;

    const annotations = data.byPage.get(pageNumber);
    if (annotations) {
      for (const annotation of annotations) {
        for (const segment of annotation.segments) {
          const rect = normalizedRectToViewport(pageView.viewport, segment.rect);
          if (
            x >= rect.left &&
            x <= rect.left + rect.width &&
            y >= rect.top &&
            y <= rect.top + rect.height
          ) {
            onSelect(annotation.id);
            return;
          }
        }
      }
    }
    onSelect(null);
  }

  container.addEventListener("click", onClick, true);

  return {
    setData(byPage, selectedId) {
      data.byPage = byPage;
      data.selectedId = selectedId;
      redrawAll();
    },
    redrawAll,
    dispose() {
      container.removeEventListener("click", onClick, true);
      rail.remove();
      for (const pageNumber of [...layers.keys()]) dropPage(pageNumber);
    },
  };
}
