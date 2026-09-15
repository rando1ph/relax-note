import { describe, expect, it } from "vitest";
import type { NoteListItem } from "./types";
import { filterNotes } from "./search";

function item(overrides: Partial<NoteListItem>): NoteListItem {
  return {
    key: "k",
    selection: { kind: "page", id: "id" },
    kind: "page",
    typeLabel: "Page note",
    pageNumber: 1,
    title: null,
    note: "",
    sourceText: null,
    color: null,
    origin: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("filterNotes", () => {
  const items = [
    item({ key: "1", title: "Chapter One", note: "body text", sourceText: "the quote" }),
    item({ key: "2", title: null, note: "Markdown **bold**", sourceText: "another" }),
    item({ key: "3", title: "No body", note: "  ", sourceText: "source only" }),
  ];

  it("returns all items for an empty query", () => {
    expect(filterNotes(items, "   ")).toEqual(items);
  });

  it("matches title case-insensitively", () => {
    expect(filterNotes(items, "chapter").map((i) => i.key)).toEqual(["1"]);
  });

  it("matches note body", () => {
    expect(filterNotes(items, "bold").map((i) => i.key)).toEqual(["2"]);
  });

  it("matches source text", () => {
    expect(filterNotes(items, "quote").map((i) => i.key)).toEqual(["1"]);
  });

  it("matches source text for items without title/note", () => {
    expect(filterNotes(items, "source only").map((i) => i.key)).toEqual(["3"]);
  });

  it("returns empty array when nothing matches", () => {
    expect(filterNotes(items, "zzz")).toEqual([]);
  });
});
