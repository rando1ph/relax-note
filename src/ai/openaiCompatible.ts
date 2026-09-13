import type { AiChatRequest, AiChatResult, AiProvider } from "./types";
import type { AiTransport } from "./rustTransport";
import { tauriAiTransport } from "./rustTransport";

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  model: string;
  transport?: AiTransport;
  /** Optional provider capability; off by default for compatibility. */
  jsonMode?: boolean;
  maxTokens?: number;
}

/**
 * OpenAI-compatible provider. The heavy lifting (URL validation, credential
 * lookup, redirect policy) happens in Rust; this only shapes the request.
 */
export function createOpenAiCompatibleProvider(
  config: OpenAiCompatibleConfig,
): AiProvider {
  const transport = config.transport ?? tauriAiTransport;
  return {
    async chat(request: AiChatRequest): Promise<AiChatResult> {
      const model = request.model || config.model;
      return transport.chat(config.baseUrl, {
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0,
        jsonMode: request.jsonMode ?? config.jsonMode ?? false,
        maxTokens: request.maxTokens ?? config.maxTokens,
        requestId: request.requestId,
      });
    },
  };
}
