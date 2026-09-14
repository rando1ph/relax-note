import type { NoteSelection } from "./types";

/**
 * A stable, collision-free key for a note identity. Annotation ids and page
 * note ids are both UUIDs, so the kind prefix disambiguates them.
 */
export function noteKey(selection: NoteSelection): string {
  return `${selection.kind}:${selection.id}`;
}

export function sameNote(a: NoteSelection, b: NoteSelection): boolean {
  return a.kind === b.kind && a.id === b.id;
}
