import { useState } from "react";
import { useAnnotations } from "../state/annotations";
import type { Annotation } from "../annotations/types";
import { AnnotationList } from "./AnnotationList";
import { AnnotationInspector } from "./AnnotationInspector";

type RightTab = "annotations" | "notes" | "vocabulary" | "ai";

const TABS: { id: RightTab; label: string; empty: string }[] = [
  { id: "annotations", label: "Annotations", empty: "No annotations yet." },
  { id: "notes", label: "Notes", empty: "No notes yet." },
  { id: "vocabulary", label: "Vocabulary", empty: "No vocabulary yet." },
  { id: "ai", label: "AI Tutor", empty: "AI Tutor is not available yet." },
];

interface RightSidebarProps {
  onNavigateToAnnotation: (annotation: Annotation) => void;
}

export function RightSidebar({ onNavigateToAnnotation }: RightSidebarProps) {
  const [tab, setTab] = useState<RightTab>("annotations");
  const annotations = useAnnotations();

  const current = TABS.find((t) => t.id === tab) ?? TABS[0];
  const selected = annotations.annotations.find((a) => a.id === annotations.selectedId) ?? null;

  return (
    <div className="sidebar-inner">
      <div className="sidebar-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "sidebar-tab active" : "sidebar-tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "annotations" ? (
        <div className="annotations-panel">
          {annotations.loading && annotations.annotations.length === 0 ? (
            <div className="panel-empty">Loading annotations…</div>
          ) : (
            <AnnotationList
              annotations={annotations.annotations}
              selectedId={annotations.selectedId}
              onNavigate={onNavigateToAnnotation}
            />
          )}
          {selected ? (
            <AnnotationInspector
              annotation={selected}
              onUpdate={(patch) => annotations.updateAnnotation(selected.id, patch)}
              onDelete={() => annotations.deleteAnnotation(selected.id)}
              onFlush={() => annotations.flushPending()}
            />
          ) : null}
        </div>
      ) : (
        <div className="sidebar-content">
          <div className="panel-empty">{current.empty}</div>
        </div>
      )}
    </div>
  );
}
