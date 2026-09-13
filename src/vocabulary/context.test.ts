import { describe, expect, it } from "vitest";
import { Util } from "pdfjs-dist";
import type { PageViewport } from "pdfjs-dist";
import { viewportRectToNormalized } from "../pdf/coordinates";
import type { NormalizedRect, ViewportRect } from "../pdf/types";
import {
  extractContextFromItems,
  extractVocabularyContext,
  fallbackSentenceSpans,
  reconstructPageText,
  selectItemRange,
  sentenceSpans,
  termOnlyVocabularyContext,
  textItemToNormalizedRect,
} from "./context";
import type { RawDimsViewport, TextItemLike } from "./context";

/** A minimal PageViewport mock matching PDF.js's PageViewport transform math. */
function makeViewport(
  pageWidth: number,
  pageHeight: number,
  rotation: number,
): PageViewport & RawDimsViewport {
  const viewBox = [0, 0, pageWidth, pageHeight];
  const scale = 1;
  const centerX = (viewBox[2] + viewBox[0]) / 2;
  const centerY = (viewBox[3] + viewBox[1]) / 2;
  let a = 1;
  let b = 0;
  let c = 0;
  let d = -1;
  if (rotation === 90) [a, b, c, d] = [0, 1, 1, 0];
  else if (rotation === 180) [a, b, c, d] = [-1, 0, 0, 1];
  else if (rotation === 270) [a, b, c, d] = [0, -1, -1, 0];
  let offsetX: number;
  let offsetY: number;
  let width: number;
  let height: number;
  if (a === 0) {
    offsetX = Math.abs(centerY - viewBox[1]) * scale;
    offsetY = Math.abs(centerX - viewBox[0]) * scale;
    width = (viewBox[3] - viewBox[1]) * scale;
    height = (viewBox[2] - viewBox[0]) * scale;
  } else {
    offsetX = Math.abs(centerX - viewBox[0]) * scale;
    offsetY = Math.abs(centerY - viewBox[1]) * scale;
    width = (viewBox[2] - viewBox[0]) * scale;
    height = (viewBox[3] - viewBox[1]) * scale;
  }
  const transform = [
    a * scale,
    b * scale,
    c * scale,
    d * scale,
    offsetX - a * scale * centerX - c * scale * centerY,
    offsetY - b * scale * centerX - d * scale * centerY,
  ];
  return {
    width,
    height,
    scale,
    rotation,
    rawDims: { pageWidth, pageHeight, pageX: 0, pageY: 0 },
    convertToViewportPoint(x: number, y: number): [number, number] {
      const p = [x, y];
      Util.applyTransform(p, transform);
      return [p[0], p[1]];
    },
    convertToPdfPoint(x: number, y: number): [number, number] {
      const p = [x, y];
      Util.applyInverseTransform(p, transform);
      return [p[0], p[1]];
    },
  } as unknown as PageViewport & RawDimsViewport;
}

function item(
  str: string,
  x: number,
  y: number,
  width: number,
  hasEOL = false,
  fontHeight = 12,
): TextItemLike {
  return {
    str,
    transform: [fontHeight, 0, 0, fontHeight, x, y],
    width,
    height: fontHeight,
    hasEOL,
  };
}

/** The annotation-side normalized rect for the same PDF glyph box. */
function annotationNormalized(
  viewport: PageViewport,
  x: number,
  baselineY: number,
  width: number,
  fontHeight: number,
): NormalizedRect {
  const [vx0, vy0] = viewport.convertToViewportPoint(x, baselineY);
  const [vx1, vy1] = viewport.convertToViewportPoint(x + width, baselineY + fontHeight);
  const rect: ViewportRect = {
    left: Math.min(vx0, vx1),
    top: Math.min(vy0, vy1),
    width: Math.abs(vx1 - vx0),
    height: Math.abs(vy1 - vy0),
  };
  return viewportRectToNormalized(viewport, rect);
}

describe("textItemToNormalizedRect", () => {
  const textItem = item("Hello", 100, 700, 60);

  it("matches annotation geometry on a normal 0-degree page", () => {
    const viewport = makeViewport(612, 792, 0);
    const actual = textItemToNormalizedRect(textItem, viewport);
    const expected = annotationNormalized(viewport, 100, 700, 60, 12);
    expect(actual.x).toBeCloseTo(expected.x, 6);
    expect(actual.y).toBeCloseTo(expected.y, 6);
    expect(actual.width).toBeCloseTo(expected.width, 6);
    expect(actual.height).toBeCloseTo(expected.height, 6);
  });

  it("matches annotation geometry on a 90-degree rotated page", () => {
    const viewport = makeViewport(612, 792, 90);
    const actual = textItemToNormalizedRect(textItem, viewport);
    const expected = annotationNormalized(viewport, 100, 700, 60, 12);
    expect(actual.x).toBeCloseTo(expected.x, 6);
    expect(actual.y).toBeCloseTo(expected.y, 6);
    expect(actual.width).toBeCloseTo(expected.width, 6);
    expect(actual.height).toBeCloseTo(expected.height, 6);
  });

  it("is rotation-independent (PDF-space normalized)", () => {
    const flat = textItemToNormalizedRect(textItem, makeViewport(612, 792, 0));
    const rotated = textItemToNormalizedRect(textItem, makeViewport(612, 792, 90));
    expect(rotated).toEqual(flat);
  });

  it("matches annotation geometry on a non-square page", () => {
    const viewport = makeViewport(400, 1000, 0);
    const tall = item("Tall", 50, 900, 30);
    const actual = textItemToNormalizedRect(tall, viewport);
    const expected = annotationNormalized(viewport, 50, 900, 30, 12);
    expect(actual.x).toBeCloseTo(expected.x, 6);
    expect(actual.y).toBeCloseTo(expected.y, 6);
    expect(actual.width).toBeCloseTo(expected.width, 6);
    expect(actual.height).toBeCloseTo(expected.height, 6);
  });
});

describe("reconstructPageText", () => {
  it("inserts a space for a horizontal gap and a newline for hasEOL", () => {
    const viewport = makeViewport(612, 792, 0);
    const items = [item("Hello", 100, 700, 40), item("world", 160, 700, 40, true), item("Next", 100, 670, 40)];
    const { text } = reconstructPageText(items, viewport);
    expect(text).toContain("Hello world");
    expect(text).toContain("world\nNext");
  });
});

describe("selectItemRange", () => {
  it("selects the contiguous item range intersected by geometry", () => {
    const viewport = makeViewport(612, 792, 0);
    const items = [item("one", 50, 700, 30), item("two", 90, 700, 30), item("three", 50, 660, 40)];
    const reconstructed = reconstructPageText(items, viewport);
    const target = textItemToNormalizedRect(items[1], viewport);
    const range = selectItemRange(reconstructed, [target]);
    expect(range).toEqual({ start: 1, end: 1 });
  });
});

describe("sentence segmentation", () => {
  it("fallback does not split after abbreviations or decimals", () => {
    const text = "See e.g. Figure 1. The value is 3.14. Next sentence.";
    const spans = fallbackSentenceSpans(text);
    const sentences = spans.map((s) => text.slice(s.start, s.end).trim());
    expect(sentences).toEqual([
      "See e.g. Figure 1.",
      "The value is 3.14.",
      "Next sentence.",
    ]);
  });

  it("sentenceSpans returns usable spans", () => {
    const text = "First sentence. Second sentence.";
    const spans = sentenceSpans(text);
    expect(spans.length).toBeGreaterThanOrEqual(2);
    expect(text.slice(spans[0].start, spans[0].end)).toContain("First");
  });
});

describe("extractContextFromItems", () => {
  it("returns the containing sentence and a bounded raw window", () => {
    const viewport = makeViewport(612, 792, 0);
    const items = [item("The quick brown fox.", 50, 700, 150), item("It jumps.", 220, 700, 70)];
    const selection = textItemToNormalizedRect(items[1], viewport);
    const result = extractContextFromItems(items, viewport, [selection], "It jumps.");
    expect(result.sourceSentence).toContain("jumps");
    expect(result.contextWindow).toContain("quick brown fox");
  });

  it("falls back to the selected text when geometry cannot be matched", () => {
    const viewport = makeViewport(612, 792, 0);
    const items = [item("Some text.", 50, 700, 80)];
    const result = extractContextFromItems(items, viewport, [], "orphan");
    expect(result.sourceSentence).toBe("orphan");
    expect(result.contextWindow).toBe("orphan");
  });
});

describe("termOnlyVocabularyContext", () => {
  it("keeps the selected term authoritative", () => {
    const context = termOnlyVocabularyContext("interstitium", "Doc", 7, null);
    expect(context.selectedTerm).toBe("interstitium");
    expect(context.page).toBe(7);
    expect(context.previousSentence).toBeNull();
    expect(context.nextSentence).toBeNull();
  });

  it("handles an empty selected text without crashing", () => {
    const context = termOnlyVocabularyContext("", "", 1, null);
    expect(context.selectedTerm).toBe("");
    expect(context.sourceSentence).toBeNull();
    expect(context.contextWindow).toBe("");
  });
});

describe("extractVocabularyContext", () => {
  it("degrades gracefully when text content fails", async () => {
    const page = {
      getViewport: () => makeViewport(612, 792, 0),
      getTextContent: () => Promise.reject(new Error("boom")),
    } as unknown as Parameters<typeof extractVocabularyContext>[0]["page"];
    const result = await extractVocabularyContext({
      page,
      pageNumber: 3,
      sourceText: "ubiquitous",
      rects: [],
      documentTitle: "Doc",
      sectionHeading: null,
    });
    expect(result.sourceSentence).toBe("ubiquitous");
    expect(result.selectedTerm).toBe("ubiquitous");
    expect(result.page).toBe(3);
  });
});
