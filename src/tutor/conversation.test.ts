import { describe, expect, it } from "vitest";
import { applyConversationEvent, emptyConversation, resolveAnswerChain } from "./conversation";
import { createTutorContextSnapshot } from "./context";
import type { TutorConversation, TutorMessage } from "./types";

function user(id: string, content: string): TutorMessage {
  return { id, role: "user", content, createdAt: 0, status: "complete", errorMessage: null, request: null };
}

function assistant(id: string, status: TutorMessage["status"] = "pending"): TutorMessage {
  return { id, role: "assistant", content: "", createdAt: 0, status, errorMessage: null, request: null };
}

function conversationFor(map: Map<string, TutorConversation>, docId: string): TutorConversation {
  return map.get(docId) ?? emptyConversation(docId);
}

describe("Tutor conversation", () => {
  it("send appends a user message and a pending assistant placeholder", () => {
    let map = new Map<string, TutorConversation>();
    map = applyConversationEvent(map, { type: "send", documentId: "doc", user: user("u1", "hello"), assistant: assistant("a1") }, 1);
    const conv = conversationFor(map, "doc");
    expect(conv.messages).toHaveLength(2);
    expect(conv.messages[0].role).toBe("user");
    expect(conv.messages[1].status).toBe("pending");
  });

  it("success completes the assistant message", () => {
    let map = new Map<string, TutorConversation>();
    map = applyConversationEvent(map, { type: "send", documentId: "doc", user: user("u1", "hello"), assistant: assistant("a1") }, 1);
    map = applyConversationEvent(map, { type: "complete", documentId: "doc", assistantId: "a1", content: "answer", finishReason: "stop" }, 2);
    const conv = conversationFor(map, "doc");
    expect(conv.messages[1].status).toBe("complete");
    expect(conv.messages[1].content).toBe("answer");
  });

  it("failure marks the assistant message as error without deleting history", () => {
    let map = new Map<string, TutorConversation>();
    map = applyConversationEvent(map, { type: "send", documentId: "doc", user: user("u1", "hello"), assistant: assistant("a1") }, 1);
    map = applyConversationEvent(map, { type: "fail", documentId: "doc", assistantId: "a1", error: "boom" }, 2);
    const conv = conversationFor(map, "doc");
    expect(conv.messages).toHaveLength(2);
    expect(conv.messages[1].status).toBe("error");
    expect(conv.messages[1].errorMessage).toBe("boom");
  });

  it("stop marks the message stopped (not error)", () => {
    let map = new Map<string, TutorConversation>();
    map = applyConversationEvent(map, { type: "send", documentId: "doc", user: user("u1", "hello"), assistant: assistant("a1") }, 1);
    map = applyConversationEvent(map, { type: "stop", documentId: "doc", assistantId: "a1" }, 2);
    expect(conversationFor(map, "doc").messages[1].status).toBe("stopped");
  });

  it("retry reuses the same turn without duplicating the user message", () => {
    let map = new Map<string, TutorConversation>();
    map = applyConversationEvent(map, { type: "send", documentId: "doc", user: user("u1", "hello"), assistant: assistant("a1") }, 1);
    map = applyConversationEvent(map, { type: "fail", documentId: "doc", assistantId: "a1", error: "boom" }, 2);
    map = applyConversationEvent(map, { type: "retry", documentId: "doc", assistantId: "a1" }, 3);
    const conv = conversationFor(map, "doc");
    expect(conv.messages).toHaveLength(2);
    expect(conv.messages[1].status).toBe("pending");
    expect(conv.messages[1].errorMessage).toBeNull();
  });

  it("clear empties messages and context", () => {
    let map = new Map<string, TutorConversation>();
    map = applyConversationEvent(map, { type: "send", documentId: "doc", user: user("u1", "hello"), assistant: assistant("a1") }, 1);
    map = applyConversationEvent(map, { type: "clear", documentId: "doc" }, 2);
    const conv = conversationFor(map, "doc");
    expect(conv.messages).toHaveLength(0);
    expect(conv.context).toBeNull();
  });

  it("keeps conversations isolated per document", () => {
    let map = new Map<string, TutorConversation>();
    map = applyConversationEvent(map, { type: "send", documentId: "docA", user: user("u1", "a"), assistant: assistant("a1") }, 1);
    map = applyConversationEvent(map, { type: "send", documentId: "docB", user: user("u2", "b"), assistant: assistant("a2") }, 2);
    expect(conversationFor(map, "docA").messages[0].content).toBe("a");
    expect(conversationFor(map, "docB").messages[0].content).toBe("b");
    expect(conversationFor(map, "docA").messages).toHaveLength(2);
  });
});

describe("Tutor conversation — finish reason, continuation, saved", () => {
  function done(id: string, content: string, overrides: Partial<TutorMessage> = {}): TutorMessage {
    return {
      id,
      role: "assistant",
      content,
      createdAt: 0,
      status: "complete",
      errorMessage: null,
      request: null,
      ...overrides,
    };
  }

  it("stores the normalized finish reason on completion", () => {
    let map = new Map<string, TutorConversation>();
    map = applyConversationEvent(map, { type: "send", documentId: "doc", user: user("u1", "q"), assistant: assistant("a1") }, 1);
    map = applyConversationEvent(
      map,
      { type: "complete", documentId: "doc", assistantId: "a1", content: "partial", finishReason: "length" },
      2,
    );
    expect(conversationFor(map, "doc").messages[1].finishReason).toBe("length");
  });

  it("marks a saved answer chain", () => {
    let map = new Map<string, TutorConversation>();
    map = applyConversationEvent(map, { type: "send", documentId: "doc", user: user("u1", "q"), assistant: assistant("a1") }, 1);
    map = applyConversationEvent(
      map,
      { type: "mark-saved", documentId: "doc", messageIds: ["a1"], pageNoteId: "note-1" },
      2,
    );
    expect(conversationFor(map, "doc").messages[1].savedPageNoteId).toBe("note-1");
  });

  it("resolveAnswerChain merges continuations in order", () => {
    const messages: TutorMessage[] = [
      user("u1", "q"),
      done("a1", "part1"),
      done("a2", "part2", { continuationOf: "a1" }),
    ];
    const chain = resolveAnswerChain(messages, "a2");
    expect(chain?.messageIds).toEqual(["a1", "a2"]);
    expect(chain?.accumulated).toBe("part1\n\npart2");
    expect(chain?.rootUser?.id).toBe("u1");
  });

  it("resolveAnswerChain for a root message returns only itself", () => {
    const messages: TutorMessage[] = [user("u1", "q"), done("a1", "only")];
    const chain = resolveAnswerChain(messages, "a1");
    expect(chain?.messageIds).toEqual(["a1"]);
    expect(chain?.accumulated).toBe("only");
  });
});

describe("Tutor conversation — context identity switching", () => {
  function ctx(page: number) {
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

  function withCompletedTurn(identity: string) {
    let map = new Map<string, TutorConversation>();
    map = applyConversationEvent(
      map,
      { type: "set-context", documentId: "doc", context: ctx(1), identity },
      1,
    );
    map = applyConversationEvent(
      map,
      { type: "send", documentId: "doc", user: user("u1", "q"), assistant: assistant("a1") },
      2,
    );
    map = applyConversationEvent(
      map,
      { type: "complete", documentId: "doc", assistantId: "a1", content: "answer", finishReason: "stop" },
      3,
    );
    return map;
  }

  it("reattaching the same identity preserves messages", () => {
    let map = withCompletedTurn("annotation:a1");
    map = applyConversationEvent(
      map,
      { type: "set-context", documentId: "doc", context: ctx(1), identity: "annotation:a1" },
      4,
    );
    expect(conversationFor(map, "doc").messages).toHaveLength(2);
  });

  it("a different identity resets model history", () => {
    let map = withCompletedTurn("annotation:a1");
    map = applyConversationEvent(
      map,
      { type: "set-context", documentId: "doc", context: ctx(1703), identity: "annotation:b2" },
      4,
    );
    const conv = conversationFor(map, "doc");
    expect(conv.messages).toHaveLength(0);
    expect(conv.contextIdentity).toBe("annotation:b2");
    expect(conv.context?.page).toBe(1703);
  });

  it("a stale response cannot appear after a context switch", () => {
    // Start a turn under context A, then switch to context B (clearing history).
    let map = new Map<string, TutorConversation>();
    map = applyConversationEvent(
      map,
      { type: "set-context", documentId: "doc", context: ctx(1), identity: "annotation:a1" },
      1,
    );
    map = applyConversationEvent(
      map,
      { type: "send", documentId: "doc", user: user("u1", "q"), assistant: assistant("a1") },
      2,
    );
    map = applyConversationEvent(
      map,
      { type: "set-context", documentId: "doc", context: ctx(2), identity: "annotation:b2" },
      3,
    );
    // The late completion for the old assistant message is a no-op.
    map = applyConversationEvent(
      map,
      { type: "complete", documentId: "doc", assistantId: "a1", content: "late", finishReason: "stop" },
      4,
    );
    expect(conversationFor(map, "doc").messages).toHaveLength(0);
  });

  it("clear resets the context identity", () => {
    let map = withCompletedTurn("annotation:a1");
    map = applyConversationEvent(map, { type: "clear", documentId: "doc" }, 4);
    expect(conversationFor(map, "doc").contextIdentity).toBeNull();
    expect(conversationFor(map, "doc").context).toBeNull();
  });
});


