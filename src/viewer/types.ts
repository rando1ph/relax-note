import type { PDFDocumentProxy } from "../pdf/pdfjs";
import type { NormalizedRect } from "../pdf/types";
import type { Annotation } from "../annotations/types";
import type { SelectionSnapshot } from "../annotations/selection";

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
  /** Creates a highlight from the current (valid) PDF text selection snapshot.
   *  Returns false when no valid selection/snapshot exists. */
  highlightSelection: () => boolean;
  /** Navigates to the page and scrolls the given normalized rect into view. */
  scrollToSegment: (pageNumber: number, rect: NormalizedRect) => void;
}

export interface ViewerProps {
  pdfDocument: PDFDocumentProxy;
  pageCount: number;
  scale: number;
  currentPage: number;
  needsAutoFit: boolean;
  onScaleChange: (scale: number) => void;
  onCurrentPageChange: (page: number) => void;
  annotationsByPage: Map<number, Annotation[]>;
  selectedAnnotationId: string | null;
  onSelectAnnotation: (id: string | null) => void;
  onCreateHighlight: (snapshot: SelectionSnapshot) => void;
  onCreateVocabulary: (snapshot: SelectionSnapshot) => void;
}
