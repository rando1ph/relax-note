import type { Annotation } from "./types";
import { hasNoteContent } from "./types";

/**
 * Page-margin annotation marker language:
 *   - vocabulary annotations → hollow ring (precedence over note)
 *   - other annotations with Title/Note content → folded-corner note anchor
 *   - plain highlights → no marker
 */

export type MarkerKind = "note" | "vocabulary";

/** Visual sizes (CSS px), kept fixed across zoom. */
export const NOTE_VISUAL_SIZE = 12;
export const VOCAB_VISUAL_SIZE = 8;

/** Invisible hit-target sizes (CSS px), slightly larger than the visuals. */
export const NOTE_HIT_SIZE = 20;
export const VOCAB_HIT_SIZE = 16;

export function markerKind(annotation: Annotation): MarkerKind | null {
  if (annotation.type === "vocabulary") return "vocabulary";
  if (hasNoteContent(annotation)) return "note";
  return null;
}

/** Semantic marker color: always the annotation's stored color. */
export function markerColor(annotation: Annotation): string {
  return annotation.color;
}

export function markerHitSize(kind: MarkerKind): number {
  return kind === "vocabulary" ? VOCAB_HIT_SIZE : NOTE_HIT_SIZE;
}

export interface MarkerLayoutEntry {
  id: string;
  /** Desired vertical center, in page-local viewport CSS pixels (first segment center). */
  y: number;
  /** Hit-target height in CSS pixels. */
  size: number;
}

/**
 * Deterministic per-page rail layout: sort by desired Y, keep the desired Y
 * when possible, and shift later markers down by the minimum distance when hit
 * boxes would overlap. Does not mutate the input array.
 */
export function layoutMarkerRail(
  entries: MarkerLayoutEntry[],
  gap: number,
): Map<string, number> {
  const sorted = [...entries].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  const placed = new Map<string, number>();
  let bottom = -Infinity;
  for (const entry of sorted) {
    let top = entry.y - entry.size / 2;
    if (top < bottom + gap) top = bottom + gap;
    placed.set(entry.id, top);
    bottom = top + entry.size;
  }
  return placed;
}
