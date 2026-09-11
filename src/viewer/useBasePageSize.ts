import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "../pdf/pdfjs";

export interface PageSize {
  width: number;
  height: number;
}

/** Base (un-scaled) dimensions of page 1, used for fit-to-width/page scaling. */
export function useBasePageSize(pdfDocument: PDFDocumentProxy | null): PageSize | null {
  const [size, setSize] = useState<PageSize | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSize(null);
    if (!pdfDocument) return;
    pdfDocument.getPage(1).then((page) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 1 });
      setSize({ width: viewport.width, height: viewport.height });
    });
    return () => {
      cancelled = true;
    };
  }, [pdfDocument]);

  return size;
}
