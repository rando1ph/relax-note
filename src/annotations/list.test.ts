import { describe, expect, it } from "vitest";
import type { Annotation, AnnotationType } from "./types";
import { isVocabularyAnnotation, listableAnnotations } from "./list";

function annotation(id: string, type: AnnotationType): Annotation {
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
    segments: [{ pageNumber: 1, rect: { x: 0, y: 0.1, width: 0.1, height: 0.02 }, seq: 0 }],
  };
}

describe("annotation list filtering", () => {
  it("excludes vocabulary annotations from the annotations list", () => {
    const annotations = [
      annotation("h1", "highlight"),
      annotation("v1", "vocabulary"),
      annotation("n1", "note"),
    ];
    expect(listableAnnotations(annotations).map((a) => a.id)).toEqual(["h1", "n1"]);
  });

  it("identifies vocabulary annotations", () => {
    expect(isVocabularyAnnotation(annotation("v1", "vocabulary"))).toBe(true);
    expect(isVocabularyAnnotation(annotation("h1", "highlight"))).toBe(false);
  });

  it("does not mutate the input", () => {
    const annotations = [annotation("v1", "vocabulary")];
    const before = JSON.stringify(annotations);
    listableAnnotations(annotations);
    expect(JSON.stringify(annotations)).toBe(before);
  });
});
