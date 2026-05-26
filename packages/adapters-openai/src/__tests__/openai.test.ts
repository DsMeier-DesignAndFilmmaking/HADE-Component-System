import { describe, expect, it, vi } from "vitest";
import { openai, validatePatch, OPENAI_ADAPTER_ID } from "../index.js";

function fakeChatResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("openai adapter", () => {
  it("returns null when no API key is available", async () => {
    const adapter = openai({ apiKey: undefined, fetchImpl: vi.fn() as unknown as typeof fetch });
    const oldKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      await expect(adapter.enhanceCopy("prompt")).resolves.toBeNull();
    } finally {
      if (oldKey) process.env.OPENAI_API_KEY = oldKey;
    }
  });

  it("posts the canonical body shape with bearer auth", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      fakeChatResponse(JSON.stringify({ rationale: "ok" })),
    );
    const adapter = openai({ apiKey: "sk-test", fetchImpl: fetchImpl as unknown as typeof fetch });
    await adapter.enhanceCopy("a prompt");
    const call = fetchImpl.mock.calls[0]!;
    const [url, init] = call;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(260);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages).toEqual([{ role: "user", content: "a prompt" }]);
  });

  it("respects per-call model and timeout overrides", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => fakeChatResponse('{"rationale":"x"}'));
    const adapter = openai({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await adapter.enhanceCopy("p", { model: "gpt-5-mini", timeout_ms: 500 });
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe("gpt-5-mini");
  });

  it("returns the validated patch on a clean response", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      fakeChatResponse(
        JSON.stringify({
          rationale: "Hart's gets warm fast on Friday nights.",
          why_now: "Doors open in 5.",
          why_this: "Right wine list.",
          decision_frame: "Tonight's pick if you want low-key.",
        }),
      ),
    );
    const adapter = openai({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    const patch = await adapter.enhanceCopy("p");
    expect(patch).toEqual({
      rationale: "Hart's gets warm fast on Friday nights.",
      why_now: "Doors open in 5.",
      why_this: "Right wine list.",
      decision_frame: "Tonight's pick if you want low-key.",
    });
  });

  it("returns null on non-2xx response (legacy contract preserved)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("rate limited", { status: 429 }));
    const adapter = openai({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(adapter.enhanceCopy("p")).resolves.toBeNull();
  });

  it("returns null on network error (never throws)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error("ECONNRESET");
    });
    const adapter = openai({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(adapter.enhanceCopy("p")).resolves.toBeNull();
  });

  it("returns null when LLM content is not JSON", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => fakeChatResponse("not valid json"));
    const adapter = openai({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(adapter.enhanceCopy("p")).resolves.toBeNull();
  });

  it("returns null when LLM content parses to null or non-object", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => fakeChatResponse("null"));
    const adapter = openai({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(adapter.enhanceCopy("p")).resolves.toBeNull();
  });

  it("returns null when every field violates its char cap", async () => {
    const tooLong = "x".repeat(1000);
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      fakeChatResponse(
        JSON.stringify({
          rationale: tooLong,
          why_now: tooLong,
          why_this: tooLong,
          decision_frame: tooLong,
        }),
      ),
    );
    const adapter = openai({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(adapter.enhanceCopy("p")).resolves.toBeNull();
  });

  it("drops just the offending field, keeps the rest", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      fakeChatResponse(
        JSON.stringify({
          rationale: "x".repeat(500), // > 280 cap → dropped
          why_now: "OK",
          why_this: "OK",
        }),
      ),
    );
    const adapter = openai({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    const patch = await adapter.enhanceCopy("p");
    expect(patch).toEqual({ why_now: "OK", why_this: "OK" });
  });

  it("exposes a stable adapter id", () => {
    expect(openai({ apiKey: "k" }).id).toBe(OPENAI_ADAPTER_ID);
  });

  it("baseUrl override is normalized (trailing slash stripped)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => fakeChatResponse('{"rationale":"x"}'));
    const adapter = openai({
      apiKey: "k",
      baseUrl: "https://example.com/v1/",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await adapter.enhanceCopy("p");
    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://example.com/v1/chat/completions");
  });
});

describe("validatePatch", () => {
  it("drops non-string fields silently", () => {
    expect(validatePatch({ rationale: 42, why_now: null })).toEqual({});
  });

  it("drops fields over their per-field cap", () => {
    const tooLong = "x".repeat(300);
    expect(validatePatch({ rationale: tooLong })).toEqual({});
  });

  it("keeps fields exactly at their cap (boundary)", () => {
    const at280 = "x".repeat(280);
    const at120 = "y".repeat(120);
    const at60 = "z".repeat(60);
    const at180 = "w".repeat(180);
    expect(
      validatePatch({ rationale: at280, why_now: at120, why_this: at60, decision_frame: at180 }),
    ).toEqual({ rationale: at280, why_now: at120, why_this: at60, decision_frame: at180 });
  });

  it("ignores fields outside the whitelist", () => {
    expect(validatePatch({ rationale: "ok", extra: "should drop" })).toEqual({ rationale: "ok" });
  });
});
