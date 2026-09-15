import { describe, expect, it } from "vitest";
import { createTutorContextSnapshot } from "./context";
import { resolveAnswerChain } from "./conversation";
import { TUTOR_CONTINUE_INSTRUCTION } from "./prompt";
import {
  planContinuationMessages,
  planNormalMessages,
  planSendMessages,
} from "./requestPlan";
import type { TutorMessage } from "./types";

function snapshot(page: number) {
  return createTutorContextSnapshot(
    {
      documentId: "doc",
      documentTitle: "Doc",
      page,
      source: "page",
      sectionHeading: null,
      selectedText: null,
      annotationSourceText: null,
      userNote: null,
      vocabulary: null,
    },
    "",
    0,
  );
}

function user(id: string, question: string, page: number): TutorMessage {
  return {
    id,
    role: "user",
    content: question,
    createdAt: 0,
    status: "complete",
    errorMessage: null,
    request: { snapshot: snapshot(page), question },
  };
}

function assistant(
  id: string,
  content: string,
  overrides: Partial<TutorMessage> = {},
): TutorMessage {
  return {
    id,
    role: "assistant",
    content,
    createdAt: 0,
    status: "complete",
    errorMessage: null,
    request: null,
    finishReason: "stop",
    continuationOf: null,
    savedPageNoteId: null,
    ...overrides,
  };
}

describe("request planners", () => {
  it("planSendMessages excludes the just-appended pending turn from history", () => {
    const messages = [
      user("u0", "first", 1),
      assistant("a0", "first answer"),
      user("u1", "second", 2),
      assistant("a1", "", { status: "pending" }),
    ];
    const planned = planSendMessages(messages, snapshot(2), "second");
    // system + one history turn + current user
    expect(planned).toHaveLength(4);
    expect(planned[1].content).toBe("first");
    expect(planned[2].content).toBe("first answer");
    expect(planned[3].content).toContain("second");
  });

  it("planContinuationMessages keeps the frozen snapshot and appends the partial answer", () => {
    const messages = [user("u1", "Why?", 304), assistant("a1", "partial answer", { finishReason: "length" })];
    const chain = resolveAnswerChain(messages, "a1")!;
    const planned = planContinuationMessages(messages, chain);

    // system + (no history) + user question + assistant partial + continue
    expect(planned).toHaveLength(4);
    expect(planned[1].role).toBe("user");
    expect(planned[1].content).toContain('"page": 304');
    expect(planned[1].content).toContain("Why?");
    expect(planned[2]).toEqual({ role: "assistant", content: "partial answer" });
    expect(planned[3]).toEqual({ role: "user", content: TUTOR_CONTINUE_INSTRUCTION });
  });

  it("planNormalMessages uses the frozen snapshot page, not a live page", () => {
    const messages = [user("u1", "Q", 304), assistant("a1", "", { status: "error" })];
    const planned = planNormalMessages(messages, messages[0]);
    expect(planned[1].content).toContain('"page": 304');
  });
});
