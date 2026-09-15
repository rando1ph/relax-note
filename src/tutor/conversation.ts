import type { AiFinishReason } from "../ai/types";
import type { TutorContextSnapshot, TutorConversation, TutorMessage } from "./types";

/**
 * Pure conversation transitions. Kept separate from the provider so request
 * safety and document scoping are unit-testable without React.
 */

export function emptyConversation(documentId: string): TutorConversation {
  return { documentId, messages: [], context: null, contextIdentity: null, updatedAt: 0 };
}

export type ConversationEvent =
  | {
      type: "set-context";
      documentId: string;
      context: TutorContextSnapshot | null;
      identity: string | null;
    }
  | { type: "send"; documentId: string; user: TutorMessage; assistant: TutorMessage }
  | { type: "add-assistant"; documentId: string; assistant: TutorMessage }
  | {
      type: "complete";
      documentId: string;
      assistantId: string;
      content: string;
      finishReason: AiFinishReason | null;
    }
  | { type: "fail"; documentId: string; assistantId: string; error: string }
  | { type: "stop"; documentId: string; assistantId: string }
  | { type: "retry"; documentId: string; assistantId: string }
  | { type: "mark-saved"; documentId: string; messageIds: string[]; pageNoteId: string }
  | { type: "clear"; documentId: string };

export function applyConversationEvent(
  map: ReadonlyMap<string, TutorConversation>,
  event: ConversationEvent,
  now: number = Date.now(),
): Map<string, TutorConversation> {
  const next = new Map(map);
  const current = next.get(event.documentId) ?? emptyConversation(event.documentId);

  const update = (patched: TutorConversation) => {
    next.set(event.documentId, { ...patched, updatedAt: now });
  };

  switch (event.type) {
    case "set-context": {
      // Attaching a genuinely different context starts a fresh conversation so
      // unrelated previous-context turns are never sent to the model.
      const changed = current.contextIdentity !== event.identity;
      update({
        ...current,
        context: event.context,
        contextIdentity: event.identity,
        messages: changed ? [] : current.messages,
      });
      break;
    }

    case "send":
      update({
        ...current,
        messages: [...current.messages, event.user, event.assistant],
      });
      break;

    case "add-assistant":
      update({ ...current, messages: [...current.messages, event.assistant] });
      break;

    case "complete":
      update({
        ...current,
        messages: current.messages.map((m) =>
          m.id === event.assistantId
            ? {
                ...m,
                content: event.content,
                status: "complete",
                finishReason: event.finishReason,
                errorMessage: null,
              }
            : m,
        ),
      });
      break;

    case "fail":
      update({
        ...current,
        messages: current.messages.map((m) =>
          m.id === event.assistantId ? { ...m, status: "error", errorMessage: event.error } : m,
        ),
      });
      break;

    case "stop":
      update({
        ...current,
        messages: current.messages.map((m) =>
          m.id === event.assistantId ? { ...m, status: "stopped", errorMessage: null } : m,
        ),
      });
      break;

    case "retry":
      update({
        ...current,
        messages: current.messages.map((m) =>
          m.id === event.assistantId
            ? {
                ...m,
                content: "",
                status: "pending",
                finishReason: null,
                errorMessage: null,
              }
            : m,
        ),
      });
      break;

    case "mark-saved": {
      const ids = new Set(event.messageIds);
      update({
        ...current,
        messages: current.messages.map((m) =>
          ids.has(m.id) ? { ...m, savedPageNoteId: event.pageNoteId } : m,
        ),
      });
      break;
    }

    case "clear":
      update({ ...current, messages: [], context: null, contextIdentity: null });
      break;
  }

  return next;
}

export interface AnswerChain {
  rootUser: TutorMessage | null;
  rootAssistant: TutorMessage;
  /** Chronological accumulated assistant content from root to the target. */
  accumulated: string;
  /** Message ids from root assistant to the target, in order. */
  messageIds: string[];
}

/**
 * Resolves the assistant "answer chain" ending at `assistantId`: the root
 * assistant message plus any continuation messages chained to it. Used for
 * Continue, retry-of-continuation, and Save-to-Page-Note.
 */
export function resolveAnswerChain(
  messages: TutorMessage[],
  assistantId: string,
): AnswerChain | null {
  const target = messages.find((m) => m.id === assistantId);
  if (!target || target.role !== "assistant") return null;

  const messageIds: string[] = [target.id];
  let current = target;
  while (current.continuationOf) {
    const parent = messages.find((m) => m.id === current.continuationOf);
    if (!parent || parent.role !== "assistant") break;
    messageIds.unshift(parent.id);
    current = parent;
  }

  const rootAssistant = messages.find((m) => m.id === messageIds[0]) ?? target;
  const rootIndex = messages.findIndex((m) => m.id === rootAssistant.id);
  const rootUser =
    rootIndex > 0 && messages[rootIndex - 1]?.role === "user"
      ? messages[rootIndex - 1]
      : null;

  const accumulated = messageIds
    .map((id) => messages.find((m) => m.id === id)?.content ?? "")
    .filter((content) => content.trim().length > 0)
    .join("\n\n");

  return { rootUser, rootAssistant, accumulated, messageIds };
}
