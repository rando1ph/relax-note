import type { VocabularyEnrichment, VocabularyFields } from "./types";
import { EMPTY_VOCABULARY_FIELDS } from "./types";

/**
 * Pure enrichment transitions.
 *
 * First-generation failure may become `failed`. A regeneration failure of an
 * already-`ready` item must preserve the last good fields and provenance, and
 * expose a non-destructive error.
 */
export type EnrichmentEvent =
  | { type: "start" }
  | {
      type: "success";
      fields: VocabularyFields;
      model: string;
      promptVersion: string;
      generatedAt: number;
    }
  | { type: "failure"; error: string; at: number };

export function applyEnrichmentEvent(
  current: VocabularyEnrichment,
  event: EnrichmentEvent,
): VocabularyEnrichment {
  switch (event.type) {
    case "start":
      return current;
    case "success":
      return {
        ...current,
        status: "ready",
        fields: { ...EMPTY_VOCABULARY_FIELDS, ...event.fields },
        provenance: {
          model: event.model,
          promptVersion: event.promptVersion,
          generatedAt: event.generatedAt,
        },
        errorMessage: null,
        updatedAt: event.generatedAt,
      };
    case "failure":
      if (current.status === "ready") {
        // Preserve last good fields + provenance; surface a soft error.
        return { ...current, errorMessage: event.error, updatedAt: event.at };
      }
      return {
        ...current,
        status: "failed",
        errorMessage: event.error,
        updatedAt: event.at,
      };
  }
}

export function isRegenerationFailurePreserved(
  before: VocabularyEnrichment,
  after: VocabularyEnrichment,
): boolean {
  return (
    before.status === "ready" &&
    after.status === "ready" &&
    JSON.stringify(before.fields) === JSON.stringify(after.fields) &&
    JSON.stringify(before.provenance) === JSON.stringify(after.provenance)
  );
}
