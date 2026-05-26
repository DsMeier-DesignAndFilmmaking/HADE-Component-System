/**
 * @hade/adapters-openai — clean-room LLMAdapter for OpenAI chat completions.
 *
 * Replicates the inline `enhanceCopyWithLLM` from
 * `src/app/api/hade/decide/route.ts:814-920` byte-for-byte: same model, same
 * temperature, same max_tokens, same `response_format: { type: "json_object" }`,
 * same 1500 ms timeout, same char-cap validation (280/120/60/180), same
 * "null on any failure → caller falls back to deterministic copy" contract.
 *
 * The adapter parses the LLM JSON itself; per-field char caps are enforced
 * inside the adapter so the engine receives a pre-validated patch.
 *
 * The adapter does NOT validate that the LLM didn't change venue identity —
 * that's `extractSafeCopyPatch`'s job in the route, called AFTER `enhanceCopy`.
 */

import type { LLMAdapter } from "@hade/core";

// ─── Defaults (mirror src/app/api/hade/decide/route.ts:34, 856-858, 904-907) ──

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 260;
const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

const RATIONALE_MAX_CHARS = 280;
const WHY_NOW_MAX_CHARS = 120;
const WHY_THIS_MAX_CHARS = 60;
const DECISION_FRAME_MAX_CHARS = 180;

export const OPENAI_ADAPTER_ID = "openai@1.0.0" as const;

export interface OpenAIAdapterOptions {
  /** Falls back to `process.env.OPENAI_API_KEY` at first call; never read eagerly. */
  readonly apiKey?: string;
  /** Default `"gpt-4o-mini"`. */
  readonly model?: string;
  /** Default `0.7`. */
  readonly temperature?: number;
  /** Default `260`. */
  readonly maxTokens?: number;
  /** Default `1500` ms — matches `COPY_ENHANCE_TIMEOUT_MS`. */
  readonly timeoutMs?: number;
  /** Default `"https://api.openai.com/v1"`. Override for proxies / Azure OpenAI. */
  readonly baseUrl?: string;
  /** Override for tests / non-global fetch contexts. */
  readonly fetchImpl?: typeof fetch;
  /** Override the adapter id surfaced in logs. */
  readonly id?: string;
}

export interface CopyPatch {
  rationale?: string;
  why_now?: string;
  why_this?: string;
  decision_frame?: string;
}

export function openai(opts: OpenAIAdapterOptions = {}): LLMAdapter {
  const model = opts.model ?? DEFAULT_MODEL;
  const temperature = opts.temperature ?? DEFAULT_TEMPERATURE;
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const defaultTimeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const id = opts.id ?? OPENAI_ADAPTER_ID;

  let apiKey: string | undefined = opts.apiKey;
  function getApiKey(): string | null {
    if (apiKey) return apiKey;
    const envKey =
      typeof process !== "undefined" && process.env ? process.env.OPENAI_API_KEY : undefined;
    if (envKey) apiKey = envKey;
    return apiKey ?? null;
  }

  return {
    id,
    async enhanceCopy(
      prompt: string,
      options?: { timeout_ms?: number; model?: string },
    ): Promise<CopyPatch | null> {
      const key = getApiKey();
      if (!key) return null;
      const effectiveModel = options?.model ?? model;
      const effectiveTimeout = options?.timeout_ms ?? defaultTimeoutMs;

      // The legacy route builds {system, user} from app context. The adapter
      // accepts a SINGLE prompt string and uses it as `user` content. Callers
      // that want a separate system message embed it inside the prompt.
      // This matches the LLMAdapter contract (declared in @hade/core/types/adapters.ts).
      const body = {
        model: effectiveModel,
        temperature,
        max_tokens: maxTokens,
        messages: [{ role: "user" as const, content: prompt }],
        response_format: { type: "json_object" as const },
      };

      let response: Response;
      try {
        // `cache: "no-store"` is WHATWG-standard but not in Node's stricter
        // RequestInit type without DOM lib. Cast preserves runtime behavior
        // (Next.js needs this to bypass auto-caching of POST in route handlers).
        response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: AbortSignal.timeout(effectiveTimeout),
        } as RequestInit);
      } catch {
        return null; // Network / timeout / abort — preserve legacy null contract.
      }

      if (!response.ok) return null;

      let rawContent: string;
      try {
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        rawContent = data.choices?.[0]?.message?.content ?? "";
      } catch {
        return null;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        return null;
      }

      if (typeof parsed !== "object" || parsed === null) return null;
      const obj = parsed as Record<string, unknown>;

      const validated = validatePatch(obj);
      // Mirror legacy semantics: if every field violated its char cap, return null
      // so the caller uses deterministic copy unchanged.
      return Object.keys(validated).length === 0 ? null : validated;
    },
  };
}

// ─── Validation (mirrors route.ts:899-907) ────────────────────────────────────

/**
 * Drops any field that:
 *   • is not a string
 *   • exceeds its per-field char cap (truncation produces broken copy)
 *
 * Returns only the surviving subset. Order matches the legacy code.
 */
export function validatePatch(raw: Record<string, unknown>): CopyPatch {
  const out: CopyPatch = {};
  const candidate = raw as CopyPatch;
  if (typeof candidate.rationale === "string" && candidate.rationale.length <= RATIONALE_MAX_CHARS) {
    out.rationale = candidate.rationale;
  }
  if (typeof candidate.why_now === "string" && candidate.why_now.length <= WHY_NOW_MAX_CHARS) {
    out.why_now = candidate.why_now;
  }
  if (typeof candidate.why_this === "string" && candidate.why_this.length <= WHY_THIS_MAX_CHARS) {
    out.why_this = candidate.why_this;
  }
  if (
    typeof candidate.decision_frame === "string" &&
    candidate.decision_frame.length <= DECISION_FRAME_MAX_CHARS
  ) {
    out.decision_frame = candidate.decision_frame;
  }
  return out;
}
