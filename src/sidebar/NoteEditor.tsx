import type { Ref } from "react";

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
 * Persistence-free Markdown editor (plain textarea). Markdown is canonical
 * plain text; autosave/debounce/queueing live in the Notes/annotation stores.
 * A future live-preview editor (e.g. CodeMirror) replaces only this component.
 */
export function NoteEditor({
  value,
  onChange,
  onFlush,
  placeholder,
  disabled,
  textareaRef,
}: NoteEditorProps) {
  return (
    <textarea
      ref={textareaRef}
      className="inspector-note notes-editor"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.currentTarget.value)}
      onBlur={onFlush}
    />
  );
}
