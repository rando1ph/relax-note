import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { DEFAULT_AI_SETTINGS, isAiConfigured, loadAiSettings } from "../ai/settings";
import type { AiSettings } from "../ai/settings";

/**
 * Shared AI settings owner. The base URL, model, credential/configured status,
 * and JSON-mode/provider settings are application infrastructure consumed by
 * both Vocabulary and the AI Tutor. The API key itself is never part of this
 * state (it lives only in the Rust credential store / session memory).
 */
export interface AiSettingsStore {
  settings: AiSettings;
  configured: boolean;
  reloadSettings: () => Promise<void>;
}

const AiSettingsContext = createContext<AiSettingsStore | null>(null);

export function AiSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);

  const reloadSettings = useCallback(async () => {
    const loaded = await loadAiSettings();
    setSettings(loaded);
  }, []);

  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);

  const value = useMemo<AiSettingsStore>(
    () => ({
      settings,
      configured: isAiConfigured(settings),
      reloadSettings,
    }),
    [settings, reloadSettings],
  );

  return <AiSettingsContext.Provider value={value}>{children}</AiSettingsContext.Provider>;
}

export function useAiSettings(): AiSettingsStore {
  const ctx = useContext(AiSettingsContext);
  if (!ctx) throw new Error("useAiSettings must be used within an AiSettingsProvider");
  return ctx;
}
