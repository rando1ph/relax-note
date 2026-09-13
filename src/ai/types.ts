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
}

export interface AiChatResult {
  content: string;
  model: string;
}

/**
 * The small provider abstraction Vocabulary depends on. The implementation
 * invokes the Rust `ai_chat` command; the API key never travels through JS on
 * normal chat calls.
 */
export interface AiProvider {
  chat(request: AiChatRequest): Promise<AiChatResult>;
}
