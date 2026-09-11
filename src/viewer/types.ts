import type { PDFDocumentProxy } from "../pdf/pdfjs";

export interface ViewerHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomByWheel: (deltaY: number, pointerY?: number) => void;
  actualSize: () => void;
  fitPage: () => void;
  fitWidth: () => void;
}

export interface ViewerProps {
  pdfDocument: PDFDocumentProxy;
  pageCount: number;
  scale: number;
  currentPage: number;
  needsAutoFit: boolean;
  initialScrollOffset: number;
  onScaleChange: (scale: number) => void;
  onCurrentPageChange: (page: number) => void;
  onScrollOffsetChange: (offset: number) => void;
}

/** Matches the CSS: .viewer-content padding-top and .pdf-page margin-bottom. */
export const PAGE_MARGIN = 16;
export const PAGE_PADDING = 24;
