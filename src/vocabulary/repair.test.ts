import { describe, expect, it } from "vitest";
import type { AiChatResult, AiMessage } from "../ai/types";
import { requestVocabularyEnrichment, VocabularyFormatError } from "./repair";
import type { CallModel } from "./repair";
import type { VocabularyContextPayload } from "./types";

const payload: VocabularyContextPayload = {
  documentTitle: "Doc",
  page: 1,
  selectedTerm: "interstitium",
  sourceSentence: "The interstitium surrounds the cells.",
  previousSentence: null,
  nextSentence: null,
  sectionHeading: null,
  contextWindow: "The interstitium surrounds the cells.",
};

const validJson = JSON.stringify({
  lemma: "interstitium",
  display_term: "interstitium",
  part_of_speech: "n.",
  ipa_uk: "",
  meaning_zh: "间质",
  domain: "medicine",
  domain_specific: true,
});

function modelReturning(contents: string[]): { call: CallModel; calls: AiMessage[][] } {
  const calls: AiMessage[][] = [];
  let index = 0;
  const call: CallModel = async (messages): Promise<AiChatResult> => {
    calls.push(messages);
    const content = contents[Math.min(index, contents.length - 1)];
    index += 1;
    return { content, model: "test-model" };
  };
  return { call, calls };
}

describe("requestVocabularyEnrichment", () => {
  it("parses raw JSON without a repair", async () => {
    const { call, calls } = modelReturning([validJson]);
    const result = await requestVocabularyEnrichment(call, payload);
    expect(result.repaired).toBe(false);
    expect(result.fields.meaningZh).toBe("间质");
    expect(calls).toHaveLength(1);
  });

  it("parses fenced JSON", async () => {
    const { call, calls } = modelReturning([`Sure:\n\`\`\`json\n${validJson}\n\`\`\``]);
    const result = await requestVocabularyEnrichment(call, payload);
    expect(result.repaired).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("parses prose surrounding JSON", async () => {
    const { call } = modelReturning([`Here you go: ${validJson} hope it helps`]);
    const result = await requestVocabularyEnrichment(call, payload);
    expect(result.repaired).toBe(false);
  });

  it("performs exactly one repair retry on invalid first output", async () => {
    const { call, calls } = modelReturning(["I could not comply.", validJson]);
    const result = await requestVocabularyEnrichment(call, payload);
    expect(result.repaired).toBe(true);
    expect(result.fields.meaningZh).toBe("间质");
    expect(calls).toHaveLength(2);
    // The repair request carries the original term and a strict instruction.
    expect(calls[1].some((m) => m.content.includes("invalid format"))).toBe(true);
    expect(calls[1].some((m) => m.content.includes("interstitium"))).toBe(true);
  });

  it("fails after one repair without recursing", async () => {
    const { call, calls } = modelReturning(["no json", "still no json"]);
    await expect(requestVocabularyEnrichment(call, payload)).rejects.toBeInstanceOf(
      VocabularyFormatError,
    );
    expect(calls).toHaveLength(2);
  });

  it("repairs when the first assistant content is empty", async () => {
    const { call, calls } = modelReturning(["", validJson]);
    const result = await requestVocabularyEnrichment(call, payload);
    expect(result.repaired).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("propagates transport errors without attempting a repair", async () => {
    const calls: AiMessage[][] = [];
    const call: CallModel = async (messages) => {
      calls.push(messages);
      throw new Error("AI request failed (HTTP 401)");
    };
    await expect(requestVocabularyEnrichment(call, payload)).rejects.toThrow(
      "AI request failed (HTTP 401)",
    );
    expect(calls).toHaveLength(1);
  });
});
