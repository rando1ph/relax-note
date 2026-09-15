import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  EventBus,
  PDFViewer,
  RenderingStates,
  ScrollMode,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import { openUrl } from "@tauri-apps/plugin-opener";
import { RelaxLinkService } from "../pdf/linkService";
import { normalizedRectToViewport } from "../pdf/coordinates";
import type { NormalizedRect } from "../pdf/types";
import type { SelectionSnapshot } from "../annotations/selection";
import { captureSelection } from "../annotations/selection";
import { createAnnotationOverlay, getPageView } from "./annotationOverlay";
import type { AnnotationOverlayController } from "./annotationOverlay";
import type { ViewerHandle, ViewerProps } from "./types";

export type { ViewerHandle, ViewerProps };

/**
 * Relax Note's production PDF reader, built on the official PDF.js viewer
 * layer (pdfjs-dist@6.3.289). Paged-only. Annotation overlays are Relax
 * Note-owned and rendered by an imperative overlay controller that survives
 * `PDFPageView.reset()` via the official `pagerendered`/`updateviewarea` seams.
 */

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(lo, n), hi);

export const PdfViewer = forwardRef<ViewerHandle, ViewerProps>(function PdfViewer(
  {
    pdfDocument,
    pageCount,
    scale,
    currentPage,
    needsAutoFit,
    onScaleChange,
    onCurrentPageChange,
    annotationsByPage,
    selectedAnnotationId,
    onSelectAnnotation,
    onCreateHighlight,
    onCreateVocabulary,
    onAskAi,
  },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerElRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFViewer | null>(null);
  const readyRef = useRef(false);
  const overlayRef = useRef<AnnotationOverlayController | null>(null);

  const onScaleChangeRef = useRef(onScaleChange);
  const onCurrentPageChangeRef = useRef(onCurrentPageChange);
  const currentPageRef = useRef(currentPage);
  const needsAutoFitRef = useRef(needsAutoFit);
  const scaleRef = useRef(scale);
  onScaleChangeRef.current = onScaleChange;
  onCurrentPageChangeRef.current = onCurrentPageChange;
  currentPageRef.current = currentPage;
  needsAutoFitRef.current = needsAutoFit;
  scaleRef.current = scale;

  const annotationsByPageRef = useRef(annotationsByPage);
  const selectedAnnotationIdRef = useRef(selectedAnnotationId);
  const onSelectAnnotationRef = useRef(onSelectAnnotation);
  const onCreateHighlightRef = useRef(onCreateHighlight);
  const onCreateVocabularyRef = useRef(onCreateVocabulary);
  const onAskAiRef = useRef(onAskAi);
  annotationsByPageRef.current = annotationsByPage;
  selectedAnnotationIdRef.current = selectedAnnotationId;
  onSelectAnnotationRef.current = onSelectAnnotation;
  onCreateHighlightRef.current = onCreateHighlight;
  onCreateVocabularyRef.current = onCreateVocabulary;
  onAskAiRef.current = onAskAi;

  // Ephemeral selection snapshot + floating action position.
  const [snapshot, setSnapshot] = useState<SelectionSnapshot | null>(null);
  const [button, setButton] = useState<{ left: number; top: number } | null>(null);
  const snapshotRef = useRef<SelectionSnapshot | null>(null);
  snapshotRef.current = snapshot;

  useEffect(() => {
    const container = containerRef.current;
    const viewerEl = viewerElRef.current;
    const rootEl = rootRef.current;
    if (!container || !viewerEl || !rootEl) return;

    const eventBus = new EventBus();
    const linkService = new RelaxLinkService({ eventBus });
    const ac = new AbortController();
    const { signal } = ac;
    const viewer = new PDFViewer({
      container,
      viewer: viewerEl,
      eventBus,
      linkService,
      // Releases the viewer's ResizeObserver + scroll watcher on teardown
      // (StrictMode double-mount otherwise leaks them onto the container).
      // Present at runtime; missing from the shipped d.ts.
      abortSignal: signal,
    } as unknown as ConstructorParameters<typeof PDFViewer>[0]);
    viewerRef.current = viewer;
    readyRef.current = false;
    viewer.scrollMode = ScrollMode.PAGE;

    // --- official events -> Relax Note reader state ----------------------
    eventBus.on(
      "scalechanging",
      (evt: { scale: number }) => onScaleChangeRef.current(evt.scale),
      { signal },
    );

    eventBus.on(
      "pagechanging",
      (evt: { pageNumber: number }) => {
        onCurrentPageChangeRef.current(evt.pageNumber);
      },
      { signal },
    );

    eventBus.on(
      "updateviewarea",
      (evt: { location: { pageNumber: number } | null }) => {
        if (evt.location) onCurrentPageChangeRef.current(evt.location.pageNumber);
      },
      { signal },
    );

    // --- annotation overlay (imperative) ---------------------------------
    overlayRef.current = createAnnotationOverlay({
      viewer,
      eventBus,
      container,
      root: rootEl,
      onSelect: (id) => onSelectAnnotationRef.current(id),
      signal,
    });
    overlayRef.current.setData(
      annotationsByPageRef.current,
      selectedAnnotationIdRef.current,
    );

    // --- selection snapshot lifecycle ------------------------------------
    // Captures geometry immediately when a PDF text selection completes, so
    // interacting with the floating button (which can collapse the Selection)
    // never loses it. `pointerdown` on the button is prevented to keep the
    // selection alive until the click consumes the snapshot.
    let raf = 0;
    const onSelectionChange = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const selection = window.getSelection();
        const snap = captureSelection((p) => getPageView(viewer, p), selection);
        if (snap) {
          snapshotRef.current = snap;
          setSnapshot(snap);
          const range = selection?.getRangeAt(0);
          const rects = range?.getClientRects() ?? ([] as unknown as DOMRectList);
          const last = rects[rects.length - 1];
          const root = rootRef.current;
          if (last && root) {
            const r = root.getBoundingClientRect();
            setButton({ left: last.right - r.left, top: last.bottom - r.top });
          } else {
            setButton(null);
          }
        } else {
          snapshotRef.current = null;
          setSnapshot(null);
          setButton(null);
        }
      });
    };
    document.addEventListener("selectionchange", onSelectionChange);

    // --- external links -> Tauri opener (webview must never navigate) ----
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const link = target?.closest?.("a[data-external-link]") as HTMLAnchorElement | null;
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      if (link.href) void openUrl(link.href).catch(() => undefined);
    };
    container.addEventListener("click", onClick, true);

    // --- document ---------------------------------------------------------
    linkService.setDocument(pdfDocument);
    linkService.setViewer(viewer);
    viewer.currentScaleValue = String(scaleRef.current);
    viewer.setDocument(pdfDocument);

    eventBus.on(
      "pagesinit",
      () => {
        readyRef.current = true;
        const target = clamp(currentPageRef.current, 1, pageCount);
        if (viewer.currentPageNumber !== target) {
          viewer.currentPageNumber = target;
        }
        if (needsAutoFitRef.current) {
          viewer.currentScaleValue = "page-fit";
        }
        overlayRef.current?.redrawAll();
      },
      { signal },
    );

    return () => {
      overlayRef.current?.dispose();
      overlayRef.current = null;
      document.removeEventListener("selectionchange", onSelectionChange);
      if (raf) cancelAnimationFrame(raf);
      container.removeEventListener("click", onClick, true);
      ac.abort();
      // Runtime accepts null (destroys the view); the d.ts is too narrow.
      viewer.setDocument(null as unknown as never);
      viewerRef.current = null;
      viewerEl.replaceChildren();
    };
    // Deliberately NOT keyed on `scale`/`currentPage`: those are handled by
    // dedicated effects below. Annotation data is pushed via the ref/effect.
  }, [pdfDocument, pageCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push annotation data to the imperative overlay when it changes.
  useEffect(() => {
    overlayRef.current?.setData(annotationsByPage, selectedAnnotationId);
  }, [annotationsByPage, selectedAnnotationId]);

  // External page navigation (toolbar input, outline, thumbnails, PageUp/Down).
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.pdfDocument || !readyRef.current) return;
    if (currentPage === viewer.currentPageNumber) return;
    viewer.currentPageNumber = currentPage;
  }, [currentPage, pdfDocument]);

  // Ctrl+wheel zoom — official updateScale with pointer origin and delayed
  // redraw. deltaY is in "ticks" (one notch = 1.1x); negative = zoom in.
  const zoomByWheel = useCallback(
    (deltaY: number, clientX?: number, clientY?: number) => {
      const viewer = viewerRef.current;
      const container = containerRef.current;
      if (!viewer || !viewer.pdfDocument || !container) return;
      if (Math.abs(deltaY) < 0.05) return;

      const scaleFactor = Math.pow(1.1, -deltaY);
      const rect = container.getBoundingClientRect();
      const origin = [
        (clientX ?? rect.left + rect.width / 2) - rect.left + container.offsetLeft,
        (clientY ?? rect.top + rect.height / 2) - rect.top + container.offsetTop,
      ];
      viewer.updateScale({ scaleFactor, origin, drawingDelay: 400 });
    },
    [],
  );

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    snapshotRef.current = null;
    setSnapshot(null);
    setButton(null);
  }, []);

  const consumeHighlight = useCallback(() => {
    const snap = snapshotRef.current;
    if (!snap) return;
    onCreateHighlightRef.current(snap);
    clearSelection();
  }, [clearSelection]);

  const consumeVocabulary = useCallback(() => {
    const snap = snapshotRef.current;
    if (!snap) return;
    onCreateVocabularyRef.current(snap);
    clearSelection();
  }, [clearSelection]);

  const consumeAskAi = useCallback(() => {
    const snap = snapshotRef.current;
    if (!snap) return;
    onAskAiRef.current(snap);
    clearSelection();
  }, [clearSelection]);

  const highlightSelection = useCallback((): boolean => {
    const viewer = viewerRef.current;
    const snap =
      snapshotRef.current ??
      (viewer ? captureSelection((p) => getPageView(viewer, p)) : null);
    if (!snap) return false;
    onCreateHighlightRef.current(snap);
    window.getSelection()?.removeAllRanges();
    snapshotRef.current = null;
    setSnapshot(null);
    setButton(null);
    return true;
  }, []);

  const scrollToSegment = useCallback((pageNumber: number, rect: NormalizedRect) => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.pdfDocument) return;

    const doScroll = () => {
      const pageView = getPageView(viewer, pageNumber);
      if (!pageView) return;
      const vp = normalizedRectToViewport(pageView.viewport, rect);
      const [xPdf, yPdf] = pageView.viewport.convertToPdfPoint(vp.left, vp.top);
      viewer.scrollPageIntoView({
        pageNumber,
        destArray: [null, { name: "XYZ" }, xPdf, yPdf, null],
        ignoreDestinationZoom: true,
        center: "vertical",
      });
    };

    if (viewer.currentPageNumber !== pageNumber) {
      viewer.currentPageNumber = pageNumber;
    }

    const raw = viewer.getPageView(pageNumber - 1) as
      | { pdfPage?: unknown; renderingState?: number }
      | null;
    if (raw?.pdfPage && raw.renderingState === RenderingStates.FINISHED) {
      doScroll();
      return;
    }

    const handler = (evt: { pageNumber?: number }) => {
      if (evt.pageNumber === pageNumber) {
        viewer.eventBus.off("pagerendered", handler);
        doScroll();
      }
    };
    viewer.eventBus.on("pagerendered", handler);
    window.setTimeout(() => viewer.eventBus.off("pagerendered", handler), 5000);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => viewerRef.current?.increaseScale(),
      zoomOut: () => viewerRef.current?.decreaseScale(),
      zoomByWheel,
      actualSize: () => {
        const viewer = viewerRef.current;
        if (viewer?.pdfDocument) viewer.currentScaleValue = "page-actual";
      },
      fitPage: () => {
        const viewer = viewerRef.current;
        if (viewer?.pdfDocument) viewer.currentScaleValue = "page-fit";
      },
      fitWidth: () => {
        const viewer = viewerRef.current;
        if (viewer?.pdfDocument) viewer.currentScaleValue = "page-width";
      },
      highlightSelection,
      scrollToSegment,
    }),
    [zoomByWheel, highlightSelection, scrollToSegment],
  );

  return (
    <div ref={rootRef} className="viewer-root">
      <div ref={containerRef} className="viewer-container">
        <div ref={viewerElRef} className="pdfViewer" />
      </div>
      {button && snapshot ? (
        <div
          className="relax-floating-actions"
          style={{ left: button.left, top: button.top }}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button type="button" className="relax-floating-action" onClick={consumeHighlight}>
            Highlight
          </button>
          <button
            type="button"
            className="relax-floating-action relax-floating-vocabulary"
            onClick={consumeVocabulary}
          >
            Vocabulary
          </button>
          <button
            type="button"
            className="relax-floating-action relax-floating-ask"
            onClick={consumeAskAi}
          >
            Ask AI
          </button>
        </div>
      ) : null}
    </div>
  );
});
