/**
 * M4 Notes data model.
 *
 * Notes are NOT a second annotation store. There are two logical kinds:
 *
 *  - ANNOTATION NOTE — derived from an existing annotation where
 *    `annotation.note.trim() !== ""`. It is never persisted separately; the
 *    annotation (and its `note` column) is the single source of truth.
 *
 *  - STANDALONE PAGE NOTE — a user-created note anchored to a document + page
 *    number, persisted in its own `page_notes` table. It has no geometry and
 *    no selected source text.
 */

export interface PageNote {
  id: string;
  documentId: string;
  pageNumber: number;
  title: string | null;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export type NoteKind = "annotation" | "page";

/**
 * A document-scoped note identity. The discriminated union avoids ambiguous
 * string ids shared between annotation ids and page-note ids.
 */
export type NoteSelection =
  | { kind: "annotation"; id: string }
  | { kind: "page"; id: string };

export type NoteTypeLabel = "Highlight note" | "Vocabulary note" | "Note" | "Page note";

/**
 * A merged, render-ready list entry produced by `deriveNoteList`.
 */
export interface NoteListItem {
  /** Stable composite key: "annotation:<id>" | "page:<id>". */
  key: string;
  selection: NoteSelection;
  kind: NoteKind;
  typeLabel: NoteTypeLabel;
  pageNumber: number;
  title: string | null;
  note: string;
  /** Selected source text; only present for annotation notes. */
  sourceText: string | null;
  /** Highlight/vocabulary color; only present for annotation notes. */
  color: string | null;
  createdAt: number;
  updatedAt: number;
}
