import type { AiMessage } from "../ai/types";
import type { AnswerChain } from "./conversation";
import { trimTutorHistory } from "./history";
import { buildTutorContinuationMessages, buildTutorMessages } from "./prompt";
import type { TutorContextSnapshot, TutorMessage } from "./types";

/**
 * Pure request planners. They keep the frozen-snapshot semantics and the
 * bounded-history policy in one testable place, shared by send / retry /
 * Continue.
 */

/** Messages for a fresh question (history excludes the just-appended turn). */
export function planSendMessages(
  messages: TutorMessage[],
  snapshot: TutorContextSnapshot,
  question: string,
): AiMessage[] {
  const history = trimTutorHistory(messages);
  return buildTutorMessages(snapshot, history, question);
}

/** Messages for retrying a normal (non-continuation) answer. */
export function planNormalMessages(
  messages: TutorMessage[],
  rootUser: TutorMessage,
): AiMessage[] {
  if (!rootUser.request) return [];
  const rootIndex = messages.findIndex((m) => m.id === rootUser.id);
  const history = trimTutorHistory(messages.slice(0, Math.max(0, rootIndex)));
  return buildTutorMessages(rootUser.request.snapshot, history, rootUser.request.question);
}

/**
 * Messages for continuing a truncated answer: the original frozen-context
 * question, the accumulated answer so far, then a continuation instruction.
 */
export function planContinuationMessages(
  messages: TutorMessage[],
  chain: AnswerChain,
): AiMessage[] {
  const rootUser = chain.rootUser;
  if (!rootUser || !rootUser.request) return [];
  const rootIndex = messages.findIndex((m) => m.id === rootUser.id);
  const history = trimTutorHistory(messages.slice(0, Math.max(0, rootIndex)));
  return buildTutorContinuationMessages(
    rootUser.request.snapshot,
    history,
    rootUser.request.question,
    chain.accumulated,
  );
}
