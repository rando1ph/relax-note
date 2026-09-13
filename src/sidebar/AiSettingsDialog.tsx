import { useEffect, useState } from "react";
import { saveAiSettings } from "../ai/settings";
import type { AiSettings } from "../ai/settings";
import { tauriAiTransport } from "../ai/rustTransport";
import { useVocabulary } from "../state/vocabulary";

interface AiSettingsDialogProps {
  onClose: () => void;
}

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Request failed";
}

export function AiSettingsDialog({ onClose }: AiSettingsDialogProps) {
  const vocabulary = useVocabulary();
  const [draft, setDraft] = useState<AiSettings>(vocabulary.settings);
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [storeAvailable, setStoreAvailable] = useState(true);
  const [busy, setBusy] = useState<"idle" | "saving" | "testing">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    setDraft(vocabulary.settings);
  }, [vocabulary.settings]);

  useEffect(() => {
    void tauriAiTransport
      .credentialStoreAvailable()
      .then(setStoreAvailable)
      .catch(() => setStoreAvailable(false));
  }, []);

  const refreshHasKey = async (baseUrl: string) => {
    try {
      setHasKey(await tauriAiTransport.hasApiKey(baseUrl));
    } catch {
      setHasKey(false);
    }
  };

  useEffect(() => {
    if (draft.baseUrl.trim()) void refreshHasKey(draft.baseUrl);
    else setHasKey(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.baseUrl]);

  const save = async () => {
    setBusy("saving");
    setMessage(null);
    try {
      await saveAiSettings(draft);
      const key = apiKey.trim();
      if (key) {
        await tauriAiTransport.setApiKey(draft.baseUrl, key, storeAvailable);
        setApiKey("");
        setReplacing(false);
      }
      await vocabulary.reloadSettings();
      await refreshHasKey(draft.baseUrl);
      setMessage(storeAvailable ? "Saved." : "Saved for this session only.");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy("idle");
    }
  };

  const testConnection = async () => {
    setBusy("testing");
    setMessage(null);
    try {
      await tauriAiTransport.testConnection(draft.baseUrl, draft.model);
      setMessage("Connection OK.");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy("idle");
    }
  };

  const clearKey = async () => {
    try {
      await tauriAiTransport.clearApiKey(draft.baseUrl);
      setApiKey("");
      setHasKey(false);
      setMessage("API key cleared.");
    } catch (error) {
      setMessage(errorText(error));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">AI settings</div>

        <label className="inspector-field">
          <span className="inspector-label">Base URL</span>
          <input
            type="text"
            className="inspector-input"
            value={draft.baseUrl}
            placeholder="https://host/v1"
            onChange={(e) => setDraft({ ...draft, baseUrl: e.currentTarget.value })}
          />
        </label>

        <label className="inspector-field">
          <span className="inspector-label">Model</span>
          <input
            type="text"
            className="inspector-input"
            value={draft.model}
            placeholder="model-name"
            onChange={(e) => setDraft({ ...draft, model: e.currentTarget.value })}
          />
        </label>

        <label className="inspector-field">
          <span className="inspector-label">API key</span>
          {hasKey && !replacing ? (
            <div className="vocab-key-row">
              <span className="vocab-key-saved">API key saved</span>
              <button type="button" className="vocab-action" onClick={() => setReplacing(true)}>
                Replace
              </button>
              <button type="button" className="vocab-action" onClick={() => void clearKey()}>
                Clear
              </button>
            </div>
          ) : (
            <input
              type="password"
              className="inspector-input"
              value={apiKey}
              placeholder={storeAvailable ? "Paste API key" : "Session-only API key"}
              autoComplete="off"
              onChange={(e) => setApiKey(e.currentTarget.value)}
            />
          )}
          {!storeAvailable ? (
            <span className="inspector-hint">
              Secure OS storage is unavailable. The key will be used for this session only
              and will not survive restart.
            </span>
          ) : null}
        </label>

        <label className="vocab-checkbox">
          <input
            type="checkbox"
            checked={draft.autoEnrich}
            onChange={(e) => setDraft({ ...draft, autoEnrich: e.currentTarget.checked })}
          />
          <span>Automatically enrich new vocabulary</span>
        </label>

        <button
          type="button"
          className="vocab-advanced-toggle"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "Hide advanced" : "Advanced"}
        </button>
        {showAdvanced ? (
          <label className="vocab-checkbox">
            <input
              type="checkbox"
              checked={draft.jsonMode}
              onChange={(e) => setDraft({ ...draft, jsonMode: e.currentTarget.checked })}
            />
            <span>
              Request JSON mode (advanced provider compatibility). Some
              OpenAI-compatible APIs support this; others do not. The strict prompt
              and response parser work without it.
            </span>
          </label>
        ) : null}

        {message ? <div className="vocab-settings-message">{message}</div> : null}

        <div className="vocab-actions">
          <button
            type="button"
            className="vocab-action primary"
            disabled={busy !== "idle" || !draft.baseUrl.trim() || !draft.model.trim()}
            onClick={() => void save()}
          >
            {busy === "saving" ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="vocab-action"
            disabled={busy !== "idle" || !draft.baseUrl.trim() || !draft.model.trim()}
            onClick={() => void testConnection()}
          >
            {busy === "testing" ? "Testing…" : "Test connection"}
          </button>
          <button type="button" className="vocab-action" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
