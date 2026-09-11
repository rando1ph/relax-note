import { useState } from "react";

type RightTab = "annotations" | "notes" | "vocabulary" | "ai";

const TABS: { id: RightTab; label: string; empty: string }[] = [
  { id: "annotations", label: "Annotations", empty: "No annotations yet." },
  { id: "notes", label: "Notes", empty: "No notes yet." },
  { id: "vocabulary", label: "Vocabulary", empty: "No vocabulary yet." },
  { id: "ai", label: "AI Tutor", empty: "AI Tutor is not available yet." },
];

export function RightSidebar() {
  const [tab, setTab] = useState<RightTab>("annotations");
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

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
      <div className="sidebar-content">
        <div className="panel-empty">{current.empty}</div>
      </div>
    </div>
  );
}
