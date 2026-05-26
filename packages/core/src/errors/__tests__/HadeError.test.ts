import { describe, expect, it } from "vitest";
import { HadeError, createHadeErrorFactory, isHadeError } from "../HadeError.js";

describe("HadeError", () => {
  it("constructs with code, message, and context", () => {
    const err = new HadeError("CONFIG_INVALID", "bad config", {
      adapterKind: "venue",
      adapterName: "test@1.0.0",
    });
    expect(err.name).toBe("HadeError");
    expect(err.code).toBe("CONFIG_INVALID");
    expect(err.message).toBe("bad config");
    expect(err.context.adapterName).toBe("test@1.0.0");
    expect(err instanceof Error).toBe(true);
    expect(err instanceof HadeError).toBe(true);
  });

  it("isHadeError narrows correctly", () => {
    const err = new HadeError("UNKNOWN", "x", { adapterKind: "unknown", adapterName: "unknown" });
    expect(isHadeError(err)).toBe(true);
    expect(isHadeError(new Error("plain"))).toBe(false);
    expect(isHadeError("string")).toBe(false);
    expect(isHadeError(null)).toBe(false);
  });
});

describe("createHadeErrorFactory", () => {
  const factory = createHadeErrorFactory({
    adapterKind: "venue",
    adapterName: "google_places@1.0.0",
    requestId: "req_123",
  });

  it("failed() attributes adapter identity automatically", () => {
    const cause = new Error("network down");
    const err = factory.failed("call failed", cause, { http_status: 500 });
    expect(err.code).toBe("ADAPTER_FAILED");
    expect(err.context.adapterKind).toBe("venue");
    expect(err.context.adapterName).toBe("google_places@1.0.0");
    expect(err.context.requestId).toBe("req_123");
    expect(err.context.cause).toBe(cause);
    expect(err.context.fields).toEqual({ http_status: 500 });
  });

  it("timeout() embeds the deadline in fields", () => {
    const err = factory.timeout(1500);
    expect(err.code).toBe("ADAPTER_TIMEOUT");
    expect(err.message).toContain("1500ms");
    expect(err.context.fields).toEqual({ timeoutMs: 1500 });
  });

  it("notConfigured() embeds the missing key", () => {
    const err = factory.notConfigured("OPENAI_API_KEY");
    expect(err.code).toBe("ADAPTER_NOT_CONFIGURED");
    expect(err.message).toContain("OPENAI_API_KEY");
    expect(err.context.fields).toEqual({ missing: "OPENAI_API_KEY" });
  });

  it("cancelled() defaults to a generic message", () => {
    expect(factory.cancelled().message).toBe("Adapter call cancelled");
    expect(factory.cancelled("user aborted").message).toBe("user aborted");
  });
});
