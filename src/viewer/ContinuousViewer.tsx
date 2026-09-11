import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { PdfPage } from "./PdfPage";
import { useBasePageSize } from "./useBasePageSize";
import { usePdfLinkService } from "../pdf/linkService";
import {
  beginZoomTxn,
  endZoomTxn,
  hasRecentZoomActivity,
  record,
} from "../diagnostics/recorder";
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
import { PAGE_MARGIN, PAGE_PADDING } from "./types";

/**
 * Zoom transaction model (single-owner / latest-wins):
 *
 * Every zoom command bumps a generation counter. The previous generation's
 * settle loop is cancelled and every async callback (ResizeObserver, rAF
 * samples, safety timeout) verifies it is still the active generation before
 * touching any state. Only the active generation may restore scroll, end the
 * zooming state or re-enable current-page detection.
 *
 * Stability is measured geometry convergence, never "the observer did not
 * fire": the anchor page rect and the page-stack scrollHeight are sampled on
 * rAF and must stay within tolerance for GRACE_MS before the transaction can
 * finish as "stable". A container ResizeObserver (which catches preceding
 * pages resizing) restarts the grace period. A safety timeout always finishes
 * with a final measured restore and is reported as "timeout", never "stable".
 */

interface ZoomAnchor {
  gen: number;
  page: number;
  withinPage: number;
  viewportY: number;
  txnId: string;
}

interface ZoomGeometry {
  top: number;
  height: number;
  scrollHeight: number;
}

interface ZoomController {
  generation: number;
  pending: ZoomAnchor | null;
  observer: ResizeObserver | null;
  raf: number;
  safetyTimer: number;
  lastGeo: ZoomGeometry | null;
  lastChangeAt: number;
  startedAt: number;
}

const TOLERANCE_PX = 2;
const GRACE_MS = 400;
const SAFETY_TIMEOUT_MS = 2500;
/**
 * Rapid successive zoom commands form one gesture: the logical DOM anchor is
 * captured once and reused, so that a second zoom arriving while the layout
 * is still transitioning cannot re-capture a drifted anchor (the old
 * scrollTop now points at a different page once the page stack has resized).
 */
const GESTURE_WINDOW_MS = 500;

interface GestureAnchor {
  page: number;
  withinPage: number;
  viewportY: number;
  at: number;
}

export const ContinuousViewer = forwardRef<ViewerHandle, ViewerProps>(
  function ContinuousViewer(
    {
      pdfDocument,
      pageCount,
      scale,
      currentPage,
      needsAutoFit,
      initialScrollOffset,
      onScaleChange,
      onCurrentPageChange,
      onScrollOffsetChange,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const pageElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
    const baseSize = useBasePageSize(pdfDocument);
    const internalPageRef = useRef(currentPage);
    const onCurrentPageChangeRef = useRef(onCurrentPageChange);
    const onScrollOffsetChangeRef = useRef(onScrollOffsetChange);
    const onScaleChangeRef = useRef(onScaleChange);
    const scaleRef = useRef(scale);
    const zoomingRef = useRef(false);
    const gestureRef = useRef<GestureAnchor | null>(null);
    const zoomCtrlRef = useRef<ZoomController>({
      generation: 0,
      pending: null,
      observer: null,
      raf: 0,
      safetyTimer: 0,
      lastGeo: null,
      lastChangeAt: 0,
      startedAt: 0,
    });

    onScaleChangeRef.current = onScaleChange;
    scaleRef.current = scale;

    useEffect(() => {
      onCurrentPageChangeRef.current = onCurrentPageChange;
      onScrollOffsetChangeRef.current = onScrollOffsetChange;
    }, [onCurrentPageChange, onScrollOffsetChange]);

    const linkService = usePdfLinkService(pdfDocument, pageCount, (page) => {
      onCurrentPageChangeRef.current(page);
    });

    const registerPageRef = useCallback(
      (pageNumber: number, el: HTMLDivElement | null) => {
        if (el) pageElsRef.current.set(pageNumber, el);
        else pageElsRef.current.delete(pageNumber);
      },
      [],
    );

    const scrollToPage = useCallback(
      (page: number, offset: number) => {
        const container = containerRef.current;
        if (!container) return;
        const target = Math.min(Math.max(1, page), pageCount);
        const el = pageElsRef.current.get(target);

        if (el && el.style.height) {
          const containerRect = container.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const top = elRect.top - containerRect.top + container.scrollTop;
          container.scrollTo({ top: Math.max(0, top + offset * elRect.height) });
          return;
        }

        if (baseSize) {
          const pageStep = baseSize.height * scale + PAGE_MARGIN;
          const top =
            PAGE_MARGIN + (target - 1) * pageStep + offset * baseSize.height * scale;
          container.scrollTo({ top: Math.max(0, top) });
        }
      },
      [baseSize, pageCount, scale],
    );

    const scrollToPageRef = useRef(scrollToPage);
    scrollToPageRef.current = scrollToPage;

    const recomputeCurrentPage = useCallback(() => {
      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const reference = container.scrollTop + container.clientHeight * 0.2;
      let found = 1;
      let pageTop = 0;
      let pageHeight = 0;
      const candidates: { page: number; top: number; bottom: number }[] = [];
      for (const [num, el] of pageElsRef.current) {
        const elRect = el.getBoundingClientRect();
        const top = elRect.top - containerRect.top + container.scrollTop;
        candidates.push({
          page: num,
          top: Math.round(top),
          bottom: Math.round(top + elRect.height),
        });
        if (top + elRect.height >= reference) {
          found = num;
          pageTop = top;
          pageHeight = elRect.height;
          break;
        }
      }
      const prev = internalPageRef.current;
      const suppressed = zoomingRef.current;
      if (!suppressed && found !== prev) {
        internalPageRef.current = found;
        onCurrentPageChangeRef.current(found);
      }
      if (pageHeight > 0) {
        const offset = Math.min(1, Math.max(0, (container.scrollTop - pageTop) / pageHeight));
        onScrollOffsetChangeRef.current(offset);
      }
      if (hasRecentZoomActivity()) {
        record("INTERSECTION_UPDATE", {
          suppressed,
          prevCurrentPage: prev,
          proposedCurrentPage: found,
          committedCurrentPage: internalPageRef.current,
          reference: Math.round(reference),
          candidates: candidates.slice(0, 6),
        });
      }
    }, []);

    // ---------------- Zoom controller (generation-based) ----------------

    const cancelSettling = useCallback(() => {
      const c = zoomCtrlRef.current;
      if (c.observer) {
        c.observer.disconnect();
        c.observer = null;
      }
      if (c.raf) {
        cancelAnimationFrame(c.raf);
        c.raf = 0;
      }
      if (c.safetyTimer) {
        window.clearTimeout(c.safetyTimer);
        c.safetyTimer = 0;
      }
      c.lastGeo = null;
    }, []);

    const measureAnchorGeometry = useCallback((page: number): ZoomGeometry | null => {
      const container = containerRef.current;
      const el = pageElsRef.current.get(page);
      if (!container || !el || !el.style.height) return null;
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      return {
        top: elRect.top - containerRect.top + container.scrollTop,
        height: elRect.height,
        scrollHeight: container.scrollHeight,
      };
    }, []);

    const restoreAnchor = useCallback(
      (pending: ZoomAnchor): ZoomGeometry | null => {
        const container = containerRef.current;
        if (!container) return null;
        const geo = measureAnchorGeometry(pending.page);
        if (!geo) return null;
        const target = geo.top + pending.withinPage * geo.height - pending.viewportY;
        const prev = container.scrollTop;
        container.scrollTop = Math.max(0, target);
        const delta = container.scrollTop - prev;
        if (Math.abs(delta) > 0.5) {
          record("ANCHOR_RESTORE", {
            zoomTxnId: pending.txnId,
            anchorPageTop: Math.round(geo.top),
            pageHeight: Math.round(geo.height),
            withinPage: pending.withinPage,
            logicalPointY: Math.round(geo.top + pending.withinPage * geo.height),
            targetViewportY: Math.round(pending.viewportY),
            prevScrollTop: Math.round(prev),
            requestedScrollTop: Math.round(target),
            actualScrollTop: Math.round(container.scrollTop),
            delta: Math.round(delta),
          });
        }
        return geo;
      },
      [measureAnchorGeometry],
    );

    const finishZoom = useCallback(
      (gen: number, reason: string) => {
        const c = zoomCtrlRef.current;
        if (gen !== c.generation) return; // stale generation: never touches state
        const pending = c.pending;
        if (!pending || pending.gen !== gen) return;

        // Final measured anchor restoration before releasing suppression.
        const geo = restoreAnchor(pending);
        let anchorError: number | null = null;
        if (geo) {
          const container = containerRef.current;
          if (container) {
            const desiredDocY = geo.top + pending.withinPage * geo.height;
            const actualDocY = container.scrollTop + pending.viewportY;
            anchorError = Math.round(desiredDocY - actualDocY);
          }
        }

        record("ZOOM_SETTLE_CHECK", {
          zoomTxnId: pending.txnId,
          geometry: geo
            ? { top: Math.round(geo.top), height: Math.round(geo.height) }
            : null,
          stableForMs: Math.round(performance.now() - c.lastChangeAt),
          reason,
        });
        record("ZOOM_END", {
          zoomTxnId: pending.txnId,
          finalScale: scaleRef.current,
          finalCurrentPage: internalPageRef.current,
          finalScrollTop: Math.round(containerRef.current?.scrollTop ?? 0),
          anchorFinalRect: geo
            ? { top: Math.round(geo.top), height: Math.round(geo.height) }
            : null,
          finalAnchorError: anchorError,
          settleReason: reason,
        });
        endZoomTxn(pending.txnId);
        cancelSettling();
        c.pending = null;
        zoomingRef.current = false;
        recomputeCurrentPage();
      },
      [cancelSettling, recomputeCurrentPage, restoreAnchor],
    );

    const stepSample = useCallback(
      (gen: number) => {
        const c = zoomCtrlRef.current;
        if (gen !== c.generation || !c.pending || c.pending.gen !== gen) return; // stale
        const pending = c.pending;

        const geo = restoreAnchor(pending);
        const now = performance.now();

        if (geo) {
          const prev = c.lastGeo;
          if (
            prev &&
            Math.abs(geo.top - prev.top) <= TOLERANCE_PX &&
            Math.abs(geo.height - prev.height) <= TOLERANCE_PX &&
            Math.abs(geo.scrollHeight - prev.scrollHeight) <= TOLERANCE_PX
          ) {
            // geometry unchanged this frame
          } else {
            c.lastChangeAt = now;
            if (prev) {
              record("GEOMETRY_SAMPLE", {
                zoomTxnId: pending.txnId,
                prevTop: Math.round(prev.top),
                top: Math.round(geo.top),
                prevHeight: Math.round(prev.height),
                height: Math.round(geo.height),
                prevScrollHeight: Math.round(prev.scrollHeight),
                scrollHeight: Math.round(geo.scrollHeight),
              });
            }
          }
          c.lastGeo = geo;
        }

        if (now - c.lastChangeAt >= GRACE_MS) {
          finishZoom(gen, "stable");
          return;
        }
        if (now - c.startedAt >= SAFETY_TIMEOUT_MS) {
          finishZoom(gen, "timeout");
          return;
        }
        c.raf = requestAnimationFrame(() => stepSample(gen));
      },
      [finishZoom, restoreAnchor],
    );

    const startSettling = useCallback(
      (gen: number) => {
        const c = zoomCtrlRef.current;
        cancelSettling();
        const now = performance.now();
        c.lastChangeAt = now;
        c.startedAt = now;

        // The container (page stack) is observed so that ANY page resizing —
        // including preceding pages shifting the anchor — restarts the grace
        // period. Observing only the anchor page is insufficient.
        const content = contentRef.current;
        if (content) {
          c.observer = new ResizeObserver(() => {
            if (gen !== zoomCtrlRef.current.generation) return; // stale
            zoomCtrlRef.current.lastChangeAt = performance.now();
            zoomCtrlRef.current.lastGeo = null;
            record("RESIZE_OBSERVER", {
              zoomTxnId: zoomCtrlRef.current.pending?.txnId ?? null,
              containerScrollHeight: Math.round(containerRef.current?.scrollHeight ?? 0),
            });
          });
          c.observer.observe(content);
        }

        c.raf = requestAnimationFrame(() => stepSample(gen));
        c.safetyTimer = window.setTimeout(() => {
          if (gen !== zoomCtrlRef.current.generation) return; // stale
          finishZoom(gen, "timeout");
        }, SAFETY_TIMEOUT_MS);
      },
      [cancelSettling, finishZoom, stepSample],
    );

    // Apply a zoom while preserving the logical reading anchor, measured from
    // the actual DOM geometry. Each call supersedes the previous transaction.
    // Rapid successive zoom commands reuse the previously captured anchor
    // (one gesture) so a mid-transition re-capture cannot drift.
    const applyZoom = useCallback(
      (newScale: number, viewportY?: number, source = "command") => {
        const container = containerRef.current;
        if (!container) {
          onScaleChangeRef.current(newScale);
          return;
        }
        const now = performance.now();
        let anchorY = viewportY ?? container.clientHeight / 2;
        const containerRect = container.getBoundingClientRect();

        let anchorPage: number;
        let withinPage: number;
        let anchorSource: "fresh" | "reused";
        const gesture = gestureRef.current;

        if (gesture && now - gesture.at < GESTURE_WINDOW_MS) {
          anchorPage = gesture.page;
          withinPage = gesture.withinPage;
          anchorY = gesture.viewportY;
          anchorSource = "reused";
        } else {
          const docY = container.scrollTop + anchorY;
          // Find the page whose element actually contains the anchor point.
          anchorPage = 1;
          let pageTop = 0;
          let pageHeight = 0;
          for (const [num, el] of pageElsRef.current) {
            const elRect = el.getBoundingClientRect();
            const top = elRect.top - containerRect.top + container.scrollTop;
            const h = elRect.height;
            if (docY < top) break;
            anchorPage = num;
            pageTop = top;
            pageHeight = h;
            if (docY <= top + h) break;
          }
          withinPage =
            pageHeight > 0
              ? Math.min(1, Math.max(0, (docY - pageTop) / pageHeight))
              : 0;
          anchorSource = "fresh";
        }
        gestureRef.current = { page: anchorPage, withinPage, viewportY: anchorY, at: now };

        const c = zoomCtrlRef.current;
        c.generation += 1;
        const gen = c.generation;
        const txnId = beginZoomTxn();
        c.pending = { gen, page: anchorPage, withinPage, viewportY: anchorY, txnId };
        zoomingRef.current = true;

        record("ZOOM_BEGIN", {
          zoomTxnId: txnId,
          gen,
          oldScale: scaleRef.current,
          requestedNewScale: newScale,
          source,
          anchorSource,
          pointerY: viewportY ?? null,
          viewportAnchorY: Math.round(anchorY),
          scrollTopBefore: Math.round(container.scrollTop),
          currentPageBefore: internalPageRef.current,
        });
        record("ANCHOR_CAPTURE", {
          zoomTxnId: txnId,
          gen,
          anchorSource,
          anchorPage,
          withinPage,
          desiredViewportY: Math.round(anchorY),
          scrollTopBefore: Math.round(container.scrollTop),
          currentPageBefore: internalPageRef.current,
        });

        const pages: { page: number; top: number; height: number }[] = [];
        for (let p = anchorPage - 2; p <= anchorPage + 2; p++) {
          const el = pageElsRef.current.get(p);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          pages.push({
            page: p,
            top: Math.round(r.top - containerRect.top + container.scrollTop),
            height: Math.round(r.height),
          });
        }
        record("PAGE_GEOMETRY_SNAPSHOT_BEFORE", { zoomTxnId: txnId, gen, pages });

        if (newScale !== scaleRef.current) {
          onScaleChangeRef.current(newScale);
        }
        startSettling(gen);
      },
      [startSettling],
    );

    const zoomByWheelAt = useCallback(
      (deltaY: number, pointerClientY?: number) => {
        const container = containerRef.current;
        let viewportY: number | undefined;
        if (pointerClientY != null && container) {
          viewportY = pointerClientY - container.getBoundingClientRect().top;
        }
        applyZoom(zoomByWheel(scaleRef.current, deltaY), viewportY, "ctrl-wheel");
      },
      [applyZoom],
    );

    useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => applyZoom(zoomIn(scaleRef.current), undefined, "zoom-in"),
        zoomOut: () => applyZoom(zoomOut(scaleRef.current), undefined, "zoom-out"),
        zoomByWheel: (deltaY, pointerY) => zoomByWheelAt(deltaY, pointerY),
        actualSize: () => applyZoom(actualSizeScale(), undefined, "actual-size"),
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
              undefined,
              "fit-page",
            );
          }
        },
        fitWidth: () => {
          const container = containerRef.current;
          if (container && baseSize) {
            applyZoom(
              fitWidthScale(container.clientWidth, baseSize.width, PAGE_PADDING * 2),
              undefined,
              "fit-width",
            );
          }
        },
      }),
      [applyZoom, zoomByWheelAt, baseSize],
    );

    // Tear down any active settle loop on unmount.
    useEffect(() => () => cancelSettling(), [cancelSettling]);

    // Auto-fit on first render when no stored zoom exists.
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

    // Restore the initial position once the base page size is known.
    const restoredRef = useRef(false);
    useEffect(() => {
      if (restoredRef.current || !baseSize) return;
      restoredRef.current = true;
      internalPageRef.current = currentPage;
      if (currentPage > 1 || initialScrollOffset > 0) {
        scrollToPageRef.current(currentPage, initialScrollOffset);
      }
    }, [baseSize, currentPage, initialScrollOffset]);

    // React to external page navigation (menu, toolbar, outline, thumbnails).
    useEffect(() => {
      if (currentPage !== internalPageRef.current && !zoomingRef.current) {
        internalPageRef.current = currentPage;
        scrollToPageRef.current(currentPage, 0);
      }
    }, [currentPage]);

    // Diagnostic: record when the scale prop actually commits.
    useEffect(() => {
      record("SCALE_APPLIED", {
        newScale: scale,
        scrollTopImmediate: Math.round(containerRef.current?.scrollTop ?? 0),
      });
    }, [scale]);

    // Derive the current page + offset from the scroll position.
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let raf = 0;
      const handleScroll = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (hasRecentZoomActivity()) {
            record("SCROLL", {
              scrollTop: Math.round(container.scrollTop),
              suppressed: zoomingRef.current,
            });
          }
          if (zoomingRef.current) return;
          recomputeCurrentPage();
        });
      };

      container.addEventListener("scroll", handleScroll, { passive: true });
      return () => {
        container.removeEventListener("scroll", handleScroll);
        if (raf) cancelAnimationFrame(raf);
      };
    }, [recomputeCurrentPage]);

    return (
      <div ref={containerRef} className="viewer">
        <div ref={contentRef} className="viewer-content">
          {Array.from({ length: pageCount }, (_, i) => (
            <PdfPage
              key={i + 1}
              pdfDocument={pdfDocument}
              pageNumber={i + 1}
              scale={scale}
              registerPageRef={registerPageRef}
              scrollRootRef={containerRef}
              linkService={linkService}
            />
          ))}
        </div>
      </div>
    );
  },
);
