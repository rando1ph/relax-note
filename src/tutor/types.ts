/**
 * M5 AI Tutor data model.
 *
 * A Tutor context is a frozen snapshot captured at attachment/send time.
 * Once attached, navigating the PDF MUST NOT mutate it. Follow-up turns reuse
 * the frozen snapshot unless the user explicitly replaces it.
 */

export type TutorContextSource =
  | "selection"
  | "annotation"
  | "vocabulary"
  | "page-note"
  | "page";

/** Who authored a note carried as Tutor context. */
export type TutorNoteOrigin = "user" | "ai_tutor";

/**
 * Stable logical identity for a Tutor context. Used to decide whether a new
 * attachment continues the current conversation or starts a fresh one.
 */
export type TutorContextIdentity =
  | { kind: "selection"; page: number; hash: string }
  | { kind: "annotation"; annotationId: string }
  | { kind: "page-note"; pageNoteId: string }
  | { kind: "page"; documentId: string; page: number };

/** AI-generated vocabulary enrichment, kept distinct from user-authored notes. */
export interface TutorVocabularyContext {
  term: string;
  meaningZh: string;
  partOfSpeech: string;
  sourceSentence: string;
  aiGenerated: boolean;
}

/**
 * A point-in-time, immutable-in-practice reading context. All string fields are
 * copied (not referenced), so later mutations of the inputs cannot change it.
 */
export interface TutorContextSnapshot {
  /** Stable logical identity of this context (drives conversation reset). */
  identity: TutorContextIdentity;
  documentId: string;
  documentTitle: string;
  page: number;
  source: TutorContextSource;
  sectionHeading: string | null;
  /** Explicit PDF selection (highest-priority field). */
  selectedText: string | null;
  /** Selected annotation/vocabulary source text. */
  annotationSourceText: string | null;
  /** Bounded local page text around the anchor (or bounded page text). */
  localContextWindow: string;
  /** Optional note Title (annotation Title or Page Note title). */
  noteTitle: string | null;
  /** User-authored Note body, or previously-saved AI material. */
  userNote: string | null;
  /** Provenance of `userNote`: user-authored vs saved AI Tutor material. */
  noteOrigin: TutorNoteOrigin | null;
  /** Relevant vocabulary enrichment for a selected vocabulary item. */
  vocabulary: TutorVocabularyContext | null;
  capturedAt: number;
}

import type { AiFinishReason } from "../ai/types";

export type TutorMessageStatus = "pending" | "complete" | "stopped" | "error";

/** The request metadata stored on a user message for faithful retry. */
export interface TutorRequest {
  snapshot: TutorContextSnapshot;
  question: string;
}

export interface TutorMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  status: TutorMessageStatus;
  errorMessage: string | null;
  /** Present only on user messages; the frozen context + question it was sent with. */
  request: TutorRequest | null;
  /** Assistant messages only: normalized provider finish reason. */
  finishReason?: AiFinishReason | null;
  /**
   * Assistant messages only: id of the assistant message this continues, when
   * this is a "Continue" continuation rather than a fresh answer.
   */
  continuationOf?: string | null;
  /** Set once this answer (or its continuation chain) has been saved to Notes. */
  savedPageNoteId?: string | null;
}

/** True when an assistant message was cut off by the output token limit. */
export function isTruncated(message: TutorMessage): boolean {
  return message.role === "assistant" && message.finishReason === "length";
}

export interface TutorConversation {
  documentId: string;
  messages: TutorMessage[];
  /** Currently attached (frozen) context; null = no explicit anchor. */
  context: TutorContextSnapshot | null;
  /** Identity key of the attached context; drives conversation reset. */
  contextIdentity: string | null;
  updatedAt: number;
}
