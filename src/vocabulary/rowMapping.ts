import type { VocabularyEnrichment, VocabularyStatus } from "./types";

/**
 * Shape of a `vocabulary_enrichment` row. The legacy `definition_en` and
 * `contextual_explanation` columns still exist (migration 11) and may be
 * present on old rows, but are intentionally ignored by the active model.
 */
export interface VocabularyEnrichmentRowShape {
  annotation_id: string;
  status: string;
  lemma: string;
  display_term: string;
  part_of_speech: string;
  ipa_uk: string;
  meaning_zh: string;
  definition_en?: string;
  contextual_explanation?: string;
  domain: string;
  domain_specific: number;
  user_edited: number;
  error_message: string | null;
  model: string | null;
  prompt_version: string | null;
  generated_at: number | null;
  updated_at: number;
}

/**
 * Maps a database row to the active enrichment model. Legacy columns are
 * tolerated and ignored, so rows written by the previous schema load without
 * crashing.
 */
export function enrichmentFromRow(
  row: VocabularyEnrichmentRowShape,
): VocabularyEnrichment {
  return {
    status: row.status as VocabularyStatus,
    fields: {
      lemma: row.lemma,
      displayTerm: row.display_term,
      partOfSpeech: row.part_of_speech,
      ipaUk: row.ipa_uk,
      meaningZh: row.meaning_zh,
      domain: row.domain,
      domainSpecific: row.domain_specific === 1,
    },
    provenance: {
      model: row.model,
      promptVersion: row.prompt_version,
      generatedAt: row.generated_at,
    },
    userEdited: row.user_edited === 1,
    errorMessage: row.error_message,
    updatedAt: row.updated_at,
  };
}
