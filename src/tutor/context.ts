import type { PDFPageProxy } from "pdfjs-dist";
import type { NormalizedRect } from "../pdf/types";
import {
  reconstructPageText,
  selectItemRange,
  selectRangeByText,
  loadPageTextItems,
} from "../pdf/pageText";
import type { RawDimsViewport, TextItemLike } from "../pdf/pageText";
import type {
  TutorContextIdentity,
  TutorContextSnapshot,
  TutorNoteOrigin,
  TutorVocabularyContext,
} from "./types";

/**
 * Tutor local-context extraction. Touches exactly one page:
 *   - with an explicit anchor (selection/annotation) → a small bounded window
 *     centered on the anchor (~1800 chars);
 *   - with no anchor → the current page, included in full when it fits under
 *     the page cap and truncated conservatively when it does not.
 *
 * Never reads neighboring pages, chapters, or the whole document.
 */

// Page-context cap chosen against the Rust MAX_MESSAGE_BYTES = 32 KB request
// limit: system prompt (~1 KB) + history (~12 KB) + user question (~4 KB) +
// page context (~4.8 KB) stays comfortably under the limit even at maximum.
export const TUTOR_PAGE_CONTEXT_MAX_CHARS = 4800;

// Anchored window cap: the selection/annotation is preserved separately as the
// highest-priority field, so the local window only needs surrounding context.
export const TUTOR_ANCHOR_CONTEXT_MAX_CHARS = 1800;

function truncate(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

/** Full page text when it fits, otherwise a conservative head truncation. */
export function extractPageContext(
  items: TextItemLike[],
  viewport: RawDimsViewport,
  maxChars: number,
): string {
  const reconstructed = reconstructPageText(items, viewport);
  return truncate(reconstructed.text, maxChars);
}

/** Bounded window centered on the anchor; falls back to source text / page head. */
export function extractAnchoredContext(
  items: TextItemLike[],
  viewport: RawDimsViewport,
  rects: NormalizedRect[],
  sourceText: string,
  maxChars: number,
): string {
  const reconstructed = reconstructPageText(items, viewport);
  const range =
    selectItemRange(reconstructed, rects) ??
    selectRangeByText(reconstructed, sourceText);

  if (!range) {
    if (sourceText.trim()) return truncate(sourceText, maxChars);
    return truncate(reconstructed.text, maxChars);
  }

  const start = reconstructed.itemStarts[range.start];
  const end = reconstructed.itemEnds[range.end];
  const before = Math.floor(maxChars / 2);
  const windowStart = Math.max(0, start - before);
  const windowEnd = Math.min(
    reconstructed.text.length,
    end + (maxChars - (start - windowStart)),
  );
  return truncate(reconstructed.text.slice(windowStart, windowEnd), maxChars);
}

export interface TutorAnchor {
  rects: NormalizedRect[];
  sourceText: string;
}

/**
 * Pure local-context extraction over already-loaded page text. `anchor` null
 * means current-page-only context.
 */
export function extractTutorLocalContextFromItems(
  items: TextItemLike[],
  viewport: RawDimsViewport,
  anchor: TutorAnchor | null,
): string {
  if (anchor) {
    return extractAnchoredContext(
      items,
      viewport,
      anchor.rects,
      anchor.sourceText,
      TUTOR_ANCHOR_CONTEXT_MAX_CHARS,
    );
  }
  return extractPageContext(items, viewport, TUTOR_PAGE_CONTEXT_MAX_CHARS);
}

/** Async wrapper: loads one page's text and extracts bounded local context. */
export async function loadTutorLocalContext(params: {
  page: PDFPageProxy;
  anchor: TutorAnchor | null;
}): Promise<string> {
  try {
    const viewport = params.page.getViewport({ scale: 1 }) as unknown as RawDimsViewport;
    const items = await loadPageTextItems(params.page);
    if (items.length === 0) return "";
    return extractTutorLocalContextFromItems(items, viewport, params.anchor);
  } catch {
    return "";
  }
}

export interface TutorSnapshotInput {
  documentId: string;
  documentTitle: string;
  page: number;
  source: TutorContextSnapshot["source"];
  sectionHeading: string | null;
  selectedText: string | null;
  annotationSourceText: string | null;
  noteTitle?: string | null;
  userNote: string | null;
  noteOrigin?: TutorNoteOrigin | null;
  vocabulary: TutorVocabularyContext | null;
  identity?: TutorContextIdentity;
}

/**
 * Builds a frozen context snapshot. All strings are copied into a fresh object;
 * later mutation of the inputs cannot change the returned snapshot.
 */
export function createTutorContextSnapshot(
  input: TutorSnapshotInput,
  localContextWindow: string,
  capturedAt: number = Date.now(),
): TutorContextSnapshot {
  const identity: TutorContextIdentity =
    input.identity ?? { kind: "page", documentId: input.documentId, page: input.page };
  const noteOrigin: TutorNoteOrigin | null =
    input.noteOrigin ?? (input.userNote ? "user" : null);

  return {
    identity,
    documentId: input.documentId,
    documentTitle: input.documentTitle,
    page: input.page,
    source: input.source,
    sectionHeading: input.sectionHeading,
    selectedText: input.selectedText,
    annotationSourceText: input.annotationSourceText,
    localContextWindow,
    noteTitle: input.noteTitle ?? null,
    userNote: input.userNote,
    noteOrigin,
    vocabulary: input.vocabulary
      ? {
          term: input.vocabulary.term,
          meaningZh: input.vocabulary.meaningZh,
          partOfSpeech: input.vocabulary.partOfSpeech,
          sourceSentence: input.vocabulary.sourceSentence,
          aiGenerated: input.vocabulary.aiGenerated,
        }
      : null,
    capturedAt,
  };
}
