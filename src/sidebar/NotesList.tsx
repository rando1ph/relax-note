import type { NoteListItem } from "../notes/types";
import { firstUsefulLine } from "../notes/items";

interface NotesListProps {
  items: NoteListItem[];
  selectedKey: string | null;
  onSelect: (item: NoteListItem) => void;
}

export function NotesList({ items, selectedKey, onSelect }: NotesListProps) {
  if (items.length === 0) {
    return <div className="panel-empty">No notes yet.</div>;
  }

  return (
    <ul className="notes-list">
      {items.map((item) => {
        const primary = item.title?.trim() || firstUsefulLine(item.note) || item.sourceText || "(untitled note)";
        const sourcePreview = item.sourceText ? firstUsefulLine(item.sourceText) : null;
        return (
          <li key={item.key}>
            <button
              type="button"
              className={"notes-item" + (item.key === selectedKey ? " selected" : "")}
              onClick={() => onSelect(item)}
            >
              {item.color ? (
                <span className="annotation-color" style={{ background: item.color }} />
              ) : null}
              <span className="notes-item-body">
                <span className="notes-item-primary">
                  {primary}
                  {item.origin === "ai_tutor" ? (
                    <span className="notes-ai-badge">AI</span>
                  ) : null}
                </span>
                {sourcePreview ? (
                  <span className="notes-item-source">{sourcePreview}</span>
                ) : null}
                <span className="notes-item-meta">
                  Page {item.pageNumber} · {item.typeLabel}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
