import type { VocabularyItem } from "./types";

export type VocabularyActionState =
  | "running"
  | "configure"
  | "generate"
  | "retry"
  | "regenerate";

/**
 * Maps real enrichment state to the inspector action. `running` always wins so
 * an in-flight item is never shown as idle.
 */
export function vocabularyActionState(
  item: VocabularyItem,
  running: boolean,
  configured: boolean,
): VocabularyActionState {
  if (running) return "running";
  if (!configured) return "configure";
  if (item.enrichment.status === "ready") return "regenerate";
  if (item.enrichment.status === "failed") return "retry";
  return "generate";
}
