// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, render } from "@testing-library/react";
import type { Annotation } from "../annotations/types";
import type { NoteListItem } from "../notes/types";
import type { VocabularyItem } from "../vocabulary/types";
import { emptyEnrichment } from "../vocabulary/types";
import { buildTutorContextData } from "../tutor/prompt";
import { TutorProvider, useTutor } from "./tutor";
import type { TutorStore } from "./tutor";

// jsdom may not provide crypto.randomUUID; the provider uses it for ids.
if (typeof globalThis.crypto?.randomUUID !== "function") {
  Object.defineProperty(globalThis, "crypto", {
    value: {
      ...globalThis.crypto,
      randomUUID: () => `id-${Math.random().toString(36).slice(2)}`,
    },
    configurable: true,
  });
}

type Deferred = {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

function deferred(): Deferred {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const h = vi.hoisted(() => {
  const state = {
    invoke: vi.fn(),
    createTutorPageNote: vi.fn(),
    createHighlight: vi.fn(),
    createVocabulary: vi.fn(),
    workspace: {
      activeTab: { id: "doc", title: "Doc", readerState: { currentPage: 305 } },
      tabs: [{ id: "doc", title: "Doc" }],
      getDocumentProxy: () => null,
    },
    annotations: [] as unknown[],
    vocabulary: { items: [] as unknown[] },
    notes: { items: [] as unknown[] },
    aiSettings: {
      settings: { baseUrl: "https://host/v1", model: "m", autoEnrich: true, jsonMode: false },
      configured: true,
    },
  };
  return { state };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => h.state.invoke(...args),
}));
vi.mock("./workspace", () => ({ useWorkspace: () => h.state.workspace }));
vi.mock("./annotations", () => ({
  useAnnotations: () => ({
    annotations: h.state.annotations,
    selectedId: null,
    createHighlight: h.state.createHighlight,
    createVocabulary: h.state.createVocabulary,
  }),
}));
vi.mock("./vocabulary", () => ({ useVocabulary: () => h.state.vocabulary }));
vi.mock("./notes", () => ({
  useNotes: () => ({
    items: h.state.notes.items,
    createTutorPageNote: h.state.createTutorPageNote,
  }),
}));
vi.mock("./aiSettings", () => ({ useAiSettings: () => h.state.aiSettings }));

let api: TutorStore | null = null;

function Probe() {
  api = useTutor();
  return null;
}

function renderProvider() {
  render(createElement(TutorProvider, null, createElement(Probe)));
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

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
    pageNumber: 304,
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

beforeEach(() => {
  api = null;
  h.state.invoke.mockReset();
  h.state.createTutorPageNote.mockReset();
  h.state.createTutorPageNote.mockResolvedValue({ id: "note-1" });
  h.state.createHighlight.mockReset();
  h.state.createVocabulary.mockReset();
  h.state.annotations = [];
  h.state.vocabulary.items = [];
  h.state.notes.items = [];
  h.state.workspace.activeTab = {
    id: "doc",
    title: "Doc",
    readerState: { currentPage: 305 },
  };
  h.state.aiSettings = {
    settings: { baseUrl: "https://host/v1", model: "m", autoEnrich: true, jsonMode: false },
    configured: true,
  };
  h.state.invoke.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "ai_has_api_key":
      case "ai_credential_store_available":
        return true;
      case "ai_chat":
        return { content: "answer", model: "m", finishReason: "stop" };
      default:
        return undefined;
    }
  });
});

afterEach(cleanup);

describe("TutorProvider integration", () => {
  it("A. annotation Ask AI attaches context, requests open, and creates no annotation", async () => {
    h.state.annotations = [annotation({ title: "Key", note: "My note" })];
    renderProvider();
    await flush();

    await act(async () => {
      api!.askAnnotation("a1");
    });
    await flush();

    expect(api!.openRequested).toBe(true);
    expect(api!.draftQuestion).toBe("Explain this annotation.");
    const ctx = api!.conversation?.context;
    expect(ctx?.identity).toEqual({ kind: "annotation", annotationId: "a1" });
    expect(ctx?.source).toBe("annotation");
    expect(ctx?.page).toBe(304);
    expect(ctx?.annotationSourceText).toContain("interstitium");
    expect(ctx?.userNote).toBe("My note");
    expect(ctx?.noteTitle).toBe("Key");
    expect(api!.conversation?.contextIdentity).toBe("annotation:a1");
    expect(h.state.createHighlight).not.toHaveBeenCalled();
    expect(h.state.createVocabulary).not.toHaveBeenCalled();
  });

  it("B. re-asking the same annotation preserves history", async () => {
    h.state.annotations = [annotation()];
    renderProvider();
    await flush();

    await act(async () => api!.askAnnotation("a1"));
    await flush();
    await act(async () => api!.send("q1"));
    await flush();
    expect(api!.conversation?.messages).toHaveLength(2);

    await act(async () => api!.askAnnotation("a1"));
    await flush();
    expect(api!.conversation?.messages).toHaveLength(2);
    expect(api!.conversation?.contextIdentity).toBe("annotation:a1");
  });

  it("C. a different annotation resets history", async () => {
    h.state.annotations = [
      annotation({ id: "a1" }),
      annotation({
        id: "b2",
        segments: [
          { pageNumber: 1703, rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.02 }, seq: 0 },
        ],
      }),
    ];
    renderProvider();
    await flush();

    await act(async () => api!.askAnnotation("a1"));
    await flush();
    await act(async () => api!.send("q1"));
    await flush();
    expect(api!.conversation?.messages).toHaveLength(2);

    await act(async () => api!.askAnnotation("b2"));
    await flush();
    expect(api!.conversation?.messages).toHaveLength(0);
    expect(api!.conversation?.contextIdentity).toBe("annotation:b2");
    expect(api!.conversation?.context?.page).toBe(1703);
  });

  it("D. vocabulary Ask AI includes only the selected item's metadata", async () => {
    const vocabAnn = annotation({ id: "v1", type: "vocabulary", sourceText: "interstitium" });
    h.state.annotations = [vocabAnn];
    h.state.vocabulary.items = [vocabularyItem(vocabAnn)];
    renderProvider();
    await flush();

    await act(async () => api!.askAnnotation("v1"));
    await flush();

    const ctx = api!.conversation?.context;
    expect(ctx?.source).toBe("vocabulary");
    expect(ctx?.vocabulary).toMatchObject({
      term: "interstitium",
      meaningZh: "间质",
      partOfSpeech: "n.",
      aiGenerated: true,
    });
  });

  it("F. page-note Ask AI uses the stored page, not the live page", async () => {
    h.state.workspace.activeTab.readerState.currentPage = 305;
    h.state.notes.items = [pageNoteItem({ pageNumber: 304, note: "# Body" })];
    renderProvider();
    await flush();

    await act(async () => api!.askPageNote("p1"));
    await flush();

    const ctx = api!.conversation?.context;
    expect(ctx?.page).toBe(304);
    expect(ctx?.source).toBe("page-note");
    expect(ctx?.userNote).toContain("# Body");
    expect(ctx?.noteTitle).toBe("Lesion note");
    expect(api!.conversation?.contextIdentity).toBe("page-note:p1");
  });

  it("G. ai_tutor page note preserves provenance and is never mutated", async () => {
    const item = pageNoteItem({ origin: "ai_tutor", note: "AI body" });
    const before = JSON.parse(JSON.stringify(item));
    h.state.notes.items = [item];
    renderProvider();
    await flush();

    await act(async () => api!.askPageNote("p1"));
    await flush();

    const ctx = api!.conversation!.context!;
    expect(ctx.noteOrigin).toBe("ai_tutor");
    const data = buildTutorContextData(ctx);
    expect(data.ai_generated_note).toBe("AI body");
    expect(data).not.toHaveProperty("user_note");
    expect(item).toEqual(before);
  });

  it("H. switching context cancels the in-flight request", async () => {
    const d = deferred();
    h.state.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "ai_has_api_key") return true;
      if (cmd === "ai_chat") return d.promise;
      if (cmd === "ai_cancel") {
        d.reject(new Error("AI request was cancelled"));
        return undefined;
      }
      return undefined;
    });
    h.state.annotations = [
      annotation({ id: "a1" }),
      annotation({
        id: "b2",
        segments: [
          { pageNumber: 1703, rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.02 }, seq: 0 },
        ],
      }),
    ];
    renderProvider();
    await flush();

    await act(async () => api!.askAnnotation("a1"));
    await flush();
    await act(async () => api!.send("q"));
    await flush();
    expect(api!.conversation?.messages).toHaveLength(2);

    await act(async () => api!.askAnnotation("b2"));
    await flush();

    expect(h.state.invoke.mock.calls.some((call) => call[0] === "ai_cancel")).toBe(true);
    expect(api!.conversation?.messages).toHaveLength(0);
  });

  it("H2. a late old-context response is ignored after a switch", async () => {
    const d = deferred();
    h.state.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "ai_has_api_key") return true;
      if (cmd === "ai_chat") return d.promise;
      // ai_cancel is best-effort here; the late response still arrives.
      return undefined;
    });
    h.state.annotations = [
      annotation({ id: "a1" }),
      annotation({
        id: "b2",
        segments: [
          { pageNumber: 1703, rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.02 }, seq: 0 },
        ],
      }),
    ];
    renderProvider();
    await flush();

    await act(async () => api!.askAnnotation("a1"));
    await flush();
    await act(async () => api!.send("q"));
    await flush();

    await act(async () => api!.askAnnotation("b2"));
    await flush();
    expect(api!.conversation?.messages).toHaveLength(0);

    await act(async () => {
      d.resolve({ content: "late answer", model: "m", finishReason: "stop" });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(api!.conversation?.messages).toHaveLength(0);
  });

  it("Stop marks the assistant message stopped", async () => {
    const d = deferred();
    h.state.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "ai_has_api_key") return true;
      if (cmd === "ai_chat") return d.promise;
      if (cmd === "ai_cancel") {
        d.reject(new Error("AI request was cancelled"));
        return undefined;
      }
      return undefined;
    });
    h.state.annotations = [annotation()];
    renderProvider();
    await flush();

    await act(async () => api!.askAnnotation("a1"));
    await flush();
    await act(async () => api!.send("q"));
    await flush();

    await act(async () => {
      api!.stop();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(api!.conversation?.messages[1].status).toBe("stopped");
  });

  it("Clear during a request prevents resurrection", async () => {
    const d = deferred();
    h.state.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "ai_has_api_key") return true;
      if (cmd === "ai_chat") return d.promise;
      return undefined;
    });
    h.state.annotations = [annotation()];
    renderProvider();
    await flush();

    await act(async () => api!.askAnnotation("a1"));
    await flush();
    await act(async () => api!.send("q"));
    await flush();

    await act(async () => api!.clear());
    await flush();
    expect(api!.conversation?.messages).toHaveLength(0);

    await act(async () => {
      d.resolve({ content: "late answer", model: "m", finishReason: "stop" });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(api!.conversation?.messages).toHaveLength(0);
  });

  it("Retry re-sends without duplicating the user message", async () => {
    let attempt = 0;
    h.state.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "ai_has_api_key") return true;
      if (cmd === "ai_chat") {
        attempt += 1;
        if (attempt === 1) throw new Error("boom");
        return { content: "ok", model: "m", finishReason: "stop" };
      }
      return undefined;
    });
    h.state.annotations = [annotation()];
    renderProvider();
    await flush();

    await act(async () => api!.askAnnotation("a1"));
    await flush();
    await act(async () => api!.send("q"));
    await flush();
    expect(api!.conversation?.messages).toHaveLength(2);
    expect(api!.conversation?.messages[1].status).toBe("error");

    const assistantId = api!.conversation!.messages[1].id;
    await act(async () => api!.retry(assistantId));
    await flush();
    expect(api!.conversation?.messages).toHaveLength(2);
    expect(api!.conversation?.messages[1].status).toBe("complete");
    expect(api!.conversation?.messages[1].content).toBe("ok");
  });

  it("Continue appends a continuation after finishReason=length", async () => {
    let attempt = 0;
    h.state.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "ai_has_api_key") return true;
      if (cmd === "ai_chat") {
        attempt += 1;
        return attempt === 1
          ? { content: "partial", model: "m", finishReason: "length" }
          : { content: "rest", model: "m", finishReason: "stop" };
      }
      return undefined;
    });
    h.state.annotations = [annotation()];
    renderProvider();
    await flush();

    await act(async () => api!.askAnnotation("a1"));
    await flush();
    await act(async () => api!.send("q"));
    await flush();
    expect(api!.conversation?.messages[1].finishReason).toBe("length");

    const assistantId = api!.conversation!.messages[1].id;
    await act(async () => api!.continueFrom(assistantId));
    await flush();

    expect(api!.conversation?.messages).toHaveLength(3);
    expect(api!.conversation?.messages[2].content).toBe("rest");
    expect(api!.conversation?.messages[2].continuationOf).toBe(assistantId);

    const chatCalls = h.state.invoke.mock.calls.filter((call) => call[0] === "ai_chat");
    const lastArgs = chatCalls[chatCalls.length - 1][1] as {
      messages: { content: string }[];
    };
    expect(
      lastArgs.messages.some((m) => m.content?.includes("Continue the previous answer")),
    ).toBe(true);
  });

  it("Save to Page Note uses the frozen snapshot page", async () => {
    h.state.annotations = [annotation()]; // page 304
    h.state.workspace.activeTab.readerState.currentPage = 999;
    renderProvider();
    await flush();

    await act(async () => api!.askAnnotation("a1"));
    await flush();
    await act(async () => api!.send("q"));
    await flush();

    const assistantId = api!.conversation!.messages[1].id;
    await act(async () => api!.saveToPageNote(assistantId));
    await flush();

    expect(h.state.createTutorPageNote).toHaveBeenCalledTimes(1);
    const arg = h.state.createTutorPageNote.mock.calls[0][0] as {
      pageNumber: number;
      note: string;
    };
    expect(arg.pageNumber).toBe(304);
    expect(arg.note).toContain("### Question");
    expect(arg.note).toContain("### AI Tutor");
    expect(arg.note).toContain("answer");
    expect(api!.conversation?.messages[1].savedPageNoteId).toBe("note-1");

    // Duplicate-save protection.
    await act(async () => api!.saveToPageNote(assistantId));
    await flush();
    expect(h.state.createTutorPageNote).toHaveBeenCalledTimes(1);
  });
});
