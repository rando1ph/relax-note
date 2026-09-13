import { describe, expect, it } from "vitest";
import type { Annotation, AnnotationType } from "../annotations/types";
import { buildVocabularyItems } from "./items";

function annotation(id: string, type: AnnotationType, page = 1): Annotation {
  return {
    id,
    documentId: "d",
    type,
    color: "#FFD400",
    sourceText: id,
    title: null,
    note: "",
    createdAt: 0,
    updatedAt: 0,
    segments: [{ pageNumber: page, rect: { x: 0, y: 0.1, width: 0.1, height: 0.02 }, seq: 0 }],
  };
}

describe("buildVocabularyItems", () => {
  it("B: includes vocabulary annotations", () => {
    const items = buildVocabularyItems([annotation("v1", "vocabulary")], new Map());
    expect(items.map((i) => i.annotation.id)).toEqual(["v1"]);
  });

  it("excludes non-vocabulary annotations", () => {
    const items = buildVocabularyItems(
      [annotation("h1", "highlight"), annotation("v1", "vocabulary")],
      new Map(),
    );
    expect(items.map((i) => i.annotation.id)).toEqual(["v1"]);
  });

  it("synthesizes local metadata from the annotation when absent", () => {
    const items = buildVocabularyItems([annotation("v1", "vocabulary")], new Map());
    expect(items[0].local?.sourceSentence).toBe("v1");
  });

  it("keeps reading order", () => {
    const items = buildVocabularyItems(
      [annotation("b", "vocabulary", 2), annotation("a", "vocabulary", 1)],
      new Map(),
    );
    expect(items.map((i) => i.annotation.id)).toEqual(["a", "b"]);
  });
});
