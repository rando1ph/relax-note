import { describe, expect, it } from "vitest";
import type { Annotation } from "../annotations/types";
import { compareVocabularyReadingOrder, sortVocabularyItems } from "./sort";
import { emptyEnrichment } from "./types";
import type { VocabularyItem } from "./types";

function annotation(
  id: string,
  page: number,
  y: number,
  x: number,
  createdAt = 0,
): Annotation {
  return {
    id,
    documentId: "d",
    type: "vocabulary",
    color: "#FFD400",
    sourceText: id,
    title: null,
    note: "",
    createdAt,
    updatedAt: createdAt,
    segments: [{ pageNumber: page, rect: { x, y, width: 0.1, height: 0.02 }, seq: 0 }],
  };
}

function item(a: Annotation): VocabularyItem {
  return { annotation: a, local: null, enrichment: emptyEnrichment() };
}

describe("compareVocabularyReadingOrder", () => {
  it("orders by page first", () => {
    expect(compareVocabularyReadingOrder(annotation("a", 1, 0.9, 0.9), annotation("b", 2, 0.1, 0.1))).toBeLessThan(0);
  });

  it("orders by normalized y within a page", () => {
    expect(compareVocabularyReadingOrder(annotation("a", 1, 0.2, 0.9), annotation("b", 1, 0.5, 0.1))).toBeLessThan(0);
  });

  it("orders by normalized x when y ties", () => {
    expect(compareVocabularyReadingOrder(annotation("a", 1, 0.5, 0.1), annotation("b", 1, 0.5, 0.4))).toBeLessThan(0);
  });

  it("uses createdAt then id as stable tie-breakers", () => {
    expect(compareVocabularyReadingOrder(annotation("a", 1, 0.5, 0.1, 5), annotation("b", 1, 0.5, 0.1, 6))).toBeLessThan(0);
    expect(compareVocabularyReadingOrder(annotation("a", 1, 0.5, 0.1, 5), annotation("b", 1, 0.5, 0.1, 5))).toBeLessThan(0);
  });

  it("does not use segment seq (all seq=0) to order", () => {
    const a = annotation("a", 1, 0.8, 0.5);
    const b = annotation("b", 1, 0.2, 0.5);
    const sorted = sortVocabularyItems([item(a), item(b)]);
    expect(sorted.map((i) => i.annotation.id)).toEqual(["b", "a"]);
  });
});
