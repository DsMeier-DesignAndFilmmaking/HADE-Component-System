import { describe, expect, it } from "vitest";
import { callAdapter } from "../callAdapter.js";
import { HadeError } from "../../errors/HadeError.js";

const ADAPTER = { kind: "venue" as const, name: "test@1.0.0" as const };

describe("callAdapter", () => {
  it("returns ok with the task's value", async () => {
    const result = await callAdapter({ timeoutMs: 100, adapter: ADAPTER }, async () => 42);
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it("times out and never throws", async () => {
    const result = await callAdapter(
      { timeoutMs: 20, adapter: ADAPTER },
      () => new Promise<number>(() => {}), // never resolves
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ADAPTER_TIMEOUT");
      expect(result.error.message).toContain("20ms");
    }
  });

  it("aborts the task's signal on timeout", async () => {
    let observedAborted = false;
    const result = await callAdapter({ timeoutMs: 15, adapter: ADAPTER }, async ({ signal }) => {
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => {
          observedAborted = true;
          resolve();
        });
      });
      return "unreachable";
    });
    expect(result.ok).toBe(false);
    expect(observedAborted).toBe(true);
  });

  it("converts a thrown HadeError to Result.err verbatim", async () => {
    const result = await callAdapter({ timeoutMs: 100, adapter: ADAPTER }, async ({ errors }) => {
      throw errors.notConfigured("API_KEY");
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(HadeError);
      expect(result.error.code).toBe("ADAPTER_NOT_CONFIGURED");
      expect(result.error.context.adapterName).toBe("test@1.0.0");
    }
  });

  it("wraps a raw thrown Error as ADAPTER_FAILED", async () => {
    const result = await callAdapter({ timeoutMs: 100, adapter: ADAPTER }, async () => {
      throw new Error("boom");
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ADAPTER_FAILED");
      expect(result.error.message).toBe("boom");
    }
  });

  it("honors an already-aborted parent signal", async () => {
    const parent = new AbortController();
    parent.abort();
    const result = await callAdapter(
      { timeoutMs: 100, adapter: ADAPTER, parentSignal: parent.signal },
      async () => 99,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ADAPTER_CANCELLED");
  });

  it("propagates a mid-flight parent abort to the task signal", async () => {
    const parent = new AbortController();
    let aborted = false;
    const pending = callAdapter(
      { timeoutMs: 500, adapter: ADAPTER, parentSignal: parent.signal },
      async ({ signal }) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            resolve();
          });
        });
        return "unreachable";
      },
    );
    setTimeout(() => parent.abort(), 5);
    const result = await pending;
    expect(aborted).toBe(true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ADAPTER_CANCELLED");
  });

  it("never throws — even if the task throws a non-Error value", async () => {
    const result = await callAdapter({ timeoutMs: 100, adapter: ADAPTER }, async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "string error";
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ADAPTER_FAILED");
      expect(result.error.message).toBe("Unknown adapter failure");
    }
  });
});
