import type { PDFDocumentProxy } from "../pdf/pdfjs";

export interface ViewerHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  /** deltaY is in official PDF.js "ticks" (see useKeyboard.ts): one tick =
   *  one discrete wheel notch. Negative = zoom in. clientX/clientY anchor
   *  zoom at the pointer. */
  zoomByWheel: (deltaY: number, clientX?: number, clientY?: number) => void;
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
  onScaleChange: (scale: number) => void;
  onCurrentPageChange: (page: number) => void;
}
