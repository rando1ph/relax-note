import { invoke } from "@tauri-apps/api/core";
import type { AiChatRequest, AiChatResult, AiMessage } from "./types";

/**
 * Thin wrapper over the Rust AI commands. `aiChat` does not carry the API key:
 * Rust resolves the credential internally by the endpoint's normalized origin.
 */
export interface AiTransport {
  chat(baseUrl: string, request: AiChatRequest): Promise<AiChatResult>;
  testConnection(baseUrl: string, model: string): Promise<void>;
  setApiKey(baseUrl: string, key: string, persist: boolean): Promise<void>;
  clearApiKey(baseUrl: string): Promise<void>;
  hasApiKey(baseUrl: string): Promise<boolean>;
  credentialStoreAvailable(): Promise<boolean>;
  cancel(requestId: string): Promise<void>;
}

export const tauriAiTransport: AiTransport = {
  async chat(baseUrl, request) {
    return invoke<AiChatResult>("ai_chat", {
      baseUrl,
      model: request.model,
      messages: request.messages as AiMessage[],
      temperature: request.temperature ?? null,
      jsonMode: request.jsonMode ?? false,
      maxTokens: request.maxTokens ?? null,
      requestId: request.requestId ?? null,
    });
  },
  async testConnection(baseUrl, model) {
    await invoke("ai_test_connection", { baseUrl, model });
  },
  async setApiKey(baseUrl, key, persist) {
    await invoke("ai_set_api_key", { baseUrl, key, persist });
  },
  async clearApiKey(baseUrl) {
    await invoke("ai_clear_api_key", { baseUrl });
  },
  async hasApiKey(baseUrl) {
    return invoke<boolean>("ai_has_api_key", { baseUrl });
  },
  async credentialStoreAvailable() {
    return invoke<boolean>("ai_credential_store_available");
  },
  async cancel(requestId) {
    await invoke("ai_cancel", { requestId });
  },
};
