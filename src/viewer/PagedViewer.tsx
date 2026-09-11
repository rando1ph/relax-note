import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { PdfPage } from "./PdfPage";
import { useBasePageSize } from "./useBasePageSize";
import { usePdfLinkService } from "../pdf/linkService";
import {
  actualSizeScale,
  defaultOpenScale,
  fitPageScale,
  fitWidthScale,
  zoomByWheel,
  zoomIn,
  zoomOut,
} from "./zoom";
import type { ViewerHandle, ViewerProps } from "./types";
import { PAGE_PADDING } from "./types";

export const PagedViewer = forwardRef<ViewerHandle, ViewerProps>(
  function PagedViewer(
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
    const containerRef = useRef<HTMLDivElement>(null);
    const baseSize = useBasePageSize(pdfDocument);
    const pendingRestoreRef = useRef<{ centerFraction: number } | null>(null);

    const linkService = usePdfLinkService(pdfDocument, pageCount, (page) => {
      onCurrentPageChange(page);
    });

    const applyZoom = useCallback(
      (newScale: number, viewportY?: number) => {
        const container = containerRef.current;
        if (newScale === scale) return;
        if (!container) {
          onScaleChange(newScale);
          return;
        }
        const anchorY = viewportY ?? container.clientHeight / 2;
        const docY = container.scrollTop + anchorY;
        const centerFraction = container.scrollHeight > 0 ? docY / container.scrollHeight : 0;
        pendingRestoreRef.current = { centerFraction };
        onScaleChange(newScale);
      },
      [scale, onScaleChange],
    );

    const zoomByWheelAt = useCallback(
      (deltaY: number, pointerClientY?: number) => {
        const container = containerRef.current;
        let viewportY: number | undefined;
        if (pointerClientY != null && container) {
          viewportY = pointerClientY - container.getBoundingClientRect().top;
        }
        applyZoom(zoomByWheel(scale, deltaY), viewportY);
      },
      [applyZoom, scale],
    );

    useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => applyZoom(zoomIn(scale)),
        zoomOut: () => applyZoom(zoomOut(scale)),
        zoomByWheel: (deltaY, pointerY) => zoomByWheelAt(deltaY, pointerY),
        actualSize: () => applyZoom(actualSizeScale()),
        fitPage: () => {
          const container = containerRef.current;
          if (container && baseSize) {
            applyZoom(
              fitPageScale(
                container.clientWidth,
                container.clientHeight,
                baseSize.width,
                baseSize.height,
                PAGE_PADDING * 2,
              ),
            );
          }
        },
        fitWidth: () => {
          const container = containerRef.current;
          if (container && baseSize) {
            applyZoom(fitWidthScale(container.clientWidth, baseSize.width, PAGE_PADDING * 2));
          }
        },
      }),
      [applyZoom, zoomByWheelAt, scale, baseSize],
    );

    useEffect(() => {
      if (!needsAutoFit || !baseSize) return;
      const container = containerRef.current;
      if (!container) return;
      const fit = defaultOpenScale(
        container.clientWidth,
        container.clientHeight,
        baseSize.width,
        baseSize.height,
        PAGE_PADDING * 2,
      );
      if (fit > 0 && fit !== scale) onScaleChange(fit);
    }, [needsAutoFit, baseSize, scale, onScaleChange]);

    // Reset to the top when the active page changes (explicit navigation only).
    useEffect(() => {
      const el = containerRef.current;
      if (el) el.scrollTop = 0;
    }, [currentPage]);

    // Restore the in-page scroll position after a zoom.
    useEffect(() => {
      const pending = pendingRestoreRef.current;
      if (!pending) return;
      const container = containerRef.current;
      if (!container) {
        pendingRestoreRef.current = null;
        return;
      }
      let frame = 0;
      const apply = () => {
        const target = pending.centerFraction * container.scrollHeight - container.clientHeight / 2;
        container.scrollTop = Math.max(0, target);
        frame += 1;
        if (frame < 3) {
          requestAnimationFrame(apply);
        } else {
          pendingRestoreRef.current = null;
        }
      };
      requestAnimationFrame(apply);
    }, [scale]);

    return (
      <div ref={containerRef} className="viewer paged">
        <div className="paged-page-wrap">
          <PdfPage
            key={currentPage}
            pdfDocument={pdfDocument}
            pageNumber={currentPage}
            scale={scale}
            scrollRootRef={containerRef}
            linkService={linkService}
          />
        </div>
      </div>
    );
  },
);
