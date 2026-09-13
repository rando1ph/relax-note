import { getAppSetting, setAppSetting } from "../platform/db";

/** Non-secret AI configuration. The API key is never part of this object. */
export interface AiSettings {
  baseUrl: string;
  model: string;
  autoEnrich: boolean;
  jsonMode: boolean;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  baseUrl: "",
  model: "",
  autoEnrich: true,
  jsonMode: false,
};

const KEYS = {
  baseUrl: "ai.base_url",
  model: "ai.model",
  autoEnrich: "ai.auto_enrich",
  jsonMode: "ai.json_mode",
} as const;

export interface RawAiSettings {
  baseUrl: string | null;
  model: string | null;
  autoEnrich: string | null;
  jsonMode: string | null;
}

/** Pure resolver: absent settings fall back to defaults (autoEnrich = true). */
export function resolveAiSettings(raw: RawAiSettings): AiSettings {
  return {
    baseUrl: raw.baseUrl ?? DEFAULT_AI_SETTINGS.baseUrl,
    model: raw.model ?? DEFAULT_AI_SETTINGS.model,
    autoEnrich: raw.autoEnrich == null ? DEFAULT_AI_SETTINGS.autoEnrich : raw.autoEnrich === "1",
    jsonMode: raw.jsonMode == null ? DEFAULT_AI_SETTINGS.jsonMode : raw.jsonMode === "1",
  };
}

export async function loadAiSettings(): Promise<AiSettings> {
  const [baseUrl, model, autoEnrich, jsonMode] = await Promise.all([
    getAppSetting(KEYS.baseUrl),
    getAppSetting(KEYS.model),
    getAppSetting(KEYS.autoEnrich),
    getAppSetting(KEYS.jsonMode),
  ]);
  return resolveAiSettings({ baseUrl, model, autoEnrich, jsonMode });
}

export async function saveAiSettings(settings: AiSettings): Promise<void> {
  await Promise.all([
    setAppSetting(KEYS.baseUrl, settings.baseUrl),
    setAppSetting(KEYS.model, settings.model),
    setAppSetting(KEYS.autoEnrich, settings.autoEnrich ? "1" : "0"),
    setAppSetting(KEYS.jsonMode, settings.jsonMode ? "1" : "0"),
  ]);
}

export function isAiConfigured(settings: AiSettings): boolean {
  return settings.baseUrl.trim().length > 0 && settings.model.trim().length > 0;
}
