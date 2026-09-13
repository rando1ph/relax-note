import { describe, expect, it } from "vitest";
import { enrichmentFromRow } from "./rowMapping";
import type { VocabularyEnrichmentRowShape } from "./rowMapping";

function row(overrides: Partial<VocabularyEnrichmentRowShape> = {}): VocabularyEnrichmentRowShape {
  return {
    annotation_id: "a",
    status: "ready",
    lemma: "odontoblast",
    display_term: "odontoblasts",
    part_of_speech: "n.",
    ipa_uk: "",
    meaning_zh: "成牙本质细胞",
    domain: "medicine",
    domain_specific: 1,
    user_edited: 0,
    error_message: null,
    model: "m",
    prompt_version: "vocabulary_prompt_v1",
    generated_at: 123,
    updated_at: 123,
    ...overrides,
  };
}

describe("enrichmentFromRow", () => {
  it("maps the active reduced schema", () => {
    const enrichment = enrichmentFromRow(row());
    expect(enrichment.fields.meaningZh).toBe("成牙本质细胞");
    expect(enrichment.fields.domainSpecific).toBe(true);
    expect(enrichment.status).toBe("ready");
  });

  it("loads old rows with legacy columns without crashing", () => {
    const legacy = row({
      definition_en: "a cell of the dental papilla",
      contextual_explanation: "specialized dentin-forming cell",
    });
    const enrichment = enrichmentFromRow(legacy);
    expect(enrichment.fields.meaningZh).toBe("成牙本质细胞");
    expect("definitionEn" in enrichment.fields).toBe(false);
    expect("contextualExplanation" in enrichment.fields).toBe(false);
  });

  it("tolerates a row that lacks the legacy columns entirely", () => {
    const enrichment = enrichmentFromRow(row());
    expect(enrichment.fields.lemma).toBe("odontoblast");
  });
});
