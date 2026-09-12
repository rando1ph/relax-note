import type { NormalizedRect } from "../pdf/types";

/**
 * Canonical Relax Note annotation types. `highlight` is the only type created
 * in M2; `note` and `vocabulary` are reserved so the schema/UI does not need
 * to change when later milestones arrive.
 */
export type AnnotationType = "highlight" | "note" | "vocabulary";

/** One geometry segment of an annotation (a page-relative, zoom-independent rect). */
export interface AnnotationSegment {
  pageNumber: number;
  rect: NormalizedRect;
  seq: number;
}

/** In-memory annotation assembled from `annotations` + `annotation_rects`. */
export interface Annotation {
  id: string;
  documentId: string;
  type: AnnotationType;
  color: string;
  sourceText: string;
  title: string | null;
  note: string;
  createdAt: number;
  updatedAt: number;
  segments: AnnotationSegment[];
}

/** Editable fields only (geometry/type are fixed for M2). */
export interface AnnotationEditablePatch {
  title?: string | null;
  note?: string;
  color?: string;
}

/** True when the annotation has user-authored Title or Note content. */
export function hasNoteContent(annotation: Annotation): boolean {
  return Boolean((annotation.title ?? "").trim() || annotation.note.trim());
}
