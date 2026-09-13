import { describe, expect, it } from "vitest";
import { applyEnrichmentEvent, isRegenerationFailurePreserved } from "./enrichmentMachine";
import { emptyEnrichment } from "./types";
import type { VocabularyFields } from "./types";

const fields: VocabularyFields = {
  lemma: "ubiquitous",
  displayTerm: "ubiquitous",
  partOfSpeech: "adj.",
  ipaUk: "juːˈbɪkwɪtəs",
  meaningZh: "无处不在的",
  domain: "general",
  domainSpecific: false,
};

describe("applyEnrichmentEvent", () => {
  it("marks a first-generation failure as failed", () => {
    const result = applyEnrichmentEvent(emptyEnrichment(), {
      type: "failure",
      error: "Network error",
      at: 1,
    });
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("Network error");
  });

  it("a successful generation becomes ready with provenance", () => {
    const result = applyEnrichmentEvent(emptyEnrichment(), {
      type: "success",
      fields,
      model: "m",
      promptVersion: "vocabulary_prompt_v1",
      generatedAt: 10,
    });
    expect(result.status).toBe("ready");
    expect(result.fields.meaningZh).toBe("无处不在的");
    expect(result.provenance.model).toBe("m");
  });

  it("preserves last good fields and provenance on regeneration failure", () => {
    const ready = applyEnrichmentEvent(emptyEnrichment(), {
      type: "success",
      fields,
      model: "m",
      promptVersion: "vocabulary_prompt_v1",
      generatedAt: 10,
    });
    const failed = applyEnrichmentEvent(ready, {
      type: "failure",
      error: "Regeneration failed",
      at: 20,
    });
    expect(isRegenerationFailurePreserved(ready, failed)).toBe(true);
    expect(failed.status).toBe("ready");
    expect(failed.errorMessage).toBe("Regeneration failed");
  });

  it("a successful regeneration replaces fields and provenance", () => {
    const ready = applyEnrichmentEvent(emptyEnrichment(), {
      type: "success",
      fields,
      model: "old",
      promptVersion: "v0",
      generatedAt: 10,
    });
    const regenerated = applyEnrichmentEvent(ready, {
      type: "success",
      fields: { ...fields, meaningZh: "随处可见的" },
      model: "new",
      promptVersion: "vocabulary_prompt_v1",
      generatedAt: 30,
    });
    expect(regenerated.fields.meaningZh).toBe("随处可见的");
    expect(regenerated.provenance.model).toBe("new");
  });
});
