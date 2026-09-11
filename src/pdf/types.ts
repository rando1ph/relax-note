export type DocumentId = string;

export interface DocumentInfo {
  id: DocumentId;
  path: string;
  title: string;
  contentHash: string;
  pageCount: number;
}

export interface PdfPoint {
  x: number;
  y: number;
}

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Geometry normalized to the page dimensions: every value is a fraction of
 * the page size within [0, 1]. This is the canonical, zoom/resize independent
 * representation used to anchor future annotations.
 */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageGeometry {
  pageNumber: number;
  /** Page size in PDF user-space units (CSS px at scale 1). */
  width: number;
  height: number;
}

/**
 * Reserved for M2. Vocabulary is a specialization of the general annotation
 * type, not a separate storage system.
 */
export type AnnotationType = "note" | "vocabulary";
