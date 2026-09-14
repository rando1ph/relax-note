import type { Annotation } from "../annotations/types";
import { listableAnnotations } from "../annotations/list";
import { useAnnotations } from "../state/annotations";
import { AnnotationList } from "./AnnotationList";
import { AnnotationInspector } from "./AnnotationInspector";
import { VocabularyPanel } from "./VocabularyPanel";
import { NotesPanel } from "./NotesPanel";

export type RightTab = "annotations" | "notes" | "vocabulary" | "ai";

const TABS: { id: RightTab; label: string; empty: string }[] = [
  { id: "annotations", label: "Annotations", empty: "No annotations yet." },
  { id: "notes", label: "Notes", empty: "No notes yet." },
  { id: "vocabulary", label: "Vocabulary", empty: "No vocabulary yet." },
  { id: "ai", label: "AI Tutor", empty: "AI Tutor is not available yet." },
];

interface RightSidebarProps {
  tab: RightTab;
  onTabChange: (tab: RightTab) => void;
  onNavigateToAnnotation: (annotation: Annotation) => void;
  onNavigateToNoteAnnotation: (annotationId: string) => void;
  onNavigateToNotePage: (pageNumber: number) => void;
}

export function RightSidebar({
  tab,
  onTabChange,
  onNavigateToAnnotation,
  onNavigateToNoteAnnotation,
  onNavigateToNotePage,
}: RightSidebarProps) {
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="sidebar-inner">
      <div className="sidebar-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "sidebar-tab active" : "sidebar-tab"}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "annotations" ? (
        <AnnotationsTab onNavigateToAnnotation={onNavigateToAnnotation} />
      ) : tab === "notes" ? (
        <NotesPanel
          onNavigateAnnotation={onNavigateToNoteAnnotation}
          onNavigatePage={onNavigateToNotePage}
        />
      ) : tab === "vocabulary" ? (
        <VocabularyPanel onNavigate={onNavigateToAnnotation} />
      ) : (
        <div className="sidebar-content">
          <div className="panel-empty">{current.empty}</div>
        </div>
      )}
    </div>
  );
}

function AnnotationsTab({
  onNavigateToAnnotation,
}: {
  onNavigateToAnnotation: (annotation: Annotation) => void;
}) {
  const annotations = useAnnotations();
  const selected = annotations.annotations.find((a) => a.id === annotations.selectedId) ?? null;

  return (
    <div className="annotations-panel">
      {annotations.loading && annotations.annotations.length === 0 ? (
        <div className="panel-empty">Loading annotations…</div>
      ) : (
        <AnnotationList
          annotations={listableAnnotations(annotations.annotations)}
          selectedId={annotations.selectedId}
          onNavigate={onNavigateToAnnotation}
        />
      )}
      {selected && selected.type !== "vocabulary" ? (
        <AnnotationInspector
          annotation={selected}
          onUpdate={(patch) => annotations.updateAnnotation(selected.id, patch)}
          onDelete={() => annotations.deleteAnnotation(selected.id)}
          onFlush={() => annotations.flushPending()}
        />
      ) : null}
    </div>
  );
}
