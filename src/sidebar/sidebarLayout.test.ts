// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import type { Annotation } from "../annotations/types";
import type { NoteListItem } from "../notes/types";
import type { VocabularyItem } from "../vocabulary/types";
import { emptyEnrichment } from "../vocabulary/types";
import { AnnotationInspector } from "./AnnotationInspector";
import { VocabularyInspector } from "./VocabularyInspector";
import { NotesInspector } from "./NotesInspector";
import { RightSidebar } from "./RightSidebar";

const h = vi.hoisted(() => ({
  askAnnotation: vi.fn(),
  askPageNote: vi.fn(),
  annotations: [] as unknown[],
  selectedId: null as string | null,
  updateAnnotation: vi.fn(),
  deleteAnnotation: vi.fn(),
  flushPending: vi.fn(),
  updateNote: vi.fn(),
  flush: vi.fn(),
  updateTitle: vi.fn(),
  deletePageNote: vi.fn(),
  deleteAnnotationNote: vi.fn(),
}));

vi.mock("../state/tutor", () => ({
  useTutor: () => ({ askAnnotation: h.askAnnotation, askPageNote: h.askPageNote }),
}));
vi.mock("../state/annotations", () => ({
  useAnnotations: () => ({
    annotations: h.annotations,
    selectedId: h.selectedId,
    loading: false,
    updateAnnotation: h.updateAnnotation,
    deleteAnnotation: h.deleteAnnotation,
    flushPending: h.flushPending,
  }),
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
vi.mock("../state/vocabulary", () => ({
  useVocabulary: () => ({ isRunning: () => false, configured: true, items: [] }),
}));
vi.mock("../state/workspace", () => ({
  useWorkspace: () => ({ activeTab: null, tabs: [] }),
}));
vi.mock("../state/aiSettings", () => ({
  useAiSettings: () => ({ settings: {}, configured: false, reloadSettings: vi.fn() }),
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

function assertActionBarOutsideScroll(container: HTMLElement) {
  const scroll = container.querySelector(".sidebar-inspector-scroll");
  const bar = container.querySelector(".sidebar-action-bar");
  expect(scroll).toBeTruthy();
  expect(bar).toBeTruthy();
  expect(scroll!.contains(bar!)).toBe(false);
}

afterEach(cleanup);

describe("sidebar layout structure", () => {
  it("annotation inspector keeps actions outside the scroll container", () => {
    const { container } = render(
      createElement(AnnotationInspector, {
        annotation: annotation(),
        onUpdate: vi.fn(),
        onDelete: vi.fn(),
        onFlush: vi.fn(),
      }),
    );
    assertActionBarOutsideScroll(container);
  });

  it("vocabulary inspector keeps actions outside the scroll container", () => {
    const { container } = render(
      createElement(VocabularyInspector, { item: vocabularyItem(), onConfigure: vi.fn() }),
    );
    assertActionBarOutsideScroll(container);
  });

  it("notes inspector keeps actions outside the scroll container", () => {
    const { container } = render(
      createElement(NotesInspector, { item: pageNoteItem(), focusRequest: 0 }),
    );
    assertActionBarOutsideScroll(container);
  });

  it("annotation panel constrains the list region and separates it with a divider", () => {
    h.annotations = [annotation()];
    h.selectedId = "a1";
    const { container } = render(
      createElement(RightSidebar, {
        tab: "annotations",
        onTabChange: vi.fn(),
        onNavigateToAnnotation: vi.fn(),
        onNavigateToNoteAnnotation: vi.fn(),
        onNavigateToNotePage: vi.fn(),
      }),
    );
    const listRegion = container.querySelector(".sidebar-list-region");
    expect(listRegion).toBeTruthy();
    expect(listRegion!.className).toContain("constrained");
    expect(container.querySelector(".sidebar-divider")).toBeTruthy();

    const list = container.querySelector(".annotation-list");
    expect(list).toBeTruthy();
    expect(listRegion!.contains(list!)).toBe(true);
    const scroll = container.querySelector(".sidebar-inspector-scroll");
    expect(scroll!.contains(list!)).toBe(false);
  });
});
