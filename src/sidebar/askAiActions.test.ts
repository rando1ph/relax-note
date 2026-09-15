// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Annotation } from "../annotations/types";
import type { NoteListItem } from "../notes/types";
import type { VocabularyItem } from "../vocabulary/types";
import { emptyEnrichment } from "../vocabulary/types";
import { AnnotationInspector } from "./AnnotationInspector";
import { NotesInspector } from "./NotesInspector";
import { VocabularyInspector } from "./VocabularyInspector";

const h = vi.hoisted(() => ({
  askAnnotation: vi.fn(),
  askPageNote: vi.fn(),
  updateNote: vi.fn(),
  flush: vi.fn(),
  updateAnnotation: vi.fn(),
  flushPending: vi.fn(),
  deletePageNote: vi.fn(),
  deleteAnnotationNote: vi.fn(),
  updateTitle: vi.fn(),
}));

vi.mock("../state/tutor", () => ({
  useTutor: () => ({ askAnnotation: h.askAnnotation, askPageNote: h.askPageNote }),
}));
vi.mock("../state/notes", () => ({
  useNotes: () => ({
    updateNote: h.updateNote,
    flush: h.flush,
    updateTitle: h.updateTitle,
    deletePageNote: h.deletePageNote,
    deleteAnnotationNote: h.deleteAnnotationNote,
  }),
}));
vi.mock("../state/annotations", () => ({
  useAnnotations: () => ({
    updateAnnotation: h.updateAnnotation,
    flushPending: h.flushPending,
  }),
}));
vi.mock("../state/vocabulary", () => ({
  useVocabulary: () => ({
    isRunning: () => false,
    configured: true,
    retry: vi.fn(),
    regenerate: vi.fn(),
    deleteVocabulary: vi.fn(),
  }),
}));

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "a1",
    documentId: "doc",
    type: "highlight",
    color: "#ffd400",
    sourceText: "source text",
    title: null,
    note: "note body",
    createdAt: 1,
    updatedAt: 1,
    segments: [
      { pageNumber: 304, rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.02 }, seq: 0 },
    ],
    ...overrides,
  };
}

function pageNoteItem(): NoteListItem {
  return {
    key: "page:p1",
    selection: { kind: "page", id: "p1" },
    kind: "page",
    typeLabel: "Page note",
    pageNumber: 304,
    title: "Lesion note",
    note: "# Body",
    sourceText: null,
    color: null,
    origin: "user",
    createdAt: 1,
    updatedAt: 1,
  };
}

function annotationNoteItem(): NoteListItem {
  return {
    key: "annotation:a1",
    selection: { kind: "annotation", id: "a1" },
    kind: "annotation",
    typeLabel: "Highlight note",
    pageNumber: 304,
    title: "T",
    note: "note body",
    sourceText: "source text",
    color: "#ffd400",
    origin: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

function vocabularyItem(): VocabularyItem {
  const ann = annotation({ id: "v1", type: "vocabulary", sourceText: "interstitium" });
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

beforeEach(() => {
  h.askAnnotation.mockReset();
  h.askPageNote.mockReset();
});

afterEach(cleanup);

describe("inspector Ask AI actions", () => {
  it("Annotation inspector Ask AI asks about the annotation", () => {
    render(
      createElement(AnnotationInspector, {
        annotation: annotation(),
        onUpdate: vi.fn(),
        onDelete: vi.fn(),
        onFlush: vi.fn(),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
    expect(h.askAnnotation).toHaveBeenCalledWith("a1");
  });

  it("Vocabulary inspector Ask AI asks about the underlying annotation", () => {
    render(
      createElement(VocabularyInspector, {
        item: vocabularyItem(),
        onConfigure: vi.fn(),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
    expect(h.askAnnotation).toHaveBeenCalledWith("v1");
  });

  it("Annotation-backed Note Ask AI asks about the underlying annotation", () => {
    render(
      createElement(NotesInspector, {
        item: annotationNoteItem(),
        focusRequest: 0,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
    expect(h.askAnnotation).toHaveBeenCalledWith("a1");
    expect(h.askPageNote).not.toHaveBeenCalled();
  });

  it("Standalone Page Note Ask AI asks about the page note", () => {
    render(
      createElement(NotesInspector, {
        item: pageNoteItem(),
        focusRequest: 0,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
    expect(h.askPageNote).toHaveBeenCalledWith("p1");
    expect(h.askAnnotation).not.toHaveBeenCalled();
  });
});
