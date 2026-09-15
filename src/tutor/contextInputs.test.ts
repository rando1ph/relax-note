import { describe, expect, it } from "vitest";
import type { Annotation } from "../annotations/types";
import type { NoteListItem } from "../notes/types";
import type { VocabularyItem } from "../vocabulary/types";
import { emptyEnrichment } from "../vocabulary/types";
import {
  annotationContextSeed,
  pageContextSeed,
  pageNoteContextSeed,
  selectionContextSeed,
} from "./contextInputs";
import { contextIdentityKey } from "./identity";

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "a1",
    documentId: "doc",
    type: "highlight",
    color: "#ffd400",
    sourceText: "The interstitium is a fluid-filled space.",
    title: null,
    note: "",
    createdAt: 1,
    updatedAt: 1,
    segments: [
      { pageNumber: 304, rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.02 }, seq: 0 },
    ],
    ...overrides,
  };
}

function vocabularyItem(ann: Annotation): VocabularyItem {
  return {
    annotation: ann,
    local: {
      annotationId: ann.id,
      sourceSentence: "The interstitium is here.",
      contextBefore: "",
      contextAfter: "",
      sectionHeading: null,
      createdAt: 1,
    },
    enrichment: {
      ...emptyEnrichment(),
      status: "ready",
      fields: {
        lemma: "interstitium",
        displayTerm: "interstitium",
        partOfSpeech: "n.",
        ipaUk: "",
        meaningZh: "间质",
        domain: "medicine",
        domainSpecific: true,
      },
    },
  };
}

function pageNoteItem(overrides: Partial<NoteListItem> = {}): NoteListItem {
  return {
    key: "page:p1",
    selection: { kind: "page", id: "p1" },
    kind: "page",
    typeLabel: "Page note",
    pageNumber: 1703,
    title: "Lesion note",
    note: "# Findings\n\n- item",
    sourceText: null,
    color: null,
    origin: "user",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("annotationContextSeed", () => {
  it("builds annotation context with source, page, title and user Note", () => {
    const ann = annotation({ title: "Key term", note: "My own note" });
    const seed = annotationContextSeed(ann, null);
    expect(seed?.source).toBe("annotation");
    expect(seed?.page).toBe(304);
    expect(seed?.annotationSourceText).toBe(ann.sourceText);
    expect(seed?.noteTitle).toBe("Key term");
    expect(seed?.userNote).toBe("My own note");
    expect(seed?.noteOrigin).toBe("user");
    expect(seed && contextIdentityKey(seed.identity)).toBe("annotation:a1");
  });

  it("includes vocabulary metadata for a vocabulary annotation", () => {
    const ann = annotation({ type: "vocabulary", sourceText: "interstitium" });
    const seed = annotationContextSeed(ann, vocabularyItem(ann));
    expect(seed?.source).toBe("vocabulary");
    expect(seed?.vocabulary).toMatchObject({
      term: "interstitium",
      meaningZh: "间质",
      partOfSpeech: "n.",
      sourceSentence: "The interstitium is here.",
      aiGenerated: true,
    });
  });

  it("does not mutate the source annotation", () => {
    const ann = annotation({ title: "T", note: "N" });
    const before = JSON.parse(JSON.stringify(ann));
    annotationContextSeed(ann, null);
    expect(ann).toEqual(before);
  });
});

describe("pageNoteContextSeed", () => {
  it("anchors to the note's stored page and includes the Markdown body", () => {
    const seed = pageNoteContextSeed(pageNoteItem());
    expect(seed?.source).toBe("page-note");
    expect(seed?.page).toBe(1703);
    expect(seed?.noteTitle).toBe("Lesion note");
    expect(seed?.userNote).toContain("# Findings");
    expect(seed?.anchor).toBeNull();
    expect(seed && contextIdentityKey(seed.identity)).toBe("page-note:p1");
  });

  it("preserves AI provenance for an ai_tutor page note", () => {
    const seed = pageNoteContextSeed(pageNoteItem({ origin: "ai_tutor" }));
    expect(seed?.noteOrigin).toBe("ai_tutor");
  });

  it("does not mutate the source note item", () => {
    const item = pageNoteItem();
    const before = JSON.parse(JSON.stringify(item));
    pageNoteContextSeed(item);
    expect(item).toEqual(before);
  });
});

describe("selection/page seeds", () => {
  it("selection seed preserves the selected text and page", () => {
    const seed = selectionContextSeed({
      pageNumber: 12,
      text: "selected words",
      rects: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.02 }],
    });
    expect(seed.source).toBe("selection");
    expect(seed.selectedText).toBe("selected words");
    expect(seed.anchor?.sourceText).toBe("selected words");
  });

  it("page seed has no anchor (bounded page context)", () => {
    const seed = pageContextSeed("doc", 9);
    expect(seed.source).toBe("page");
    expect(seed.page).toBe(9);
    expect(seed.anchor).toBeNull();
  });
});
