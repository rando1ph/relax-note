import type { AiChatResult, AiMessage } from "../ai/types";
import { debugAi, debugPreview } from "../ai/debug";
import { buildRepairMessages, buildVocabularyMessages } from "./prompt";
import { parseVocabularyResponse } from "./response";
import type { VocabularyContextPayload, VocabularyFields } from "./types";

/** Raised when the model's assistant text cannot be parsed after one repair. */
export class VocabularyFormatError extends Error {
  constructor(message: string) {
    super(`AI returned an invalid format: ${message}`);
    this.name = "VocabularyFormatError";
  }
}

export interface VocabularyEnrichmentResult {
  fields: VocabularyFields;
  model: string;
  repaired: boolean;
}

export type CallModel = (messages: AiMessage[]) => Promise<AiChatResult>;

function parseAssistantText(content: string) {
  debugAi("enrich:response", {
    contentLength: content.length,
    preview: debugPreview(content),
  });
  const parsed = parseVocabularyResponse(content);
  if (!parsed.ok) debugAi("enrich:parse-failed", { error: parsed.error });
  return parsed;
}

/**
 * Requests vocabulary enrichment with at most one automatic format-repair
 * retry. Transport errors propagate unchanged; a persistent format failure is
 * surfaced as `VocabularyFormatError`. Never recursive.
 */
export async function requestVocabularyEnrichment(
  callModel: CallModel,
  payload: VocabularyContextPayload,
): Promise<VocabularyEnrichmentResult> {
  const first = await callModel(buildVocabularyMessages(payload));
  const parsed = parseAssistantText(first.content);
  if (parsed.ok) {
    return { fields: parsed.fields, model: first.model, repaired: false };
  }

  debugAi("enrich:repair-attempt", { selectedTerm: payload.selectedTerm });
  const repair = await callModel(buildRepairMessages(payload, first.content));
  const repaired = parseAssistantText(repair.content);
  if (repaired.ok) {
    return { fields: repaired.fields, model: repair.model, repaired: true };
  }

  throw new VocabularyFormatError(repaired.error);
}
