import { useMemo, useState } from "react";
import type { Annotation } from "../annotations/types";
import { useAnnotations } from "../state/annotations";
import { useVocabulary } from "../state/vocabulary";
import type { VocabularyItem } from "../vocabulary/types";
import { VocabularyInspector } from "./VocabularyInspector";
import { AiSettingsDialog } from "./AiSettingsDialog";

interface VocabularyPanelProps {
  onNavigate: (annotation: Annotation) => void;
}

function statusText(item: VocabularyItem, running: boolean): string {
  if (running) return "Enriching…";
  if (item.enrichment.status === "failed") return "Failed";
  if (item.enrichment.status === "pending") return "Not enriched";
  return "";
}

export function VocabularyPanel({ onNavigate }: VocabularyPanelProps) {
  const vocabulary = useVocabulary();
  const annotations = useAnnotations();
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vocabulary.items;
    return vocabulary.items.filter((item) => {
      const term = (
        item.enrichment.fields.displayTerm || item.annotation.sourceText
      ).toLowerCase();
      const meaning = item.enrichment.fields.meaningZh.toLowerCase();
      return term.includes(q) || meaning.includes(q);
    });
  }, [vocabulary.items, query]);

  const selected =
    vocabulary.items.find((item) => item.annotation.id === annotations.selectedId) ?? null;

  return (
    <div className="vocabulary-panel">
      <div className="vocab-toolbar">
        <input
          type="search"
          className="vocab-search"
          value={query}
          placeholder="Search vocabulary"
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <button
          type="button"
          className="vocab-settings-button"
          aria-label="AI settings"
          title="AI settings"
          onClick={() => setSettingsOpen(true)}
        >
          ⚙
        </button>
      </div>

      {!vocabulary.configured ? (
        <button
          type="button"
          className="vocab-configure"
          onClick={() => setSettingsOpen(true)}
        >
          Configure AI
        </button>
      ) : null}

      <div className={"sidebar-list-region vocab-list-region" + (selected ? " constrained" : "")}>
        {vocabulary.loading && vocabulary.items.length === 0 ? (
          <div className="panel-empty">Loading vocabulary…</div>
        ) : filtered.length === 0 ? (
          <div className="panel-empty">
            {vocabulary.items.length === 0 ? "No vocabulary yet." : "No matches."}
          </div>
        ) : (
          <ul className="vocab-list">
            {filtered.map((item) => {
              const running = vocabulary.isRunning(item.annotation.id);
              const term =
                item.enrichment.fields.displayTerm || item.annotation.sourceText;
              const status = statusText(item, running);
              return (
                <li key={item.annotation.id}>
                  <button
                    type="button"
                    className={
                      "vocab-item" +
                      (item.annotation.id === annotations.selectedId ? " selected" : "")
                    }
                    onClick={() => onNavigate(item.annotation)}
                  >
                    <span className="vocab-item-term">{term}</span>
                    <span className="vocab-item-meaning">
                      {item.enrichment.fields.meaningZh || "—"}
                    </span>
                    <span className="vocab-item-meta">
                      Page {item.annotation.segments[0]?.pageNumber ?? 1}
                      {status ? ` · ${status}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected ? (
        <>
          <div className="sidebar-divider vocab-divider" role="separator" />
          <VocabularyInspector item={selected} onConfigure={() => setSettingsOpen(true)} />
        </>
      ) : null}

      {settingsOpen ? <AiSettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
