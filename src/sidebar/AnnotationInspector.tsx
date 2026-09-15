import type { Annotation, AnnotationEditablePatch } from "../annotations/types";
import { useTutor } from "../state/tutor";
import { ColorPalette } from "./ColorPalette";
import { NoteEditor } from "./NoteEditor";

interface AnnotationInspectorProps {
  annotation: Annotation;
  onUpdate: (patch: AnnotationEditablePatch) => void;
  onDelete: () => void;
  onFlush: () => void;
}

export function AnnotationInspector({
  annotation,
  onUpdate,
  onDelete,
  onFlush,
}: AnnotationInspectorProps) {
  const tutor = useTutor();

  return (
    <div className="sidebar-inspector-region">
      <div className="sidebar-inspector-scroll">
        <div className="inspector-source">{annotation.sourceText}</div>

        <label className="inspector-field">
          <span className="inspector-label">Title</span>
          <input
            type="text"
            className="inspector-input"
            value={annotation.title ?? ""}
            placeholder="Optional title"
            onChange={(e) => onUpdate({ title: e.currentTarget.value || null })}
            onBlur={onFlush}
          />
        </label>

        <div className="inspector-field">
          <span className="inspector-label">Note</span>
          <NoteEditor
            value={annotation.note}
            placeholder="Markdown note…"
            onChange={(note) => onUpdate({ note })}
            onFlush={onFlush}
          />
        </div>

        <div className="inspector-field">
          <span className="inspector-label">Color</span>
          <ColorPalette
            value={annotation.color}
            onChange={(color) => onUpdate({ color })}
          />
        </div>
      </div>

      <div className="sidebar-action-bar">
        <button
          type="button"
          className="sidebar-action"
          onClick={() => tutor.askAnnotation(annotation.id)}
        >
          Ask AI
        </button>
        <button type="button" className="sidebar-action destructive" onClick={onDelete}>
          Delete annotation
        </button>
      </div>
    </div>
  );
}
