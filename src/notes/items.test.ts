import { describe, expect, it } from "vitest";
import type { Annotation, AnnotationType } from "../annotations/types";
import type { PageNote, PageNoteOrigin } from "./types";
import { deriveNoteList, firstUsefulLine, isAnnotationNote, isBlankPageNote } from "./items";

function annotation(
  id: string,
  page: number,
  y: number,
  x: number,
  opts: { type?: AnnotationType; note?: string; title?: string | null; createdAt?: number } = {},
): Annotation {
  return {
    id,
    documentId: "d",
    type: opts.type ?? "highlight",
    color: "#FFD400",
    sourceText: `source ${id}`,
    title: opts.title ?? null,
    note: opts.note ?? "",
    createdAt: opts.createdAt ?? 0,
    updatedAt: opts.createdAt ?? 0,
    segments: [{ pageNumber: page, rect: { x, y, width: 0.1, height: 0.02 }, seq: 0 }],
  };
}

function pageNote(
  id: string,
  page: number,
  createdAt: number,
  opts: { title?: string | null; note?: string; origin?: PageNoteOrigin } = {},
): PageNote {
  return {
    id,
    documentId: "d",
    pageNumber: page,
    title: opts.title ?? null,
    note: opts.note ?? "",
    createdAt,
    updatedAt: createdAt,
    origin: opts.origin ?? "user",
  };
}

describe("annotation note membership", () => {
  it("includes only annotations with non-empty note text", () => {
    expect(isAnnotationNote(annotation("a", 1, 0, 0, { note: "hi" }))).toBe(true);
    expect(isAnnotationNote(annotation("a", 1, 0, 0, { note: "   " }))).toBe(false);
    expect(isAnnotationNote(annotation("a", 1, 0, 0, { note: "" }))).toBe(false);
    // title-only is NOT a note
    expect(isAnnotationNote(annotation("a", 1, 0, 0, { title: "T", note: "" }))).toBe(false);
  });
});

describe("blank page note", () => {
  it("is blank only when both title and note are empty", () => {
    expect(isBlankPageNote(pageNote("p", 1, 0))).toBe(true);
    expect(isBlankPageNote(pageNote("p", 1, 0, { note: "x" }))).toBe(false);
    expect(isBlankPageNote(pageNote("p", 1, 0, { title: "T" }))).toBe(false);
    expect(isBlankPageNote(pageNote("p", 1, 0, { title: "  ", note: " " }))).toBe(true);
  });
});

describe("firstUsefulLine", () => {
  it("strips markdown markers and skips empty lines", () => {
    expect(firstUsefulLine("")).toBe("");
    expect(firstUsefulLine("# Heading")).toBe("Heading");
    expect(firstUsefulLine("  \n- item")).toBe("item");
    expect(firstUsefulLine("> quote")).toBe("quote");
    expect(firstUsefulLine("1. numbered")).toBe("numbered");
    expect(firstUsefulLine("plain text")).toBe("plain text");
  });
});

describe("deriveNoteList", () => {
  it("merges annotation notes and page notes", () => {
    const ann = [annotation("a1", 2, 0.1, 0, { note: "n" })];
    const pages = [pageNote("p1", 1, 10, { note: "pn" })];
    const items = deriveNoteList(ann, pages);
    expect(items.map((i) => i.key)).toEqual(["page:p1", "annotation:a1"]);
  });

  it("excludes title-only and empty annotations", () => {
    const ann = [
      annotation("a1", 1, 0, 0, { note: "x" }),
      annotation("a2", 1, 0, 0, { title: "T", note: "" }),
      annotation("a3", 1, 0, 0, { note: "" }),
    ];
    expect(deriveNoteList(ann, []).map((i) => i.key)).toEqual(["annotation:a1"]);
  });

  it("orders annotation notes by page then y then x", () => {
    const ann = [
      annotation("a1", 2, 0.9, 0, { note: "x" }),
      annotation("a2", 1, 0.5, 0.4, { note: "x" }),
      annotation("a3", 1, 0.5, 0.1, { note: "x" }),
    ];
    expect(deriveNoteList(ann, []).map((i) => i.selection.id)).toEqual(["a3", "a2", "a1"]);
  });

  it("puts annotation notes before page notes on the same page", () => {
    const ann = [annotation("a1", 1, 0.1, 0, { note: "x" })];
    const pages = [pageNote("p1", 1, 5, { note: "pn" })];
    const items = deriveNoteList(ann, pages);
    expect(items.map((i) => i.key)).toEqual(["annotation:a1", "page:p1"]);
  });

  it("orders page notes by creation order then id", () => {
    const pages = [
      pageNote("pb", 1, 20, { note: "n" }),
      pageNote("pa", 1, 10, { note: "n" }),
      pageNote("pc", 1, 10, { note: "n" }),
    ];
    const items = deriveNoteList([], pages);
    expect(items.map((i) => i.selection.id)).toEqual(["pa", "pc", "pb"]);
  });

  it("keeps interleaved pages sorted", () => {
    const ann = [annotation("a2", 3, 0, 0, { note: "x" }), annotation("a1", 1, 0, 0, { note: "x" })];
    const pages = [pageNote("p2", 2, 0, { note: "n" }), pageNote("p4", 4, 0, { note: "n" })];
    const items = deriveNoteList(ann, pages);
    expect(items.map((i) => i.key)).toEqual([
      "annotation:a1",
      "page:p2",
      "annotation:a2",
      "page:p4",
    ]);
  });

  it("labels vocabulary notes distinctly", () => {
    const ann = [
      annotation("v", 1, 0, 0, { type: "vocabulary", note: "x" }),
      annotation("h", 1, 0, 0, { type: "highlight", note: "x" }),
    ];
    const items = deriveNoteList(ann, []);
    const byId = new Map(items.map((i) => [i.selection.id, i.typeLabel]));
    expect(byId.get("v")).toBe("Vocabulary note");
    expect(byId.get("h")).toBe("Highlight note");
  });

  it("carries source text and color for annotation notes, not page notes", () => {
    const items = deriveNoteList(
      [annotation("a1", 1, 0, 0, { note: "x" })],
      [pageNote("p1", 1, 0, { note: "n" })],
    );
    const ann = items.find((i) => i.selection.id === "a1");
    const page = items.find((i) => i.selection.id === "p1");
    expect(ann?.sourceText).toBe("source a1");
    expect(ann?.color).toBe("#FFD400");
    expect(page?.sourceText).toBeNull();
    expect(page?.color).toBeNull();
  });

  it("carries page-note origin and leaves annotation origin null", () => {
    const items = deriveNoteList(
      [annotation("a1", 1, 0, 0, { note: "x" })],
      [
        pageNote("p1", 1, 0, { note: "user note" }),
        pageNote("p2", 1, 1, { note: "ai note", origin: "ai_tutor" }),
      ],
    );
    expect(items.find((i) => i.selection.id === "p1")?.origin).toBe("user");
    expect(items.find((i) => i.selection.id === "p2")?.origin).toBe("ai_tutor");
    expect(items.find((i) => i.selection.id === "a1")?.origin).toBeNull();
  });
});
