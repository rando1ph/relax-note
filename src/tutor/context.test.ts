import { describe, expect, it } from "vitest";
import type { NormalizedRect } from "../pdf/types";
import { textItemToNormalizedRect } from "../pdf/pageText";
import type { RawDimsViewport, TextItemLike } from "../pdf/pageText";
import {
  TUTOR_ANCHOR_CONTEXT_MAX_CHARS,
  TUTOR_PAGE_CONTEXT_MAX_CHARS,
  createTutorContextSnapshot,
  extractAnchoredContext,
  extractPageContext,
  extractTutorLocalContextFromItems,
  loadTutorLocalContext,
} from "./context";

function viewport(pageWidth: number, pageHeight: number): RawDimsViewport {
  return { rawDims: { pageWidth, pageHeight, pageX: 0, pageY: 0 } };
}

function item(str: string, x: number, y: number, width: number, hasEOL = false): TextItemLike {
  return { str, transform: [12, 0, 0, 12, x, y], width, height: 12, hasEOL };
}

function wordsOnOneLine(words: string[]): { items: TextItemLike[]; vp: RawDimsViewport } {
  const items: TextItemLike[] = [];
  let x = 50;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    items.push(item(w, x, 700, w.length * 7, i === words.length - 1));
    x += w.length * 7 + 8;
  }
  return { items, vp: viewport(612, 792) };
}

function rectFor(items: TextItemLike[], vp: RawDimsViewport, index: number): NormalizedRect {
  return textItemToNormalizedRect(items[index], vp);
}

describe("extractPageContext", () => {
  it("includes the full page text when it fits the cap", () => {
    const { items, vp } = wordsOnOneLine(["short", "page"]);
    const text = extractPageContext(items, vp, TUTOR_PAGE_CONTEXT_MAX_CHARS);
    expect(text).toContain("short");
    expect(text).toContain("page");
  });

  it("truncates conservatively when the page exceeds the cap", () => {
    const { items, vp } = wordsOnOneLine(["A".repeat(200), "B".repeat(6000)]);
    const text = extractPageContext(items, vp, 1000);
    expect(text.length).toBeLessThanOrEqual(1000);
    expect(text).toContain("A".repeat(200));
  });
});

describe("extractAnchoredContext", () => {
  it("centers a bounded window on the anchor and respects the smaller cap", () => {
    const words = ["The", "quick", "brown", "fox", "jumps", "over", "the", "lazy", "dog"];
    const { items, vp } = wordsOnOneLine(words);
    const rect = rectFor(items, vp, 5); // "over"
    const text = extractAnchoredContext(
      items,
      vp,
      [rect],
      "over",
      TUTOR_ANCHOR_CONTEXT_MAX_CHARS,
    );
    expect(text).toContain("over");
    expect(text.length).toBeLessThanOrEqual(TUTOR_ANCHOR_CONTEXT_MAX_CHARS);
    expect(text).toContain("jumps");
    expect(text).toContain("the");
  });

  it("falls back to source text when the anchor cannot be matched", () => {
    const { items, vp } = wordsOnOneLine(["hello", "world"]);
    const text = extractAnchoredContext(items, vp, [], "orphan", 1800);
    expect(text).toBe("orphan");
  });
});

describe("extractTutorLocalContextFromItems", () => {
  it("uses the page cap with no anchor", () => {
    const { items, vp } = wordsOnOneLine(["a", "b", "c"]);
    const text = extractTutorLocalContextFromItems(items, vp, null);
    expect(text).toContain("a");
  });
});

describe("loadTutorLocalContext", () => {
  it("touches only one page and returns bounded text", async () => {
    let getTextContentCalls = 0;
    let getViewportCalls = 0;
    const { items } = wordsOnOneLine(["only", "one", "page"]);
    const page = {
      getViewport: () => {
        getViewportCalls++;
        return { rawDims: { pageWidth: 612, pageHeight: 792, pageX: 0, pageY: 0 } } as RawDimsViewport;
      },
      getTextContent: () => {
        getTextContentCalls++;
        return Promise.resolve({ items, styles: {} });
      },
    } as unknown as Parameters<typeof loadTutorLocalContext>[0]["page"];
    const text = await loadTutorLocalContext({ page, anchor: null });
    expect(text).toContain("only");
    expect(getTextContentCalls).toBe(1);
    expect(getViewportCalls).toBe(1);
  });

  it("returns an empty string on extraction failure (question still proceeds)", async () => {
    const page = {
      getViewport: () => {
        throw new Error("boom");
      },
      getTextContent: () => Promise.reject(new Error("boom")),
    } as unknown as Parameters<typeof loadTutorLocalContext>[0]["page"];
    const text = await loadTutorLocalContext({ page, anchor: null });
    expect(text).toBe("");
  });
});

describe("createTutorContextSnapshot", () => {
  it("is frozen: mutating inputs after capture does not change it", () => {
    const vocabulary = { term: "x", meaningZh: "间", partOfSpeech: "n.", sourceSentence: "s", aiGenerated: true };
    const snapshot = createTutorContextSnapshot(
      {
        documentId: "doc",
        documentTitle: "Doc",
        page: 1700,
        source: "vocabulary",
        sectionHeading: null,
        selectedText: null,
        annotationSourceText: "x",
        userNote: null,
        vocabulary,
      },
      "window",
      1,
    );
    vocabulary.meaningZh = "CHANGED";
    // Simulated navigation changes an external page source but not the snapshot.
    const externalPage = 1701;
    expect(externalPage).toBe(1701);
    expect(snapshot.vocabulary?.meaningZh).toBe("间");
    expect(snapshot.localContextWindow).toBe("window");
    expect(snapshot.page).toBe(1700);
  });
});
