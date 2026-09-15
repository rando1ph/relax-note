import type { AiMessage } from "../ai/types";
import type { TutorMessage } from "./types";

/**
 * Bounded conversation-history trimming. Keeps only complete user/assistant
 * turns, drops the oldest first, and stays under the Rust transport limits
 * (MAX_MESSAGES = 16, MAX_MESSAGE_BYTES = 32 KB). Pending/stopped/error
 * assistant turns and their unanswered user message are excluded.
 */

export interface TutorHistoryLimits {
  maxTurns: number;
  maxChars: number;
}

export const TUTOR_HISTORY_LIMITS: TutorHistoryLimits = {
  maxTurns: 6,
  maxChars: 12_000,
};

interface CompletedTurn {
  user: TutorMessage;
  assistant: TutorMessage;
}

/** Extracts completed turns (chronological), skipping unanswered/stale messages. */
export function completedTurns(messages: TutorMessage[]): CompletedTurn[] {
  const turns: CompletedTurn[] = [];
  let i = 0;
  while (i < messages.length) {
    const message = messages[i];
    if (message.role === "user") {
      const assistant = messages[i + 1];
      if (
        assistant &&
        assistant.role === "assistant" &&
        assistant.status === "complete" &&
        assistant.content.trim().length > 0
      ) {
        // Merge completed continuation messages into the turn's answer so a
        // continued answer is represented once, in full, in history.
        let content = assistant.content;
        let previous = assistant;
        let j = i + 2;
        while (
          messages[j] &&
          messages[j].role === "assistant" &&
          messages[j].status === "complete" &&
          messages[j].content.trim().length > 0 &&
          messages[j].continuationOf === previous.id
        ) {
          content += `\n\n${messages[j].content}`;
          previous = messages[j];
          j += 1;
        }
        turns.push({ user: message, assistant: { ...assistant, content } });
        i = j;
      } else {
        // Unanswered user message (pending/stopped/error or trailing): skip.
        i += 1;
      }
    } else {
      // Stray assistant message: skip.
      i += 1;
    }
  }
  return turns;
}

/**
 * Trims conversation messages to a bounded `AiMessage[]` of recent complete
 * turns, oldest dropped first, respecting both a turn cap and a char budget.
 */
export function trimTutorHistory(
  messages: TutorMessage[],
  limits: TutorHistoryLimits = TUTOR_HISTORY_LIMITS,
): AiMessage[] {
  let turns = completedTurns(messages);
  if (turns.length > limits.maxTurns) {
    turns = turns.slice(turns.length - limits.maxTurns);
  }

  let result = turns.flatMap((turn) => [
    { role: "user" as const, content: turn.user.content },
    { role: "assistant" as const, content: turn.assistant.content },
  ]);

  let totalChars = result.reduce((sum, message) => sum + message.content.length, 0);
  while (result.length > 0 && totalChars > limits.maxChars) {
    result = result.slice(2);
    totalChars = result.reduce((sum, message) => sum + message.content.length, 0);
  }

  return result;
}
