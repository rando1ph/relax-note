import { useEffect, useMemo, useState } from "react";
import { filterNotes } from "../notes/search";
import type { NoteListItem } from "../notes/types";
import { sameNote } from "../notes/selection";
import { useNotes } from "../state/notes";
import { useWorkspace } from "../state/workspace";
import { NotesList } from "./NotesList";
import { NotesInspector } from "./NotesInspector";

interface NotesPanelProps {
  onNavigateAnnotation: (annotationId: string) => void;
  onNavigatePage: (pageNumber: number) => void;
}

export function NotesPanel({ onNavigateAnnotation, onNavigatePage }: NotesPanelProps) {
  const notes = useNotes();
  const ws = useWorkspace();
  const [query, setQuery] = useState("");
  const [focusRequest, setFocusRequest] = useState(0);

  const documentId = ws.activeTab?.id ?? null;

  // Search is document-scoped: reset when the document changes.
  useEffect(() => {
    setQuery("");
  }, [documentId]);

  const filtered = useMemo(() => filterNotes(notes.items, query), [notes.items, query]);

  const selected = notes.selected;
  const selectedItem = useMemo(
    () =>
      selected
        ? notes.items.find((item) => sameNote(item.selection, selected)) ?? null
        : null,
    [notes.items, selected],
  );

  const handleAddPageNote = async () => {
    const created = await notes.createPageNote();
    if (created) setFocusRequest((n) => n + 1);
  };

  const handleSelect = (item: NoteListItem) => {
    if (item.kind === "annotation") {
      notes.selectAnnotationNote(item.selection.id);
      onNavigateAnnotation(item.selection.id);
    } else {
      notes.selectPageNote(item.selection.id);
      onNavigatePage(item.pageNumber);
    }
  };

  return (
    <div className="notes-panel">
      <div className="notes-toolbar">
        <input
          type="search"
          className="notes-search"
          value={query}
          placeholder="Search notes"
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <button
          type="button"
          className="notes-add-button"
          disabled={!documentId}
          onClick={() => void handleAddPageNote()}
        >
          Add page note
        </button>
      </div>

      <div className={"sidebar-list-region notes-list-region" + (selectedItem ? " constrained" : "")}>
        {notes.loading && notes.items.length === 0 ? (
          <div className="panel-empty">Loading notes…</div>
        ) : filtered.length === 0 ? (
          <div className="panel-empty">
            {notes.items.length === 0 ? "No notes yet." : "No matches."}
          </div>
        ) : (
          <NotesList
            items={filtered}
            selectedKey={notes.selected ? `${notes.selected.kind}:${notes.selected.id}` : null}
            onSelect={handleSelect}
          />
        )}
      </div>

      {selectedItem ? (
        <>
          <div className="sidebar-divider" role="separator" />
          <NotesInspector item={selectedItem} focusRequest={focusRequest} />
        </>
      ) : null}
    </div>
  );
}
