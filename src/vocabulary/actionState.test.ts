import { describe, expect, it } from "vitest";
import type { Annotation } from "../annotations/types";
import { vocabularyActionState } from "./actionState";
import { emptyEnrichment } from "./types";
import type { VocabularyItem } from "./types";

function item(status: "pending" | "ready" | "failed"): VocabularyItem {
  const annotation: Annotation = {
    id: "v",
    documentId: "d",
    type: "vocabulary",
    color: "#FFD400",
    sourceText: "word",
    title: null,
    note: "",
    createdAt: 0,
    updatedAt: 0,
    segments: [{ pageNumber: 1, rect: { x: 0, y: 0.1, width: 0.1, height: 0.02 }, seq: 0 }],
  };
  const enrichment = { ...emptyEnrichment(), status };
  return { annotation, local: null, enrichment };
}

describe("vocabularyActionState", () => {
  it("K: maps pending idle → generate", () => {
    expect(vocabularyActionState(item("pending"), false, true)).toBe("generate");
  });

  it("K: maps running → running regardless of status", () => {
    expect(vocabularyActionState(item("pending"), true, true)).toBe("running");
    expect(vocabularyActionState(item("ready"), true, true)).toBe("running");
  });

  it("K: maps failed → retry", () => {
    expect(vocabularyActionState(item("failed"), false, true)).toBe("retry");
  });

  it("K: maps ready → regenerate", () => {
    expect(vocabularyActionState(item("ready"), false, true)).toBe("regenerate");
  });

  it("K: unconfigured → configure", () => {
    expect(vocabularyActionState(item("pending"), false, false)).toBe("configure");
    expect(vocabularyActionState(item("ready"), false, false)).toBe("configure");
  });
});
