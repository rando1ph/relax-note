import type { Annotation } from "../annotations/types";
import { emptyEnrichment } from "./types";
import type { VocabularyEnrichment, VocabularyItem, VocabularyLocal } from "./types";
import { sortVocabularyItems } from "./sort";

export interface VocabularyMetadataEntry {
  local: VocabularyLocal;
  enrichment: VocabularyEnrichment;
}

/** Fallback local metadata synthesized from the authoritative annotation. */
export function synthesizeVocabularyLocal(annotation: Annotation): VocabularyLocal {
  return {
    annotationId: annotation.id,
    sourceSentence: annotation.sourceText,
    contextBefore: "",
    contextAfter: "",
    sectionHeading: null,
    createdAt: annotation.createdAt,
  };
}

/**
 * Builds the Vocabulary list from the shared annotation store plus metadata.
 * Missing metadata rows are synthesized so an annotation is never dropped.
 */
export function buildVocabularyItems(
  annotations: Annotation[],
  metadata: ReadonlyMap<string, VocabularyMetadataEntry>,
): VocabularyItem[] {
  const list = annotations
    .filter((annotation) => annotation.type === "vocabulary")
    .map((annotation) => {
      const entry = metadata.get(annotation.id);
      return {
        annotation,
        local: entry?.local ?? synthesizeVocabularyLocal(annotation),
        enrichment: entry?.enrichment ?? emptyEnrichment(annotation.updatedAt),
      };
    });
  return sortVocabularyItems(list);
}
