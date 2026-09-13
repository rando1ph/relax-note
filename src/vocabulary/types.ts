import type { Annotation } from "../annotations/types";

/**
 * Vocabulary is a specialized `Annotation` type. Local/source-derived data is
 * authoritative and lives in the `vocabulary` table; AI-generated data is
 * replaceable enrichment in `vocabulary_enrichment`, keyed 1:1 to annotation id.
 */

export type VocabularyStatus = "pending" | "ready" | "failed";

/** Authoritative local/source-derived vocabulary data. */
export interface VocabularyLocal {
  annotationId: string;
  sourceSentence: string;
  contextBefore: string;
  contextAfter: string;
  sectionHeading: string | null;
  createdAt: number;
}

/**
 * Active generated lexicographic fields (small, concise, bilingual).
 * `meaningZh` is the primary useful output. The legacy `definition_en` and
 * `contextual_explanation` columns remain in the database (migration 11) for
 * backward compatibility but are no longer part of the active model.
 */
export interface VocabularyFields {
  lemma: string;
  displayTerm: string;
  partOfSpeech: string;
  ipaUk: string;
  meaningZh: string;
  domain: string;
  domainSpecific: boolean;
}

/** Lightweight provenance for regeneration. */
export interface VocabularyProvenance {
  model: string | null;
  promptVersion: string | null;
  generatedAt: number | null;
}

export interface VocabularyEnrichment {
  status: VocabularyStatus;
  fields: VocabularyFields;
  provenance: VocabularyProvenance;
  userEdited: boolean;
  errorMessage: string | null;
  updatedAt: number;
}

export interface VocabularyItem {
  annotation: Annotation;
  local: VocabularyLocal | null;
  enrichment: VocabularyEnrichment;
}

export const EMPTY_VOCABULARY_FIELDS: VocabularyFields = {
  lemma: "",
  displayTerm: "",
  partOfSpeech: "",
  ipaUk: "",
  meaningZh: "",
  domain: "",
  domainSpecific: false,
};

export function emptyEnrichment(updatedAt = 0): VocabularyEnrichment {
  return {
    status: "pending",
    fields: { ...EMPTY_VOCABULARY_FIELDS },
    provenance: { model: null, promptVersion: null, generatedAt: null },
    userEdited: false,
    errorMessage: null,
    updatedAt,
  };
}

/** The AI context payload (untrusted PDF data). */
export interface VocabularyContextPayload {
  documentTitle: string;
  page: number;
  selectedTerm: string;
  sourceSentence: string | null;
  previousSentence: string | null;
  nextSentence: string | null;
  sectionHeading: string | null;
  contextWindow: string;
}
