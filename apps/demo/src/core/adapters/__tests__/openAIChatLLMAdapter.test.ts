import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({
  serverEnv: { openAiApiKey: "sk-fixture-default" },
}));

import {
  OPENAI_CHAT_LLM_ADAPTER_ID,
  createOpenAIChatLLMAdapter,
} from "../openAIChatLLMAdapter";

function fakeChatResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("createOpenAIChatLLMAdapter", () => {
  it("exposes a stable id matching the legacy adapter convention", () => {
    const adapter = createOpenAIChatLLMAdapter({ apiKey: "k" });
    expect(adapter.id).toBe(OPENAI_CHAT_LLM_ADAPTER_ID);
    expect(adapter.id).toBe("openai_chat_legacy@0.0.0");
  });

  it("sends a byte-identical OpenAI request body (system + user, temp 0.7, json_object)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      fakeChatResponse(JSON.stringify({ rationale: "ok" })),
    );
    const adapter = createOpenAIChatLLMAdapter({ apiKey: "sk-test", fetchImpl });
    await adapter.enhanceCopy("USER PROMPT GOES HERE");

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Authorization).toBe("Bearer sk-test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(260);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("terse, evocative copy writer");
    expect(body.messages[1]).toEqual({ role: "user", content: "USER PROMPT GOES HERE" });
  });

  it("returns null when no API key is configured", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const adapter = createOpenAIChatLLMAdapter({ apiKey: "", fetchImpl });
    await expect(adapter.enhanceCopy("p")).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null on non-2xx (preserves legacy contract)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 429 }));
    const adapter = createOpenAIChatLLMAdapter({ apiKey: "k", fetchImpl });
    await expect(adapter.enhanceCopy("p")).resolves.toBeNull();
  });

  it("returns null when LLM content is not JSON", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => fakeChatResponse("not json"));
    const adapter = createOpenAIChatLLMAdapter({ apiKey: "k", fetchImpl });
    await expect(adapter.enhanceCopy("p")).resolves.toBeNull();
  });

  it("returns null on network error (never throws)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error("ECONNRESET");
    });
    const adapter = createOpenAIChatLLMAdapter({ apiKey: "k", fetchImpl });
    await expect(adapter.enhanceCopy("p")).resolves.toBeNull();
  });

  it("parses the rationale/why_now/why_this/decision_frame keys verbatim", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      fakeChatResponse(
        JSON.stringify({
          rationale: "Hart's gets warm fast on Friday nights.",
          why_now: "Doors open in 5.",
          why_this: "Right wine list.",
          decision_frame: "Tonight's pick if you want low-key.",
          extra_field: "should be ignored downstream by char caps",
        }),
      ),
    );
    const adapter = createOpenAIChatLLMAdapter({ apiKey: "k", fetchImpl });
    const patch = await adapter.enhanceCopy("p");
    expect(patch).toEqual({
      rationale: "Hart's gets warm fast on Friday nights.",
      why_now: "Doors open in 5.",
      why_this: "Right wine list.",
      decision_frame: "Tonight's pick if you want low-key.",
    });
  });

  it("honors a per-call model override", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      fakeChatResponse(JSON.stringify({ rationale: "ok" })),
    );
    const adapter = createOpenAIChatLLMAdapter({ apiKey: "k", fetchImpl });
    await adapter.enhanceCopy("p", { model: "gpt-5-mini" });
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe("gpt-5-mini");
  });
});
