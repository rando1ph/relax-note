import type { Annotation } from "../annotations/types";
import type { VocabularyItem } from "./types";

/**
 * True reading order for vocabulary items. `seq` is the segment order WITHIN a
 * single annotation (commonly 0 for every annotation's first segment), so it
 * must not be used to order annotations. Order by the first segment's page and
 * normalized position instead, with a stable tie-breaker.
 */
function firstSegmentKey(annotation: Annotation): {
  page: number;
  y: number;
  x: number;
} {
  const first = annotation.segments[0];
  return {
    page: first?.pageNumber ?? 1,
    y: first?.rect.y ?? 0,
    x: first?.rect.x ?? 0,
  };
}

export function compareVocabularyReadingOrder(a: Annotation, b: Annotation): number {
  const ka = firstSegmentKey(a);
  const kb = firstSegmentKey(b);
  if (ka.page !== kb.page) return ka.page - kb.page;
  if (ka.y !== kb.y) return ka.y - kb.y;
  if (ka.x !== kb.x) return ka.x - kb.x;
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id.localeCompare(b.id);
}

export function sortVocabularyItems(items: VocabularyItem[]): VocabularyItem[] {
  return [...items].sort((a, b) =>
    compareVocabularyReadingOrder(a.annotation, b.annotation),
  );
}
