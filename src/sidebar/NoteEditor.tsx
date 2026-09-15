import { useState } from "react";
import type { Ref } from "react";
import { MarkdownRenderer } from "../markdown/MarkdownRenderer";

interface NoteEditorProps {
  value: string;
  onChange: (value: string) => void;
  onFlush: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** Forwarded to the underlying <textarea> so a parent can focus it. */
  textareaRef?: Ref<HTMLTextAreaElement>;
}

/**
 * Persistence-free Markdown editor with an Edit / Preview toggle. Markdown
 * remains canonical plain text; autosave/debounce/queueing live in the
 * Notes/annotation stores. Preview uses the shared safe MarkdownRenderer.
 */
export function NoteEditor({
  value,
  onChange,
  onFlush,
  placeholder,
  disabled,
  textareaRef,
}: NoteEditorProps) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  const showPreview = () => {
    onFlush();
    setMode("preview");
  };

  return (
    <div className="note-editor">
      <div className="note-editor-tabs">
        <button
          type="button"
          className={"note-editor-tab" + (mode === "edit" ? " active" : "")}
          onClick={() => setMode("edit")}
        >
          Edit
        </button>
        <button
          type="button"
          className={"note-editor-tab" + (mode === "preview" ? " active" : "")}
          onClick={showPreview}
        >
          Preview
        </button>
      </div>

      {mode === "edit" ? (
        <textarea
          ref={textareaRef}
          className="inspector-note notes-editor"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.currentTarget.value)}
          onBlur={onFlush}
        />
      ) : value.trim() ? (
        <div className="note-editor-preview">
          <MarkdownRenderer content={value} />
        </div>
      ) : (
        <div className="note-editor-preview note-editor-empty">Nothing to preview.</div>
      )}
    </div>
  );
}
