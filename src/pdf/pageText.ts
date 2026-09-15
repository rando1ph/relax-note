import { Util } from "pdfjs-dist";
import type { PDFPageProxy } from "pdfjs-dist";
import type { NormalizedRect } from "./types";

/**
 * Shared, generic PDF.js page-text primitives: TextItem geometry
 * normalization, page text reconstruction, selection/item matching, sentence
 * segmentation, and the per-page text-content cache.
 *
 * Geometry follows the installed PDF.js 6.3.289 `TextLayer` semantics exactly:
 * the text layer maps a TextItem through
 * `Util.transform([1, 0, 0, -1, -pageX, pageY + pageHeight], item.transform)`
 * using `viewport.rawDims`, then writes percentages of `rawDims`. That is the
 * same PDF-space, top-left-origin, crop-relative space used by annotation
 * geometry, and it is independent of page rotation.
 *
 * Sentence boundaries are best-effort; a bounded raw context window is always
 * preserved so a segmentation error never removes useful context.
 */

export interface RawDims {
  pageWidth: number;
  pageHeight: number;
  pageX: number;
  pageY: number;
}

export interface RawDimsViewport {
  rawDims: RawDims;
}

export interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL: boolean;
}

const GEOMETRY_TOLERANCE = 0.002;

/**
 * TextItem -> PDF-space normalized rect. Mirrors `TextLayer.#appendText`
 * (`build/pdf.mjs`) rather than hand-deriving the transform.
 */
export function textItemToNormalizedRect(
  item: Pick<TextItemLike, "transform" | "width">,
  viewport: RawDimsViewport,
): NormalizedRect {
  const { pageWidth, pageHeight, pageX, pageY } = viewport.rawDims;
  const tx = Util.transform(
    [1, 0, 0, -1, -pageX, pageY + pageHeight],
    item.transform,
  );
  const fontHeight = Math.hypot(tx[2], tx[3]);
  return {
    x: tx[4] / pageWidth,
    y: (tx[5] - fontHeight) / pageHeight,
    width: item.width / pageWidth,
    height: fontHeight / pageHeight,
  };
}

function intersects(a: NormalizedRect, b: NormalizedRect): boolean {
  return (
    a.x < b.x + b.width + GEOMETRY_TOLERANCE &&
    a.x + a.width > b.x - GEOMETRY_TOLERANCE &&
    a.y < b.y + b.height + GEOMETRY_TOLERANCE &&
    a.y + a.height > b.y - GEOMETRY_TOLERANCE
  );
}

export interface ReconstructedText {
  text: string;
  itemStarts: number[];
  itemEnds: number[];
  itemRects: NormalizedRect[];
}

/** Reconstructs page text plus per-item character offsets and normalized rects. */
export function reconstructPageText(
  items: TextItemLike[],
  viewport: RawDimsViewport,
): ReconstructedText {
  let text = "";
  const itemStarts: number[] = [];
  const itemEnds: number[] = [];
  const itemRects: NormalizedRect[] = [];
  let previousRect: NormalizedRect | null = null;
  let previousHasEOL = false;

  for (const item of items) {
    const rect = textItemToNormalizedRect(item, viewport);
    let prefix = "";
    if (text.length > 0) {
      const lastChar = text[text.length - 1] ?? "";
      const firstChar = item.str[0] ?? "";
      if (previousHasEOL) {
        prefix = "\n";
      } else if (
        previousRect &&
        firstChar &&
        !/\s/.test(firstChar) &&
        !/\s/.test(lastChar)
      ) {
        const gap = rect.x - (previousRect.x + previousRect.width);
        if (gap > GEOMETRY_TOLERANCE) prefix = " ";
      }
    }
    text += prefix;
    itemStarts.push(text.length);
    text += item.str;
    itemEnds.push(text.length);
    itemRects.push(rect);
    previousRect = rect;
    previousHasEOL = item.hasEOL;
  }

  return { text, itemStarts, itemEnds, itemRects };
}

/** Selects the contiguous item range intersected by the selection geometry. */
export function selectItemRange(
  reconstructed: ReconstructedText,
  selectionRects: NormalizedRect[],
): { start: number; end: number } | null {
  let start = -1;
  let end = -1;
  for (let i = 0; i < reconstructed.itemRects.length; i++) {
    const rect = reconstructed.itemRects[i];
    if (selectionRects.some((selection) => intersects(rect, selection))) {
      if (start === -1) start = i;
      end = i;
    }
  }
  if (start === -1) return null;
  return { start, end };
}

/** Fallback locator: finds the selected text in the reconstructed page text. */
export function selectRangeByText(
  reconstructed: ReconstructedText,
  sourceText: string,
): { start: number; end: number } | null {
  const needle = sourceText.replace(/\s+/g, " ").trim();
  if (!needle) return null;
  const haystack = reconstructed.text.replace(/\s+/g, " ");
  const index = haystack.indexOf(needle);
  if (index === -1) return null;
  const startChar = Math.min(index, reconstructed.text.length);
  const endChar = Math.min(index + needle.length, reconstructed.text.length);
  let start = -1;
  let end = -1;
  for (let i = 0; i < reconstructed.itemStarts.length; i++) {
    if (reconstructed.itemStarts[i] <= startChar && reconstructed.itemEnds[i] > startChar) {
      start = i;
    }
    if (reconstructed.itemEnds[i] >= endChar) {
      end = i;
      break;
    }
  }
  if (start === -1 || end === -1) return null;
  return { start, end };
}

interface SentenceSegment {
  segment: string;
  index: number;
}

interface SentenceSegmenter {
  segment(input: string): Iterable<SentenceSegment>;
}

type SegmenterCtor = new (
  locale?: string,
  options?: { granularity: string },
) => SentenceSegmenter;

let cachedSegmenter: SentenceSegmenter | null | undefined;

function getSentenceSegmenter(): SentenceSegmenter | null {
  if (cachedSegmenter !== undefined) return cachedSegmenter;
  const intl = Intl as unknown as { Segmenter?: SegmenterCtor };
  if (typeof intl.Segmenter !== "function") {
    cachedSegmenter = null;
    return null;
  }
  try {
    cachedSegmenter = new intl.Segmenter(undefined, { granularity: "sentence" });
  } catch {
    cachedSegmenter = null;
  }
  return cachedSegmenter;
}

export interface SentenceSpan {
  start: number;
  end: number;
}

const ABBREVIATIONS = new Set([
  "e.g",
  "i.e",
  "et al",
  "fig",
  "figs",
  "vs",
  "no",
  "dr",
  "mr",
  "mrs",
  "ms",
  "prof",
  "etc",
  "cf",
  "al",
  "approx",
  "ca",
  "eq",
  "ref",
]);

const BOUNDARY_CHARS = new Set([".", "!", "?", "…", "。", "！", "？"]);
const CLOSING_CHARS = new Set(["\"", "'", "”", "’", ")", "]", "}"]);

/** Conservative fallback segmenter used only when Intl.Segmenter is absent. */
export function fallbackSentenceSpans(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!BOUNDARY_CHARS.has(ch)) continue;

    let j = i;
    while (j + 1 < text.length && (BOUNDARY_CHARS.has(text[j + 1]) || CLOSING_CHARS.has(text[j + 1]))) {
      j++;
    }
    const before = text[i - 1] ?? "";
    const after = text[j + 1] ?? "";

    if (ch === "." && /\d/.test(before) && /\d/.test(after)) {
      i = j;
      continue;
    }

    const tail = text.slice(start, j + 1);
    const word = (tail.match(/([A-Za-z][A-Za-z.]*)$/)?.[1] ?? "").replace(/\.$/, "");
    const lower = word.toLowerCase();
    if (ch === "." && (ABBREVIATIONS.has(lower) || /^[a-z]$/.test(lower))) {
      i = j;
      continue;
    }
    if (ch === "." && /^[A-Z]$/.test(word) && /[A-Z]/.test(after)) {
      i = j;
      continue;
    }

    if (after === "" || /\s/.test(after) || CLOSING_CHARS.has(after)) {
      const end = j + 1;
      if (end > start) spans.push({ start, end });
      start = end;
      while (start < text.length && /\s/.test(text[start])) start++;
      i = start - 1;
    }
  }
  if (start < text.length) spans.push({ start, end: text.length });
  return spans;
}

/** Sentence spans, preferring Intl.Segmenter when available and sane. */
export function sentenceSpans(text: string): SentenceSpan[] {
  const segmenter = getSentenceSegmenter();
  if (segmenter) {
    try {
      const spans: SentenceSpan[] = [];
      for (const part of segmenter.segment(text)) {
        const start = part.index;
        const end = start + part.segment.length;
        if (end > start) spans.push({ start, end });
      }
      if (spans.length > 0) return spans;
    } catch {
      // fall through to the conservative fallback
    }
  }
  return fallbackSentenceSpans(text);
}

function isTextItem(item: unknown): item is TextItemLike {
  return typeof (item as { str?: unknown }).str === "string";
}

type TextContentResult = Awaited<ReturnType<PDFPageProxy["getTextContent"]>>;

const textContentCache = new WeakMap<PDFPageProxy, Promise<TextContentResult>>();

function loadTextContent(page: PDFPageProxy): Promise<TextContentResult> {
  let cached = textContentCache.get(page);
  if (!cached) {
    cached = page.getTextContent();
    textContentCache.set(page, cached);
  }
  return cached;
}

/**
 * Loads the text items for a single page, memoized per page proxy. Returns an
 * empty list on failure so a text-extraction error never fails the caller.
 */
export async function loadPageTextItems(page: PDFPageProxy): Promise<TextItemLike[]> {
  try {
    const content = await loadTextContent(page);
    return content.items.filter(isTextItem) as unknown as TextItemLike[];
  } catch {
    return [];
  }
}
