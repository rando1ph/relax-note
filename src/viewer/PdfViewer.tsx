import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { EventBus, PDFViewer, ScrollMode } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import { openUrl } from "@tauri-apps/plugin-opener";
import { RelaxLinkService } from "../pdf/linkService";
import { attachPageOverlay } from "./overlay";
import type { PageOverlay } from "./overlay";
import type { ViewerHandle, ViewerProps } from "./types";

export type { ViewerHandle, ViewerProps };

/**
 * Relax Note's production PDF reader, built on the official PDF.js viewer
 * layer (pdfjs-dist@6.3.289). Paged-only: one logical page at a time via
 * `ScrollMode.PAGE`. Zoom, text selection, native links, page buffering and
 * deep-page navigation are all official `PDFViewer`/`PDFPageView` behavior.
 *
 * The only Relax Note-specific code here is the link-service subclass, the
 * external-link opener interceptor, and the (empty) annotation-overlay seam.
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
  },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerElRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFViewer | null>(null);
  const readyRef = useRef(false);

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

  useEffect(() => {
    const container = containerRef.current;
    const viewerEl = viewerElRef.current;
    if (!container || !viewerEl) return;

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

    let overlay: PageOverlay | null = null;
    const moveOverlayTo = (page: number) => {
      overlay?.detach();
      overlay = attachPageOverlay(viewer, eventBus, page);
    };

    eventBus.on(
      "pagechanging",
      (evt: { pageNumber: number }) => {
        onCurrentPageChangeRef.current(evt.pageNumber);
        moveOverlayTo(evt.pageNumber);
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

    // Page views are created asynchronously inside setDocument; everything
    // that touches getPageView()/page navigation waits for "pagesinit".
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
        moveOverlayTo(viewer.currentPageNumber);
      },
      { signal },
    );

    return () => {
      overlay?.detach();
      container.removeEventListener("click", onClick, true);
      ac.abort();
      // Runtime accepts null (destroys the view); the d.ts is too narrow.
      viewer.setDocument(null as unknown as never);
      viewerRef.current = null;
      viewerEl.replaceChildren();
    };
    // Deliberately NOT keyed on `scale`/`currentPage`: those are handled by
    // dedicated effects below. Including them rebuilds the whole viewer on
    // every zoom step / page change.
  }, [pdfDocument, pageCount]); // eslint-disable-line react-hooks/exhaustive-deps

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
    }),
    [zoomByWheel],
  );

  return (
    <div ref={rootRef} className="viewer-root">
      <div ref={containerRef} className="viewer-container">
        <div ref={viewerElRef} className="pdfViewer" />
      </div>
    </div>
  );
});
