import type { Annotation } from "../annotations/types";
import { compareAnnotationsReadingOrder } from "../annotations/order";
import type { VocabularyItem } from "./types";

/**
 * Vocabulary items use the generic annotation reading order (page, y, x,
 * createdAt, id). Kept as a thin delegate so existing callers and tests keep
 * their vocabulary-scoped name while the geometry rule lives in one place.
 */
export function compareVocabularyReadingOrder(a: Annotation, b: Annotation): number {
  return compareAnnotationsReadingOrder(a, b);
}

export function sortVocabularyItems(items: VocabularyItem[]): VocabularyItem[] {
  return [...items].sort((a, b) =>
    compareVocabularyReadingOrder(a.annotation, b.annotation),
  );
}
