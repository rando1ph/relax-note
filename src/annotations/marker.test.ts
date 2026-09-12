import { describe, expect, it } from "vitest";
import {
  markerKind,
  markerColor,
  layoutMarkerRail,
  markerHitSize,
  NOTE_HIT_SIZE,
  VOCAB_HIT_SIZE,
} from "./marker";
import type { Annotation } from "./types";

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "a",
    documentId: "d",
    type: "highlight",
    color: "#ffd400",
    sourceText: "text",
    title: null,
    note: "",
    createdAt: 0,
    updatedAt: 0,
    segments: [{ pageNumber: 1, rect: { x: 0, y: 0.1, width: 0.5, height: 0.03 }, seq: 0 }],
    ...overrides,
  };
}

describe("markerKind", () => {
  it("plain highlight → null", () => {
    expect(markerKind(annotation())).toBeNull();
  });

  it("title only → note", () => {
    expect(markerKind(annotation({ title: "Summary" }))).toBe("note");
  });

  it("note only → note", () => {
    expect(markerKind(annotation({ note: "A note" }))).toBe("note");
  });

  it("whitespace-only title/note → null", () => {
    expect(markerKind(annotation({ title: "  ", note: " " }))).toBeNull();
  });

  it("vocabulary without note → vocabulary", () => {
    expect(markerKind(annotation({ type: "vocabulary" }))).toBe("vocabulary");
  });

  it("vocabulary with note/title → vocabulary, not note", () => {
    expect(markerKind(annotation({ type: "vocabulary", title: "T", note: "N" }))).toBe(
      "vocabulary",
    );
  });
});

describe("marker sizes", () => {
  it("note marker uses the note hit size", () => {
    expect(markerHitSize("note")).toBe(NOTE_HIT_SIZE);
  });

  it("vocabulary marker uses the vocabulary hit size", () => {
    expect(markerHitSize("vocabulary")).toBe(VOCAB_HIT_SIZE);
  });
});

describe("markerColor", () => {
  it("note marker derives its hue from annotation.color", () => {
    expect(markerColor(annotation({ note: "n", color: "#0A84FF" }))).toBe("#0A84FF");
  });

  it("vocabulary ring derives its hue from annotation.color", () => {
    expect(markerColor(annotation({ type: "vocabulary", color: "#34C759" }))).toBe("#34C759");
  });

  it("reflects an annotation color update", () => {
    const before = annotation({ note: "n", color: "#FFD400" });
    const after = { ...before, color: "#AF52DE" };
    expect(markerColor(after)).toBe("#AF52DE");
  });
});

describe("layoutMarkerRail", () => {
  it("places a note marker centered on its first-segment Y", () => {
    const placed = layoutMarkerRail([{ id: "a", y: 100, size: NOTE_HIT_SIZE }], 2);
    expect(placed.get("a")).toBeCloseTo(100 - NOTE_HIT_SIZE / 2);
  });

  it("places a vocabulary marker centered on its first-segment Y", () => {
    const placed = layoutMarkerRail([{ id: "a", y: 200, size: VOCAB_HIT_SIZE }], 2);
    expect(placed.get("a")).toBeCloseTo(200 - VOCAB_HIT_SIZE / 2);
  });

  it("shifts overlapping markers apart (same Y)", () => {
    const placed = layoutMarkerRail(
      [
        { id: "a", y: 100, size: NOTE_HIT_SIZE },
        { id: "b", y: 100, size: NOTE_HIT_SIZE },
      ],
      2,
    );
    const a = placed.get("a")!;
    const b = placed.get("b")!;
    expect(b - a).toBeGreaterThanOrEqual(NOTE_HIT_SIZE + 2);
  });

  it("does not overlap near-Y markers", () => {
    const placed = layoutMarkerRail(
      [
        { id: "a", y: 100, size: NOTE_HIT_SIZE },
        { id: "b", y: 104, size: NOTE_HIT_SIZE },
      ],
      2,
    );
    const a = placed.get("a")!;
    const b = placed.get("b")!;
    expect(b - a).toBeGreaterThanOrEqual(NOTE_HIT_SIZE + 2);
  });

  it("preserves order and is stable (input order independent)", () => {
    const shuffled = [
      { id: "b", y: 200, size: NOTE_HIT_SIZE },
      { id: "a", y: 100, size: NOTE_HIT_SIZE },
    ];
    const placed = layoutMarkerRail(shuffled, 2);
    expect(placed.get("a")!).toBeLessThan(placed.get("b")!);
    // Re-running yields identical placement.
    const again = layoutMarkerRail(shuffled, 2);
    expect(again.get("a")).toBe(placed.get("a"));
    expect(again.get("b")).toBe(placed.get("b"));
  });

  it("does not mutate its input", () => {
    const entries = [
      { id: "a", y: 100, size: NOTE_HIT_SIZE },
      { id: "b", y: 100, size: NOTE_HIT_SIZE },
    ];
    const before = JSON.stringify(entries);
    layoutMarkerRail(entries, 2);
    expect(JSON.stringify(entries)).toBe(before);
  });

  it("does not mutate stored annotation geometry", () => {
    const a = annotation({ note: "n" });
    const before = JSON.stringify(a.segments);
    expect(markerKind(a)).toBe("note");
    expect(JSON.stringify(a.segments)).toBe(before);
  });
});
