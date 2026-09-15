/**
 * Compatibility re-export. The generic request gate now lives in shared AI
 * infrastructure (`src/ai/requestGate.ts`); Vocabulary keeps importing from
 * here so existing call sites and tests remain stable.
 */
export { createRequestGate } from "../ai/requestGate";
export type { RequestGate, RequestToken } from "../ai/requestGate";
