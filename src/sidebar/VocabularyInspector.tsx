import { useState } from "react";
import type { VocabularyItem } from "../vocabulary/types";
import { vocabularyActionState } from "../vocabulary/actionState";
import { useAnnotations } from "../state/annotations";
import { useVocabulary } from "../state/vocabulary";
import { useTutor } from "../state/tutor";
import { ColorPalette } from "./ColorPalette";
import { NoteEditor } from "./NoteEditor";

interface VocabularyInspectorProps {
  item: VocabularyItem;
  onConfigure: () => void;
}

function statusLabel(item: VocabularyItem, running: boolean): string | null {
  if (running) return "Enriching…";
  if (item.enrichment.status === "ready") return null;
  if (item.enrichment.status === "failed") return "Failed";
  return "Not enriched";
}

export function VocabularyInspector({ item, onConfigure }: VocabularyInspectorProps) {
  const annotations = useAnnotations();
  const vocabulary = useVocabulary();
  const tutor = useTutor();
  const { annotation, local, enrichment } = item;
  const running = vocabulary.isRunning(annotation.id);
  const action = vocabularyActionState(item, running, vocabulary.configured);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const updateField = (patch: Parameters<typeof vocabulary.updateFields>[1]) =>
    vocabulary.updateFields(annotation.id, patch);

  const runPrimaryAction = () => {
    if (action === "configure") onConfigure();
    else if (action === "generate" || action === "retry") vocabulary.retry(annotation.id);
    else if (action === "regenerate") vocabulary.regenerate(annotation.id);
  };

  const primaryLabel =
    action === "configure"
      ? "Configure AI"
      : action === "generate"
        ? "Generate"
        : action === "retry"
          ? "Retry"
          : action === "regenerate"
            ? "Regenerate"
            : "Enriching…";

  return (
    <div className="sidebar-inspector-region vocab-inspector-region">
      <div className="vocab-inspector-header">
        <span className="vocab-term">{annotation.sourceText}</span>
        <span className="vocab-page">Page {annotation.segments[0]?.pageNumber ?? 1}</span>
      </div>

      <div className="sidebar-inspector-scroll vocab-inspector-scroll">
        {statusLabel(item, running) ? (
          <div className="vocab-status">{statusLabel(item, running)}</div>
        ) : null}
        {enrichment.errorMessage ? (
          <div className="vocab-error">{enrichment.errorMessage}</div>
        ) : null}

        <div className="vocab-inline-fields">
          <label className="inspector-field">
            <span className="inspector-label">IPA</span>
            <input
              type="text"
              className="inspector-input"
              value={enrichment.fields.ipaUk}
              placeholder="—"
              onChange={(e) => updateField({ ipaUk: e.currentTarget.value })}
            />
          </label>
          <label className="inspector-field">
            <span className="inspector-label">POS</span>
            <input
              type="text"
              className="inspector-input"
              value={enrichment.fields.partOfSpeech}
              placeholder="—"
              onChange={(e) => updateField({ partOfSpeech: e.currentTarget.value })}
            />
          </label>
        </div>

        <label className="inspector-field">
          <span className="inspector-label">Chinese meaning</span>
          <input
            type="text"
            className="inspector-input vocab-meaning-input"
            value={enrichment.fields.meaningZh}
            placeholder="—"
            onChange={(e) => updateField({ meaningZh: e.currentTarget.value })}
          />
        </label>

        {local?.sourceSentence ? (
          <div className="inspector-field">
            <span className="inspector-label">Source sentence</span>
            <div className="inspector-source">{local.sourceSentence}</div>
          </div>
        ) : null}

        <div className="inspector-field">
          <span className="inspector-label">Note</span>
          <NoteEditor
            value={annotation.note}
            placeholder="Optional note…"
            onChange={(note) => annotations.updateAnnotation(annotation.id, { note })}
            onFlush={() => annotations.flushPending()}
          />
        </div>

        <div className="inspector-field">
          <span className="inspector-label">Color</span>
          <ColorPalette
            value={annotation.color}
            onChange={(color) => annotations.updateAnnotation(annotation.id, { color })}
          />
        </div>

        {enrichment.provenance.model ? (
          <div className="vocab-provenance">
            {enrichment.provenance.model}
            {enrichment.provenance.promptVersion
              ? ` · ${enrichment.provenance.promptVersion}`
              : ""}
          </div>
        ) : null}
      </div>

      <div className="sidebar-action-bar vocab-action-bar">
        {confirmingDelete ? (
          <>
            <span className="vocab-confirm-text">Delete this vocabulary?</span>
            <button
              type="button"
              className="vocab-action destructive"
              onClick={() => {
                setConfirmingDelete(false);
                vocabulary.deleteVocabulary(annotation.id);
              }}
            >
              Delete
            </button>
            <button
              type="button"
              className="vocab-action"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="vocab-action primary"
              disabled={action === "running"}
              onClick={runPrimaryAction}
            >
              {primaryLabel}
            </button>
            <button
              type="button"
              className="vocab-action"
              onClick={() => tutor.askAnnotation(annotation.id)}
            >
              Ask AI
            </button>
            <button
              type="button"
              className="vocab-action destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
