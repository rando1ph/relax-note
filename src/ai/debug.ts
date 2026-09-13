/**
 * Dev-only AI diagnostics. Never logs API keys, Authorization headers, prompts,
 * full PDF context, or full model responses.
 */
export function debugAi(event: string, data: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  console.debug("[ai]", event, data);
}

export function endpointHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "";
  }
}

/** Dev-only short preview of assistant text (never logged in production). */
export function debugPreview(content: string, max = 200): string | undefined {
  if (!import.meta.env.DEV) return undefined;
  return content.slice(0, max);
}
