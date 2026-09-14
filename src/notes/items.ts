import type { Annotation, AnnotationType } from "../annotations/types";
import { compareAnnotationsReadingOrder } from "../annotations/order";
import type { NoteListItem, NoteTypeLabel, PageNote } from "./types";

const TYPE_LABEL: Record<AnnotationType, NoteTypeLabel> = {
  highlight: "Highlight note",
  note: "Note",
  vocabulary: "Vocabulary note",
};

/**
 * An annotation is a Note only when it has user-authored note text. A
 * title-only annotation is metadata, not a Note.
 */
export function isAnnotationNote(annotation: Annotation): boolean {
  return annotation.note.trim() !== "";
}

/** A standalone page note is an empty draft only when both title and note are blank. */
export function isBlankPageNote(pageNote: PageNote): boolean {
  return pageNote.note.trim() === "" && (pageNote.title ?? "").trim() === "";
}

const MARKDOWN_PREFIX = /^(#{1,6}\s+|>\s+|[-*+]\s+|\d+[.)]\s+)/;

/**
 * First useful line of Markdown note text (empty lines and bare markdown list
 * markers are skipped). Used as the list fallback when no title is present.
 */
export function firstUsefulLine(note: string): string {
  for (const raw of note.split("\n")) {
    const line = raw.replace(MARKDOWN_PREFIX, "").trim();
    if (line) return line;
  }
  return "";
}

function toAnnotationItem(annotation: Annotation): NoteListItem {
  return {
    key: `annotation:${annotation.id}`,
    selection: { kind: "annotation", id: annotation.id },
    kind: "annotation",
    typeLabel: TYPE_LABEL[annotation.type],
    pageNumber: annotation.segments[0]?.pageNumber ?? 1,
    title: annotation.title,
    note: annotation.note,
    sourceText: annotation.sourceText,
    color: annotation.color,
    createdAt: annotation.createdAt,
    updatedAt: annotation.updatedAt,
  };
}

function toPageItem(pageNote: PageNote): NoteListItem {
  return {
    key: `page:${pageNote.id}`,
    selection: { kind: "page", id: pageNote.id },
    kind: "page",
    typeLabel: "Page note",
    pageNumber: pageNote.pageNumber,
    title: pageNote.title,
    note: pageNote.note,
    sourceText: null,
    color: null,
    createdAt: pageNote.createdAt,
    updatedAt: pageNote.updatedAt,
  };
}

/**
 * Merges annotation notes (already in reading order) and page notes (already in
 * creation order) into a single list ordered by:
 *
 *   1. page number ascending;
 *   2. within a page: annotation notes first, then page notes;
 *   3. each kind keeps its own internal order (reading order / creation order).
 */
export function deriveNoteList(
  annotations: Annotation[],
  pageNotes: PageNote[],
): NoteListItem[] {
  const annotationItems = annotations
    .filter(isAnnotationNote)
    .sort(compareAnnotationsReadingOrder)
    .map(toAnnotationItem);

  const pageItems = [...pageNotes]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .map(toPageItem);

  const result: NoteListItem[] = [];
  let ai = 0;
  let pi = 0;
  while (ai < annotationItems.length || pi < pageItems.length) {
    const a = annotationItems[ai];
    const p = pageItems[pi];
    if (!p || (a && a.pageNumber <= p.pageNumber)) {
      result.push(a);
      ai += 1;
    } else {
      result.push(p);
      pi += 1;
    }
  }
  return result;
}
