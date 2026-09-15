import type { SelectionSnapshot } from "../annotations/selection";
import type { Annotation } from "../annotations/types";
import type { NoteListItem } from "../notes/types";
import type { VocabularyItem } from "../vocabulary/types";
import type { TutorAnchor } from "./context";
import {
  annotationIdentity,
  pageIdentity,
  pageNoteIdentity,
  selectionIdentity,
} from "./identity";
import type {
  TutorContextIdentity,
  TutorContextSnapshot,
  TutorNoteOrigin,
  TutorVocabularyContext,
} from "./types";

/**
 * Pure mapping from a source object (annotation / selection / page note / page)
 * to a Tutor context "seed". Seeds are read-only projections: they never mutate
 * the source, and the provider adds document title, section heading, and the
 * bounded local PDF text before freezing the snapshot.
 */
export interface TutorContextSeed {
  identity: TutorContextIdentity;
  page: number;
  source: TutorContextSnapshot["source"];
  selectedText: string | null;
  annotationSourceText: string | null;
  noteTitle: string | null;
  userNote: string | null;
  noteOrigin: TutorNoteOrigin | null;
  vocabulary: TutorVocabularyContext | null;
  anchor: TutorAnchor | null;
}

/** AI-generated vocabulary metadata, clearly marked as such. */
export function vocabularyContext(item: VocabularyItem): TutorVocabularyContext {
  const fields = item.enrichment.fields;
  const meaningZh = fields.meaningZh.trim();
  return {
    term: (fields.displayTerm || item.annotation.sourceText).trim(),
    meaningZh,
    partOfSpeech: fields.partOfSpeech.trim(),
    sourceSentence: (item.local?.sourceSentence || item.annotation.sourceText).trim(),
    aiGenerated: meaningZh.length > 0,
  };
}

export function annotationContextSeed(
  annotation: Annotation,
  vocabularyItem: VocabularyItem | null,
): TutorContextSeed | null {
  const first = annotation.segments[0];
  if (!first) return null;

  const isVocab = annotation.type === "vocabulary";
  const noteTitle = annotation.title?.trim() || null;
  const userNote = annotation.note.trim() || null;

  let vocabulary: TutorVocabularyContext | null = null;
  if (isVocab) {
    vocabulary = vocabularyItem
      ? vocabularyContext(vocabularyItem)
      : {
          term: annotation.sourceText.trim(),
          meaningZh: "",
          partOfSpeech: "",
          sourceSentence: annotation.sourceText.trim(),
          aiGenerated: false,
        };
  }

  return {
    identity: annotationIdentity(annotation.id),
    page: first.pageNumber,
    source: isVocab ? "vocabulary" : "annotation",
    selectedText: null,
    annotationSourceText: annotation.sourceText,
    noteTitle,
    userNote,
    noteOrigin: userNote ? "user" : null,
    vocabulary,
    anchor: {
      rects: annotation.segments.map((s) => s.rect),
      sourceText: annotation.sourceText,
    },
  };
}

export function selectionContextSeed(snapshot: SelectionSnapshot): TutorContextSeed {
  return {
    identity: selectionIdentity(snapshot.pageNumber, snapshot.text),
    page: snapshot.pageNumber,
    source: "selection",
    selectedText: snapshot.text,
    annotationSourceText: null,
    noteTitle: null,
    userNote: null,
    noteOrigin: null,
    vocabulary: null,
    anchor: { rects: snapshot.rects, sourceText: snapshot.text },
  };
}

export function pageContextSeed(documentId: string, page: number): TutorContextSeed {
  return {
    identity: pageIdentity(documentId, page),
    page,
    source: "page",
    selectedText: null,
    annotationSourceText: null,
    noteTitle: null,
    userNote: null,
    noteOrigin: null,
    vocabulary: null,
    anchor: null,
  };
}

/**
 * A standalone Page Note anchors to the page stored on the note — never the
 * viewer's live page — and carries the note title, Markdown body, and origin.
 */
export function pageNoteContextSeed(item: NoteListItem): TutorContextSeed | null {
  if (item.kind !== "page") return null;
  return {
    identity: pageNoteIdentity(item.selection.id),
    page: item.pageNumber,
    source: "page-note",
    selectedText: null,
    annotationSourceText: null,
    noteTitle: item.title,
    userNote: item.note.trim() || null,
    noteOrigin: item.origin,
    vocabulary: null,
    anchor: null,
  };
}
