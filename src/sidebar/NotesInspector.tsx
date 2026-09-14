import { useEffect, useRef, useState } from "react";
import type { NoteListItem } from "../notes/types";
import { useNotes } from "../state/notes";
import { NoteEditor } from "./NoteEditor";

interface NotesInspectorProps {
  item: NoteListItem;
  focusRequest: number;
}

export function NotesInspector({ item, focusRequest }: NotesInspectorProps) {
  const notes = useNotes();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const focusedRef = useRef(0);

  useEffect(() => {
    if (focusRequest !== focusedRef.current) {
      focusedRef.current = focusRequest;
      editorRef.current?.focus();
    }
  }, [focusRequest]);

  const isPage = item.kind === "page";

  return (
    <div className="notes-inspector-region">
      <div className="notes-inspector-header">
        <span className="notes-inspector-kind">{item.typeLabel}</span>
        <span className="notes-inspector-page">Page {item.pageNumber}</span>
      </div>

      <div className="notes-inspector-scroll">
        {item.sourceText ? (
          <div className="inspector-source">{item.sourceText}</div>
        ) : null}

        <label className="inspector-field">
          <span className="inspector-label">Title</span>
          <input
            type="text"
            className="inspector-input"
            value={item.title ?? ""}
            placeholder="Optional title"
            onChange={(e) => notes.updateTitle(item.selection, e.currentTarget.value || null)}
            onBlur={notes.flush}
          />
        </label>

        <label className="inspector-field">
          <span className="inspector-label">Note</span>
          <NoteEditor
            value={item.note}
            placeholder="Markdown note…"
            onChange={(value) => notes.updateNote(item.selection, value)}
            onFlush={notes.flush}
            textareaRef={editorRef}
          />
        </label>
      </div>

      <div className="sidebar-action-bar">
        {isPage ? (
          confirmingDelete ? (
            <>
              <span className="sidebar-confirm-text">Delete this page note?</span>
              <button
                type="button"
                className="sidebar-action destructive"
                onClick={() => {
                  setConfirmingDelete(false);
                  notes.deletePageNote(item.selection.id);
                }}
              >
                Delete
              </button>
              <button
                type="button"
                className="sidebar-action"
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="sidebar-action destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete Page Note
            </button>
          )
        ) : (
          <button
            type="button"
            className="sidebar-action"
            title="Delete the Note (Title and body); the annotation itself is kept"
            onClick={() => notes.deleteAnnotationNote(item.selection.id)}
          >
            Delete Note
          </button>
        )}
      </div>
    </div>
  );
}
