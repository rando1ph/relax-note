import type { Annotation } from "../annotations/types";

interface AnnotationListProps {
  annotations: Annotation[];
  selectedId: string | null;
  onNavigate: (annotation: Annotation) => void;
}

export function AnnotationList({ annotations, selectedId, onNavigate }: AnnotationListProps) {
  if (annotations.length === 0) {
    return <div className="panel-empty">No annotations yet.</div>;
  }

  return (
    <ul className="annotation-list">
      {annotations.map((annotation) => {
        const page = annotation.segments[0]?.pageNumber ?? 1;
        const label = annotation.title || annotation.sourceText || "(untitled)";
        return (
          <li key={annotation.id}>
            <button
              type="button"
              className={
                "annotation-item" + (annotation.id === selectedId ? " selected" : "")
              }
              onClick={() => onNavigate(annotation)}
            >
              <span className="annotation-color" style={{ background: annotation.color }} />
              <span className="annotation-body">
                <span className="annotation-text">{label}</span>
                <span className="annotation-meta">Page {page}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
