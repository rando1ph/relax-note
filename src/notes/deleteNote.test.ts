import { describe, expect, it } from "vitest";
import type { Annotation } from "../annotations/types";
import { hasNoteContent } from "../annotations/types";
import { markerKind } from "../annotations/marker";
import { createWriteQueue } from "../annotations/writeQueue";
import { deriveNoteList } from "./items";

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "a1",
    documentId: "d",
    type: "highlight",
    color: "#FFD400",
    sourceText: "source text",
    title: "Original title",
    note: "Original note",
    createdAt: 1,
    updatedAt: 1,
    segments: [
      { pageNumber: 3, rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.03 }, seq: 0 },
    ],
    ...overrides,
  };
}

/** Mirrors the store's optimistic application of `{ title: null, note: "" }`. */
function applyDeleteNote(a: Annotation): Annotation {
  return { ...a, title: null, note: "", updatedAt: a.updatedAt + 1 };
}

describe("Delete Note semantics", () => {
  it("clears both title and note", () => {
    const after = applyDeleteNote(annotation());
    expect(after.title).toBeNull();
    expect(after.note).toBe("");
  });

  it("preserves the annotation itself", () => {
    const before = annotation();
    const after = applyDeleteNote(before);
    expect(after.id).toBe(before.id);
    expect(after.documentId).toBe(before.documentId);
    expect(after.createdAt).toBe(before.createdAt);
  });

  it("preserves highlight type, geometry, color and source text", () => {
    const before = annotation();
    const after = applyDeleteNote(before);
    expect(after.type).toBe("highlight");
    expect(after.color).toBe(before.color);
    expect(after.sourceText).toBe(before.sourceText);
    expect(after.segments).toEqual(before.segments);
  });

  it("removes the item from the Notes list", () => {
    const before = annotation();
    expect(deriveNoteList([before], []).map((i) => i.selection.id)).toEqual(["a1"]);
    expect(deriveNoteList([applyDeleteNote(before)], [])).toEqual([]);
  });

  it("no longer qualifies a non-vocabulary annotation for a Note marker", () => {
    const after = applyDeleteNote(annotation());
    expect(hasNoteContent(after)).toBe(false);
    expect(markerKind(after)).toBeNull();
  });

  it("keeps a vocabulary annotation as vocabulary with its vocabulary marker", () => {
    const after = applyDeleteNote(annotation({ type: "vocabulary" }));
    expect(after.type).toBe("vocabulary");
    expect(markerKind(after)).toBe("vocabulary");
    expect(after.segments).toHaveLength(1);
    // The user-authored Note is gone, so it also leaves the Notes list.
    expect(deriveNoteList([after], [])).toEqual([]);
  });
});

function makeClock() {
  let nextId = 1;
  const timers = new Map<number, () => void>();
  return {
    setTimeoutFn(fn: () => void, _ms: number) {
      const id = nextId++;
      timers.set(id, fn);
      return id;
    },
    clearTimeoutFn(id: number) {
      timers.delete(id);
    },
    runAll() {
      const fns = [...timers.values()];
      timers.clear();
      for (const fn of fns) fn();
    },
  };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Delete Note write safety", () => {
  it("coalesces pending title/note autosaves into the final destructive patch", async () => {
    const calls: { id: string; patch: Record<string, unknown> }[] = [];
    const clock = makeClock();
    const queue = createWriteQueue({
      debounceMs: 400,
      persist: async (id, patch) => {
        calls.push({ id, patch });
      },
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });

    // Stale autosaves still pending when Delete Note is pressed.
    queue.schedule("a1", { title: "Typed title" });
    queue.schedule("a1", { note: "Typed note" });
    queue.schedule("a1", { title: null, note: "" });
    queue.flushAll();
    await tick();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ id: "a1", patch: { title: null, note: "" } });
  });

  it("writes the destructive patch after an older in-flight write completes", async () => {
    const calls: { id: string; patch: Record<string, unknown> }[] = [];
    const clock = makeClock();
    const resolvers: (() => void)[] = [];
    const queue = createWriteQueue({
      debounceMs: 400,
      persist: async (id, patch) => {
        calls.push({ id, patch });
        if (calls.length === 1) {
          await new Promise<void>((resolve) => resolvers.push(resolve));
        }
      },
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });

    queue.schedule("a1", { note: "old" });
    clock.runAll(); // start write #1 (in-flight)
    queue.schedule("a1", { title: null, note: "" }); // Delete Note while in-flight
    resolvers[0]();
    await tick();
    await tick();

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ id: "a1", patch: { note: "old" } });
    expect(calls[1]).toEqual({ id: "a1", patch: { title: null, note: "" } });
  });
});
