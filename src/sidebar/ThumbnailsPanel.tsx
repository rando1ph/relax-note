import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "../pdf/pdfjs";
import { useBasePageSize } from "../viewer/useBasePageSize";
import { PdfThumbnail } from "../viewer/PdfThumbnail";

interface ThumbnailsPanelProps {
  pdfDocument: PDFDocumentProxy;
  pageCount: number;
  currentPage: number;
  onNavigate: (page: number) => void;
}

const THUMB_WIDTH = 132;
const GAP = 10;
const BUFFER = 6;

export function ThumbnailsPanel({
  pdfDocument,
  pageCount,
  currentPage,
  onNavigate,
}: ThumbnailsPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const baseSize = useBasePageSize(pdfDocument);
  const [range, setRange] = useState({ start: 1, end: 0 });

  const itemHeight =
    Math.round(THUMB_WIDTH * ((baseSize?.height ?? 0) / (baseSize?.width ?? 1))) + GAP;

  const updateRange = useCallback(() => {
    const el = rootRef.current;
    if (!el || itemHeight <= 0) return;
    const first = Math.floor(el.scrollTop / itemHeight) + 1;
    const last = Math.ceil((el.scrollTop + el.clientHeight) / itemHeight);
    const start = Math.max(1, first - BUFFER);
    const end = Math.min(pageCount, last + BUFFER);
    setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
  }, [itemHeight, pageCount]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    updateRange();
    el.addEventListener("scroll", updateRange, { passive: true });
    const ro = new ResizeObserver(updateRange);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateRange);
      ro.disconnect();
    };
  }, [updateRange]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || itemHeight <= 0) return;
    const top = (currentPage - 1) * itemHeight;
    if (top < el.scrollTop || top + itemHeight > el.scrollTop + el.clientHeight) {
      el.scrollTop = top;
    }
  }, [currentPage, itemHeight]);

  if (!baseSize) {
    return <div className="panel-empty">Loading…</div>;
  }

  const slots = [];
  for (let p = range.start; p <= range.end; p++) {
    slots.push(
      <div
        key={p}
        className="thumb-slot"
        style={{ position: "absolute", top: (p - 1) * itemHeight, left: 0, right: 0 }}
      >
        <PdfThumbnail
          pdfDocument={pdfDocument}
          pageNumber={p}
          thumbWidth={THUMB_WIDTH}
          pageWidth={baseSize.width}
          pageHeight={baseSize.height}
          active={p === currentPage}
          onClick={() => onNavigate(p)}
        />
      </div>,
    );
  }

  return (
    <div ref={rootRef} className="thumbnails-scroll">
      <div className="thumbnails-spacer" style={{ height: pageCount * itemHeight }}>
        {slots}
      </div>
    </div>
  );
}
