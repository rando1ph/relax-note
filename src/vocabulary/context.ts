import type { PDFPageProxy } from "pdfjs-dist";
import type { NormalizedRect } from "../pdf/types";
import {
  reconstructPageText,
  selectItemRange,
  selectRangeByText,
  sentenceSpans,
  loadPageTextItems,
} from "../pdf/pageText";
import type { RawDimsViewport, TextItemLike } from "../pdf/pageText";
import type { VocabularyContextPayload } from "./types";

/**
 * Vocabulary-specific contextual extraction for a single page. The generic
 * page-text primitives (geometry, reconstruction, item matching, sentence
 * segmentation, and the per-page text cache) live in `../pdf/pageText` and are
 * re-exported here so existing call sites/tests remain stable.
 *
 * Sentence boundaries are best-effort; a bounded raw context window is always
 * preserved so a segmentation error never removes useful context.
 */

const CONTEXT_WINDOW_CHARS = 240;
const MAX_CONTEXT_WINDOW = CONTEXT_WINDOW_CHARS * 2;
const MAX_SOURCE_SENTENCE = 400;
const MAX_NEIGHBOR_SENTENCE = 400;
const MAX_TERM = 120;
const MAX_HEADING = 200;

// Re-exports for compatibility (used by Vocabulary and existing tests).
export {
  fallbackSentenceSpans,
  reconstructPageText,
  selectItemRange,
  selectRangeByText,
  sentenceSpans,
  textItemToNormalizedRect,
  loadPageTextItems,
} from "../pdf/pageText";
export type {
  RawDims,
  RawDimsViewport,
  ReconstructedText,
  SentenceSpan,
  TextItemLike,
} from "../pdf/pageText";

function cap(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function sentenceContaining(
  spans: { start: number; end: number }[],
  offset: number,
): number {
  for (let i = 0; i < spans.length; i++) {
    if (offset >= spans[i].start && offset < spans[i].end) return i;
  }
  return spans.length > 0 ? spans.length - 1 : -1;
}

export interface ExtractedContext {
  sourceSentence: string | null;
  previousSentence: string | null;
  nextSentence: string | null;
  contextWindow: string;
}

/**
 * Pure context extraction over already-reconstructed page text. Geometry picks
 * the item range; sentence spans are best-effort; the raw window is always set.
 */
export function extractContextFromItems(
  items: TextItemLike[],
  viewport: RawDimsViewport,
  selectionRects: NormalizedRect[],
  sourceText: string,
): ExtractedContext {
  const reconstructed = reconstructPageText(items, viewport);
  const range =
    selectItemRange(reconstructed, selectionRects) ??
    selectRangeByText(reconstructed, sourceText);

  if (!range) {
    return {
      sourceSentence: sourceText ? cap(sourceText, MAX_SOURCE_SENTENCE) : null,
      previousSentence: null,
      nextSentence: null,
      contextWindow: cap(sourceText, MAX_CONTEXT_WINDOW),
    };
  }

  const selectionStart = reconstructed.itemStarts[range.start];
  const selectionEnd = reconstructed.itemEnds[range.end];
  const text = reconstructed.text;

  const spans = sentenceSpans(text);
  const index = sentenceContaining(spans, selectionStart);
  let sourceSentence: string | null = null;
  let previousSentence: string | null = null;
  let nextSentence: string | null = null;
  if (index >= 0) {
    sourceSentence = cap(text.slice(spans[index].start, spans[index].end), MAX_SOURCE_SENTENCE);
    if (index > 0) {
      previousSentence = cap(
        text.slice(spans[index - 1].start, spans[index - 1].end),
        MAX_NEIGHBOR_SENTENCE,
      );
    }
    if (index + 1 < spans.length) {
      nextSentence = cap(
        text.slice(spans[index + 1].start, spans[index + 1].end),
        MAX_NEIGHBOR_SENTENCE,
      );
    }
  }
  if (!sourceSentence) {
    sourceSentence = cap(sourceText, MAX_SOURCE_SENTENCE) || null;
  }

  const windowStart = Math.max(0, selectionStart - CONTEXT_WINDOW_CHARS);
  const windowEnd = Math.min(text.length, selectionEnd + CONTEXT_WINDOW_CHARS);
  const contextWindow = cap(text.slice(windowStart, windowEnd), MAX_CONTEXT_WINDOW);

  return { sourceSentence, previousSentence, nextSentence, contextWindow };
}

export interface ExtractVocabularyContextParams {
  page: PDFPageProxy;
  pageNumber: number;
  sourceText: string;
  rects: NormalizedRect[];
  documentTitle: string;
  sectionHeading: string | null;
}

/**
 * Minimum valid payload: the authoritative selected term, with the selected
 * text itself as a fallback sentence/window. Used when context extraction is
 * unavailable so enrichment never depends on TextLayer/sentence/outline work.
 */
export function termOnlyVocabularyContext(
  sourceText: string,
  documentTitle: string,
  page: number,
  sectionHeading: string | null,
): VocabularyContextPayload {
  return {
    documentTitle,
    page,
    selectedTerm: cap(sourceText, MAX_TERM),
    sourceSentence: sourceText ? cap(sourceText, MAX_SOURCE_SENTENCE) : null,
    previousSentence: null,
    nextSentence: null,
    sectionHeading: sectionHeading ? cap(sectionHeading, MAX_HEADING) : null,
    contextWindow: sourceText ? cap(sourceText, MAX_CONTEXT_WINDOW) : "",
  };
}

/**
 * Extracts bounded context for a vocabulary selection. Degrades gracefully: on
 * any failure the selected text becomes the fallback sentence/window.
 */
export async function extractVocabularyContext(
  params: ExtractVocabularyContextParams,
): Promise<VocabularyContextPayload> {
  const { page, pageNumber, sourceText, rects, documentTitle, sectionHeading } = params;
  const base = termOnlyVocabularyContext(
    sourceText,
    documentTitle,
    pageNumber,
    sectionHeading,
  );

  try {
    const viewport = page.getViewport({ scale: 1 }) as unknown as RawDimsViewport;
    const items = await loadPageTextItems(page);
    if (items.length === 0) return base;
    const extracted = extractContextFromItems(items, viewport, rects, sourceText);
    return { ...base, ...extracted };
  } catch {
    return base;
  }
}
