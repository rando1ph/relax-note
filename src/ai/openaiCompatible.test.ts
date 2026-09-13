import { describe, expect, it } from "vitest";
import { createOpenAiCompatibleProvider } from "./openaiCompatible";
import type { AiChatRequest, AiChatResult } from "./types";
import type { AiTransport } from "./rustTransport";

function fakeTransport() {
  const calls: { baseUrl: string; request: AiChatRequest }[] = [];
  const transport: AiTransport = {
    async chat(baseUrl, request): Promise<AiChatResult> {
      calls.push({ baseUrl, request });
      return { content: "{}", model: request.model };
    },
    async testConnection() {},
    async setApiKey() {},
    async clearApiKey() {},
    async hasApiKey() {
      return true;
    },
    async credentialStoreAvailable() {
      return true;
    },
    async cancel() {},
  };
  return { transport, calls };
}

describe("createOpenAiCompatibleProvider", () => {
  it("passes base URL and defaults json mode off", async () => {
    const { transport, calls } = fakeTransport();
    const provider = createOpenAiCompatibleProvider({
      baseUrl: "https://host/v1",
      model: "model-a",
      transport,
    });
    await provider.chat({
      model: "",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(calls[0].baseUrl).toBe("https://host/v1");
    expect(calls[0].request.model).toBe("model-a");
    expect(calls[0].request.jsonMode).toBe(false);
    expect(calls[0].request.temperature).toBe(0);
  });

  it("honours an explicit json mode request", async () => {
    const { transport, calls } = fakeTransport();
    const provider = createOpenAiCompatibleProvider({
      baseUrl: "https://host/v1",
      model: "model-a",
      transport,
      jsonMode: true,
    });
    await provider.chat({ model: "model-b", messages: [], jsonMode: false });
    expect(calls[0].request.model).toBe("model-b");
    expect(calls[0].request.jsonMode).toBe(false);
  });
});
