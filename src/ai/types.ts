export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiChatRequest {
  model: string;
  messages: AiMessage[];
  temperature?: number;
  /** Optional provider capability; defaults to false for compatibility. */
  jsonMode?: boolean;
  maxTokens?: number;
  requestId?: string;
  /** Optional per-request timeout (ms). Omitted → the transport default applies. */
  timeoutMs?: number;
}

export interface AiChatResult {
  content: string;
  model: string;
  /**
   * Normalized OpenAI-compatible `choices[0].finish_reason`. Optional so a
   * provider that omits it still yields a valid result. `null`/undefined means
   * unknown.
   */
  finishReason?: AiFinishReason | null;
}

/** Normalized finish reasons surfaced by the transport. */
export type AiFinishReason = "stop" | "length" | "other";

/**
 * The small provider abstraction Vocabulary depends on. The implementation
 * invokes the Rust `ai_chat` command; the API key never travels through JS on
 * normal chat calls.
 */
export interface AiProvider {
  chat(request: AiChatRequest): Promise<AiChatResult>;
}
