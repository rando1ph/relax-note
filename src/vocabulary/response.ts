import type { VocabularyFields } from "./types";

export type ParseVocabularyResult =
  | { ok: true; fields: VocabularyFields }
  | { ok: false; error: string };

const SNAKE_TO_CAMEL: Record<string, keyof VocabularyFields> = {
  lemma: "lemma",
  display_term: "displayTerm",
  part_of_speech: "partOfSpeech",
  ipa_uk: "ipaUk",
  meaning_zh: "meaningZh",
  domain: "domain",
  domain_specific: "domainSpecific",
};

/**
 * Strips code fences and surrounding prose, then extracts the first BALANCED
 * JSON object. Braces inside strings are ignored, so this never greedily
 * consumes unrelated braces or a trailing second object.
 */
export function extractJsonObject(raw: string): string | null {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value == null) return "";
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

/**
 * Robust parser. Tolerates fences/prose and missing optional fields, but
 * requires a useful lexicographic result (a non-empty meaning or definition).
 */
export function parseVocabularyResponse(raw: string): ParseVocabularyResult {
  const json = extractJsonObject(raw);
  if (!json) return { ok: false, error: "No JSON object found in the AI response" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "The AI response was not valid JSON" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "The AI response was not a JSON object" };
  }

  const source = parsed as Record<string, unknown>;
  const fields: VocabularyFields = {
    lemma: "",
    displayTerm: "",
    partOfSpeech: "",
    ipaUk: "",
    meaningZh: "",
    domain: "",
    domainSpecific: false,
  };

  for (const [snake, camel] of Object.entries(SNAKE_TO_CAMEL)) {
    if (!(snake in source)) continue;
    const value = source[snake];
    if (camel === "domainSpecific") {
      const bool = asBoolean(value);
      if (bool === null) return { ok: false, error: "domain_specific must be a boolean" };
      fields.domainSpecific = bool;
    } else {
      const str = asString(value);
      if (str === null) return { ok: false, error: `${snake} must be a string` };
      fields[camel] = str.trim();
    }
  }

  // meaning_zh is the primary useful output: reject a response without it.
  if (!fields.meaningZh) {
    return { ok: false, error: "The AI response had no usable Chinese meaning" };
  }

  return { ok: true, fields };
}
