import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "../pdf/pdfjs";

interface PdfThumbnailProps {
  pdfDocument: PDFDocumentProxy;
  pageNumber: number;
  thumbWidth: number;
  pageWidth: number;
  pageHeight: number;
  active: boolean;
  onClick: () => void;
}

/**
 * Lightweight canvas-only page preview. No text layer, no annotation layer,
 * low DPR. Rendered eagerly by the caller (the panel virtualizes so only
 * thumbnails near the viewport are mounted at all).
 */
export function PdfThumbnail({
  pdfDocument,
  pageNumber,
  thumbWidth,
  pageWidth,
  pageHeight,
  active,
  onClick,
}: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const aspect = pageHeight > 0 ? pageHeight / pageWidth : 1.4;
  const height = Math.round(thumbWidth * aspect);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;

    pdfDocument
      .getPage(pageNumber)
      .then((page) => {
        if (disposed) return;
        const viewport = page.getViewport({ scale: thumbWidth / pageWidth });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;
        page.render({ canvas, canvasContext: ctx, viewport }).promise.catch(() => undefined);
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
    };
  }, [pdfDocument, pageNumber, thumbWidth, pageWidth]);

  return (
    <button
      type="button"
      className={active ? "thumb active" : "thumb"}
      style={{ width: thumbWidth, height }}
      onClick={onClick}
      aria-label={`Page ${pageNumber}`}
    >
      <span className="thumb-label">{pageNumber}</span>
      <canvas ref={canvasRef} />
    </button>
  );
}
