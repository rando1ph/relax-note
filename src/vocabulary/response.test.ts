import { describe, expect, it } from "vitest";
import { extractJsonObject, parseVocabularyResponse } from "./response";

const valid = {
  lemma: "ubiquitous",
  display_term: "ubiquitous",
  part_of_speech: "adj.",
  ipa_uk: "juːˈbɪkwɪtəs",
  meaning_zh: "无处不在的",
  domain: "general",
  domain_specific: false,
};

describe("extractJsonObject", () => {
  it("strips markdown fences", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("strips surrounding prose", () => {
    expect(extractJsonObject('Here you go: {"a":1} hope that helps')).toBe('{"a":1}');
  });

  it("returns null when no object exists", () => {
    expect(extractJsonObject("no json here")).toBeNull();
  });

  it("extracts the first balanced object, not a greedy slice", () => {
    expect(extractJsonObject('prefix {"a":1} trailing {"b":2}')).toBe('{"a":1}');
  });

  it("ignores braces inside strings", () => {
    expect(extractJsonObject('{"meaning_zh":"a {brace} inside","x":1}')).toBe(
      '{"meaning_zh":"a {brace} inside","x":1}',
    );
  });

  it("handles nested objects", () => {
    expect(extractJsonObject('x {"a":{"b":2},"c":3} y')).toBe('{"a":{"b":2},"c":3}');
  });

  it("returns null for a truncated object", () => {
    expect(extractJsonObject('{"a":1')).toBeNull();
  });
});

describe("parseVocabularyResponse", () => {
  it("parses a plain JSON object", () => {
    const result = parseVocabularyResponse(JSON.stringify(valid));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.meaningZh).toBe("无处不在的");
      expect(result.fields.domainSpecific).toBe(false);
    }
  });

  it("parses fenced JSON with prose", () => {
    const raw = `Sure:\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``;
    const result = parseVocabularyResponse(raw);
    expect(result.ok).toBe(true);
  });

  it("coerces string booleans for domain_specific", () => {
    const result = parseVocabularyResponse(JSON.stringify({ ...valid, domain_specific: "true" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields.domainSpecific).toBe(true);
  });

  it("rejects non-JSON", () => {
    const result = parseVocabularyResponse("not json");
    expect(result.ok).toBe(false);
  });

  it("accepts the reduced schema", () => {
    const result = parseVocabularyResponse(JSON.stringify(valid));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.fields).sort()).toEqual([
        "displayTerm",
        "domain",
        "domainSpecific",
        "ipaUk",
        "lemma",
        "meaningZh",
        "partOfSpeech",
      ]);
    }
  });

  it("requires meaning_zh", () => {
    const result = parseVocabularyResponse(JSON.stringify({ lemma: "x" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.toLowerCase()).toContain("chinese meaning");
  });

  it("ignores legacy definition_en/contextual_explanation fields", () => {
    const legacy = {
      ...valid,
      definition_en: "present everywhere.",
      contextual_explanation: "Used for emphasis.",
    };
    const result = parseVocabularyResponse(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect("definitionEn" in result.fields).toBe(false);
      expect("contextualExplanation" in result.fields).toBe(false);
    }
  });

  it("rejects a wrong-typed field", () => {
    const result = parseVocabularyResponse(JSON.stringify({ ...valid, meaning_zh: { a: 1 } }));
    expect(result.ok).toBe(false);
  });

  it("ignores extra fields", () => {
    const result = parseVocabularyResponse(JSON.stringify({ ...valid, synonyms: ["a", "b"] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect("synonyms" in result.fields).toBe(false);
  });
});
