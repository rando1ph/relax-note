import { useEffect, useRef, useState } from "react";
import { useAnnotations } from "../state/annotations";
import { useTutor } from "../state/tutor";
import type { TutorContextSnapshot } from "../tutor/types";
import { AiSettingsDialog } from "./AiSettingsDialog";
import { TutorComposer } from "./TutorComposer";
import { TutorMessages } from "./TutorMessages";
import { TutorQuickActions } from "./TutorQuickActions";

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function contextChip(snapshot: TutorContextSnapshot | null): string {
  if (!snapshot) return "Current page";
  const label =
    snapshot.source === "selection"
      ? "selected passage"
      : snapshot.source === "annotation"
        ? "annotation"
        : snapshot.source === "vocabulary"
          ? "vocabulary"
          : snapshot.source === "page-note"
            ? "page note"
            : "page";
  const text = snapshot.selectedText ?? snapshot.annotationSourceText;
  const preview = text ? ` · ${truncate(text, 40)}` : "";
  return `Page ${snapshot.page} · ${label}${preview}`;
}

export function TutorPanel() {
  const tutor = useTutor();
  const annotations = useAnnotations();
  const [value, setValue] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const context = tutor.conversation?.context ?? null;
  const messages = tutor.conversation?.messages ?? [];
  const selectedAnnotation =
    annotations.selectedId != null
      ? annotations.annotations.find((a) => a.id === annotations.selectedId) ?? null
      : null;

  // Prefill the composer whenever Ask AI provides a draft question.
  useEffect(() => {
    if (tutor.draftQuestion == null) return;
    setValue(tutor.draftQuestion);
    tutor.consumeDraftQuestion();
    composerRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutor.draftQuestion]);

  // Keep the newest message in view.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  const canSend = tutor.configured && !tutor.running;

  const send = () => {
    if (!canSend || !value.trim()) return;
    tutor.send(value);
    setValue("");
  };

  return (
    <div className="tutor-panel">
      <div className="tutor-header">
        <span className="tutor-title">AI Tutor</span>
        <span className="tutor-context-chip" title={contextChip(context)}>
          {contextChip(context)}
        </span>
        <div className="tutor-header-actions">
          <button
            type="button"
            className="sidebar-action"
            aria-label="AI settings"
            title="AI settings"
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </button>
          <button
            type="button"
            className="sidebar-action"
            disabled={messages.length === 0}
            onClick={() => tutor.clear()}
          >
            Clear
          </button>
        </div>
      </div>

      {!tutor.configured ? (
        <button
          type="button"
          className="tutor-configure"
          onClick={() => setSettingsOpen(true)}
        >
          Configure AI
        </button>
      ) : null}

      <div className="tutor-context-controls">
        <button type="button" className="tutor-context-control" onClick={() => tutor.attachCurrentPage()}>
          Use current page
        </button>
        {selectedAnnotation ? (
          <button
            type="button"
            className="tutor-context-control"
            onClick={() => tutor.attachAnnotation(selectedAnnotation.id)}
          >
            Use selected annotation
          </button>
        ) : null}
      </div>

      <div className="tutor-messages-region">
        <TutorMessages
          messages={messages}
          running={tutor.running}
          onRetry={(id) => tutor.retry(id)}
          onContinue={(id) => tutor.continueFrom(id)}
          onSave={(id) => tutor.saveToPageNote(id)}
        />
        <div ref={messagesEndRef} />
      </div>

      {context && tutor.configured ? (
        <TutorQuickActions onAction={(question) => tutor.send(question)} />
      ) : null}

      <TutorComposer
        ref={composerRef}
        value={value}
        onChange={setValue}
        onSend={send}
        onStop={() => tutor.stop()}
        running={tutor.running}
        disabled={!tutor.configured}
      />

      {settingsOpen ? <AiSettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
