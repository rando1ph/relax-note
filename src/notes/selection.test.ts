import { describe, expect, it } from "vitest";
import type { NoteSelection } from "./types";
import { noteKey, sameNote } from "./selection";

describe("note selection", () => {
  it("prefixes the kind to disambiguate annotation and page ids", () => {
    expect(noteKey({ kind: "annotation", id: "a" })).toBe("annotation:a");
    expect(noteKey({ kind: "page", id: "a" })).toBe("page:a");
    expect(noteKey({ kind: "annotation", id: "a" })).not.toBe(
      noteKey({ kind: "page", id: "a" }),
    );
  });

  it("compares selections by kind and id", () => {
    const a: NoteSelection = { kind: "annotation", id: "1" };
    expect(sameNote(a, { kind: "annotation", id: "1" })).toBe(true);
    expect(sameNote(a, { kind: "annotation", id: "2" })).toBe(false);
    expect(sameNote(a, { kind: "page", id: "1" })).toBe(false);
  });
});
