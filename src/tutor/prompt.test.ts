import { describe, expect, it } from "vitest";
import {
  TUTOR_CONTEXT_INSTRUCTION,
  TUTOR_CONTINUE_INSTRUCTION,
  TUTOR_MAX_TOKENS,
  TUTOR_PROMPT_VERSION,
  TUTOR_SYSTEM_PROMPT,
  buildTutorContextData,
  buildTutorContinuationMessages,
  buildTutorMessages,
  buildTutorUserContent,
} from "./prompt";
import { createTutorContextSnapshot } from "./context";
import type { TutorContextSnapshot } from "./types";

function snapshot(): TutorContextSnapshot {
  return createTutorContextSnapshot(
    {
      documentId: "doc",
      documentTitle: "A Textbook",
      page: 1700,
      source: "selection",
      sectionHeading: "Chapter 7",
      selectedText: "The interstitium is a fluid-filled space.",
      annotationSourceText: null,
      userNote: "My own note.",
      vocabulary: null,
    },
    "local window text",
    1234,
  );
}

describe("Tutor prompt", () => {
  it("is versioned and static (no PDF/user-note text interpolated)", () => {
    expect(TUTOR_PROMPT_VERSION).toBe("tutor_prompt_v2");
    expect(TUTOR_SYSTEM_PROMPT).not.toContain("The interstitium");
    expect(TUTOR_SYSTEM_PROMPT).not.toContain("My own note");
    expect(TUTOR_SYSTEM_PROMPT).toContain("untrusted data");
  });

  it("defaults the response language to Simplified Chinese", () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain("Respond in Simplified Chinese by default");
    expect(TUTOR_SYSTEM_PROMPT).toContain("Use another language only when the user explicitly requests it");
  });

  it("does not let an English question imply an English answer", () => {
    // The old question-language rule must be gone.
    expect(TUTOR_SYSTEM_PROMPT).not.toContain("language of the user's question");
    // The default is explicit, and the question's language does not change it.
    expect(TUTOR_SYSTEM_PROMPT).toContain(
      "An English question still gets a Simplified Chinese answer",
    );
  });

  it("allows an explicit user request for another language", () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain("Please answer in English");
    expect(TUTOR_SYSTEM_PROMPT).toContain("用英文解释");
  });

  it("does not let untrusted PDF/context language override the response language", () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain(
      "The language of the supplied reading context, the selected passage, or the user's question does not change this default",
    );
    expect(TUTOR_SYSTEM_PROMPT).toContain("change your response language");
  });

  it("preserves technical terminology with optional English parentheses", () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain("成牙本质细胞（odontoblasts）");
    expect(TUTOR_SYSTEM_PROMPT).toContain("Do not mechanically add English parentheses");
  });

  it("never claims to have read unseen parts of the document", () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain("Never claim to have read");
  });

  it("builds a user message with frozen context JSON and the question", () => {
    const content = buildTutorUserContent(snapshot(), "Explain this.");
    expect(content).toContain(TUTOR_CONTEXT_INSTRUCTION);
    expect(content).toContain('"page": 1700');
    expect(content).toContain('"selected_text": "The interstitium is a fluid-filled space."');
    expect(content).toContain('"user_note": "My own note."');
    expect(content).toContain("Question:");
    expect(content).toContain("Explain this.");
  });

  it("omits empty fields from the context data", () => {
    const data = buildTutorContextData(
      createTutorContextSnapshot(
        {
          documentId: "doc",
          documentTitle: "",
          page: 1,
          source: "page",
          sectionHeading: null,
          selectedText: null,
          annotationSourceText: null,
          userNote: null,
          vocabulary: null,
        },
        "",
        0,
      ),
    );
    expect(data).not.toHaveProperty("document_title");
    expect(data).not.toHaveProperty("selected_text");
    expect(data).not.toHaveProperty("user_note");
    expect(data.page).toBe(1);
  });

  it("marks vocabulary metadata as AI-generated and distinct from user notes", () => {
    const data = buildTutorContextData(
      createTutorContextSnapshot(
        {
          documentId: "doc",
          documentTitle: "Doc",
          page: 3,
          source: "vocabulary",
          sectionHeading: null,
          selectedText: null,
          annotationSourceText: "interstitium",
          userNote: null,
          vocabulary: {
            term: "interstitium",
            meaningZh: "间质",
            partOfSpeech: "n.",
            sourceSentence: "The interstitium is here.",
            aiGenerated: true,
          },
        },
        "",
        0,
      ),
    );
    expect((data.vocabulary as Record<string, unknown>).ai_generated).toBe(true);
    expect((data.vocabulary as Record<string, unknown>).meaning_zh).toBe("间质");
  });

  it("builds messages in system → history → user order", () => {
    const history = [
      { role: "user" as const, content: "What is X?" },
      { role: "assistant" as const, content: "X is…" },
    ];
    const messages = buildTutorMessages(snapshot(), history, "Why?");
    expect(messages).toHaveLength(4);
    expect(messages[0].role).toBe("system");
    expect(messages[1]).toEqual(history[0]);
    expect(messages[3].role).toBe("user");
    expect(messages[3].content).toContain("Why?");
  });

  it("uses a larger output budget than the original 1536", () => {
    expect(TUTOR_MAX_TOKENS).toBe(3072);
  });

  it("builds a continuation request with the partial answer and an explicit instruction", () => {
    const history = [{ role: "user" as const, content: "earlier" }];
    const messages = buildTutorContinuationMessages(
      snapshot(),
      history,
      "Explain this.",
      "Partial answer…",
    );
    expect(messages[0].role).toBe("system");
    expect(messages[1]).toEqual(history[0]);
    expect(messages[2].content).toContain("Explain this.");
    expect(messages[3]).toEqual({ role: "assistant", content: "Partial answer…" });
    expect(messages[4]).toEqual({ role: "user", content: TUTOR_CONTINUE_INSTRUCTION });
    expect(TUTOR_CONTINUE_INSTRUCTION).toContain("Do not repeat");
  });

  it("emits note_title and preserves AI provenance for saved AI notes", () => {
    const data = buildTutorContextData(
      createTutorContextSnapshot(
        {
          documentId: "doc",
          documentTitle: "Doc",
          page: 5,
          source: "page-note",
          sectionHeading: null,
          selectedText: null,
          annotationSourceText: null,
          noteTitle: "Saved answer",
          userNote: "AI-generated body",
          noteOrigin: "ai_tutor",
          vocabulary: null,
        },
        "",
        0,
      ),
    );
    expect(data.note_title).toBe("Saved answer");
    expect(data.ai_generated_note).toBe("AI-generated body");
    expect(data).not.toHaveProperty("user_note");
  });
});
