import type { Annotation, AnnotationEditablePatch } from "../annotations/types";
import { ColorPalette } from "./ColorPalette";

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
  return (
    <div className="annotation-inspector">
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

      <label className="inspector-field">
        <span className="inspector-label">Note</span>
        <textarea
          className="inspector-note"
          value={annotation.note}
          placeholder="Markdown note…"
          onChange={(e) => onUpdate({ note: e.currentTarget.value })}
          onBlur={onFlush}
        />
      </label>

      <div className="inspector-field">
        <span className="inspector-label">Color</span>
        <ColorPalette
          value={annotation.color}
          onChange={(color) => onUpdate({ color })}
        />
      </div>

      <button type="button" className="inspector-delete" onClick={onDelete}>
        Delete annotation
      </button>
    </div>
  );
}
