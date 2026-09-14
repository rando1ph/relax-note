import type { NoteListItem } from "./types";

/**
 * Local, in-memory search over the current document's notes. Matches title,
 * note Markdown, and (for annotation notes) source text. Case-insensitive.
 * No full-library indexing in M4.
 */
export function filterNotes(items: NoteListItem[], query: string): NoteListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    if (item.title && item.title.toLowerCase().includes(q)) return true;
    if (item.note.toLowerCase().includes(q)) return true;
    if (item.sourceText && item.sourceText.toLowerCase().includes(q)) return true;
    return false;
  });
}
