import { useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { AnnotationLayer, TextLayer } from "pdfjs-dist";
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  PageViewport,
  RenderTask,
} from "../pdf/pdfjs";
import type { PdfLinkService } from "../pdf/linkService";
import { record } from "../diagnostics/recorder";
import {
  handleTextLayerCopy,
  registerTextLayer,
  unregisterTextLayer,
} from "../pdf/textSelection";

interface PdfPageProps {
  pdfDocument: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  registerPageRef?: (pageNumber: number, el: HTMLDivElement | null) => void;
  scrollRootRef?: RefObject<HTMLDivElement | null>;
  linkService?: PdfLinkService | null;
}

/**
 * A single rendered PDF page with the official PDF.js layer stack:
 *
 *   1. canvas              — page raster
 *   2. textLayer           — selectable text (TextLayer)
 *   3. annotationLayer     — native PDF annotations (links etc.)
 *   4. (future) custom overlay — Relax Note annotations (M2)
 */
export function PdfPage({
  pdfDocument,
  pageNumber,
  scale,
  registerPageRef,
  scrollRootRef,
  linkService,
}: PdfPageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const annotationLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const textLayerObjRef = useRef<TextLayer | null>(null);
  const annotationLayerObjRef = useRef<AnnotationLayer | null>(null);

  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    registerPageRef?.(pageNumber, rootRef.current);
    record("PAGE_MOUNT", { page: pageNumber });
    return () => {
      registerPageRef?.(pageNumber, null);
      record("PAGE_UNMOUNT", { page: pageNumber });
    };
  }, [pageNumber, registerPageRef]);

  useEffect(() => {
    let cancelled = false;
    setPage(null);
    setViewport(null);

    pdfDocument.getPage(pageNumber).then((loadedPage) => {
      if (!cancelled) setPage(loadedPage);
    });

    return () => {
      cancelled = true;
    };
  }, [pdfDocument, pageNumber]);

  useEffect(() => {
    if (page) {
      setViewport(page.getViewport({ scale }));
    }
  }, [page, scale]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setVisible(entry.isIntersecting);
          record("INTERSECTION_VISIBILITY", {
            page: pageNumber,
            isIntersecting: entry.isIntersecting,
            ratio: entry.intersectionRatio,
          });
        }
      },
      { root: scrollRootRef?.current ?? null, rootMargin: "800px 0px 800px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRootRef]);

  useEffect(() => {
    if (!visible || !viewport || !page) return;
    const canvas = canvasRef.current;
    const textContainer = textLayerRef.current;
    const annotationContainer = annotationLayerRef.current;
    if (!canvas || !textContainer || !annotationContainer) return;

    let disposed = false;
    record("PAGE_RENDER", { page: pageNumber, scale: viewport.scale });

    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (ctx) {
      const task = page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        transform:
          outputScale !== 1
            ? [outputScale, 0, 0, outputScale, 0, 0]
            : undefined,
      });
      renderTaskRef.current = task;
      task.promise.catch((err: unknown) => {
        if ((err as { name?: string })?.name === "RenderingCancelledException") {
          return;
        }
        console.warn(`Failed to render page ${pageNumber}:`, err);
      });
    }

    // Selection handling (mirrors PDF.js TextLayerBuilder).
    const onMouseDown = () => textContainer.classList.add("selecting");
    const onCopy = (event: ClipboardEvent) => handleTextLayerCopy(textContainer, event);
    textContainer.addEventListener("mousedown", onMouseDown);
    textContainer.addEventListener("copy", onCopy);

    // External links must never navigate the app webview itself.
    const onAnnotationClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const link = target.closest?.("a[data-external-link]") as HTMLAnchorElement | null;
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      linkService?.openExternal?.(link.href);
    };
    annotationContainer.addEventListener("click", onAnnotationClick);

    void (async () => {
      try {
        const textContent = await page.getTextContent();
        if (disposed) return;
        const textLayer = new TextLayer({
          textContentSource: textContent,
          container: textContainer,
          viewport,
        });
        textLayerObjRef.current = textLayer;
        textContainer.style.width = `${Math.floor(viewport.width)}px`;
        textContainer.style.height = `${Math.floor(viewport.height)}px`;
        await textLayer.render();
        if (disposed) return;

        const endOfContent = document.createElement("div");
        endOfContent.className = "endOfContent";
        textContainer.append(endOfContent);
        registerTextLayer(textContainer, endOfContent);
      } catch (err) {
        console.warn(`Failed to build text layer for page ${pageNumber}:`, err);
      }
    })();

    void (async () => {
      try {
        const annotations = await page.getAnnotations({ intent: "display" });
        if (disposed) return;
        if (annotations.length === 0) {
          annotationContainer.style.width = `${Math.floor(viewport.width)}px`;
          annotationContainer.style.height = `${Math.floor(viewport.height)}px`;
          return;
        }
        const annotationLayer = new AnnotationLayer({
          div: annotationContainer,
          accessibilityManager: undefined,
          annotationCanvasMap: undefined,
          annotationEditorUIManager: undefined,
          page,
          viewport: viewport.clone({ dontFlip: true }),
          structTreeLayer: undefined,
          commentManager: undefined,
          linkService: linkService ?? undefined,
          annotationStorage: undefined,
        });
        annotationLayerObjRef.current = annotationLayer;
        annotationContainer.style.width = `${Math.floor(viewport.width)}px`;
        annotationContainer.style.height = `${Math.floor(viewport.height)}px`;
        await annotationLayer.render({
          annotations,
          renderForms: false,
        } as unknown as Parameters<AnnotationLayer["render"]>[0]);
      } catch (err) {
        console.warn(`Failed to build annotation layer for page ${pageNumber}:`, err);
      }
    })();

    return () => {
      disposed = true;
      record("PAGE_RENDER_CLEANUP", { page: pageNumber, scale: viewport.scale });
      textContainer.removeEventListener("mousedown", onMouseDown);
      textContainer.removeEventListener("copy", onCopy);
      annotationContainer.removeEventListener("click", onAnnotationClick);
      unregisterTextLayer(textContainer);
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      textLayerObjRef.current?.cancel();
      textLayerObjRef.current = null;
      annotationLayerObjRef.current?.destroy();
      annotationLayerObjRef.current = null;
      textContainer.textContent = "";
      annotationContainer.textContent = "";
      const c = canvasRef.current;
      if (c) {
        c.width = 0;
        c.height = 0;
      }
    };
  }, [visible, viewport, page, pageNumber, linkService]);

  const style = viewport
    ? ({
        width: `${Math.floor(viewport.width)}px`,
        height: `${Math.floor(viewport.height)}px`,
        "--scale-factor": String(viewport.scale),
      } as CSSProperties)
    : ({ width: "100%", minHeight: "240px" } as CSSProperties);

  return (
    <div ref={rootRef} className="pdf-page" style={style}>
      <canvas ref={canvasRef} className="pdf-canvas" />
      <div ref={textLayerRef} className="textLayer" />
      <div ref={annotationLayerRef} className="annotationLayer" />
    </div>
  );
}
