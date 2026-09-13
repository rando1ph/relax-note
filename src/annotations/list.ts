import type { Annotation } from "./types";

/**
 * Vocabulary annotations are a specialized annotation type that lives
 * exclusively in the Vocabulary tab. The Annotations list must exclude them
 * (filtering is presentation-only; the shared annotation store is unchanged).
 */
export function isVocabularyAnnotation(annotation: Annotation): boolean {
  return annotation.type === "vocabulary";
}

export function listableAnnotations(annotations: Annotation[]): Annotation[] {
  return annotations.filter((annotation) => !isVocabularyAnnotation(annotation));
}
