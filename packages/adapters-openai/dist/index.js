// src/index.ts
var DEFAULT_MODEL = "gpt-4o-mini";
var DEFAULT_TEMPERATURE = 0.7;
var DEFAULT_MAX_TOKENS = 260;
var DEFAULT_TIMEOUT_MS = 1500;
var DEFAULT_BASE_URL = "https://api.openai.com/v1";
var RATIONALE_MAX_CHARS = 280;
var WHY_NOW_MAX_CHARS = 120;
var WHY_THIS_MAX_CHARS = 60;
var DECISION_FRAME_MAX_CHARS = 180;
var OPENAI_ADAPTER_ID = "openai@1.0.0";
function openai(opts = {}) {
  const model = opts.model ?? DEFAULT_MODEL;
  const temperature = opts.temperature ?? DEFAULT_TEMPERATURE;
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const defaultTimeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const id = opts.id ?? OPENAI_ADAPTER_ID;
  let apiKey = opts.apiKey;
  function getApiKey() {
    if (apiKey) return apiKey;
    const envKey = typeof process !== "undefined" && process.env ? process.env.OPENAI_API_KEY : void 0;
    if (envKey) apiKey = envKey;
    return apiKey ?? null;
  }
  return {
    id,
    async enhanceCopy(prompt, options) {
      const key = getApiKey();
      if (!key) return null;
      const effectiveModel = options?.model ?? model;
      const effectiveTimeout = options?.timeout_ms ?? defaultTimeoutMs;
      const body = {
        model: effectiveModel,
        temperature,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      };
      let response;
      try {
        response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`
          },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: AbortSignal.timeout(effectiveTimeout)
        });
      } catch {
        return null;
      }
      if (!response.ok) return null;
      let rawContent;
      try {
        const data = await response.json();
        rawContent = data.choices?.[0]?.message?.content ?? "";
      } catch {
        return null;
      }
      let parsed;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        return null;
      }
      if (typeof parsed !== "object" || parsed === null) return null;
      const obj = parsed;
      const validated = validatePatch(obj);
      return Object.keys(validated).length === 0 ? null : validated;
    }
  };
}
function validatePatch(raw) {
  const out = {};
  const candidate = raw;
  if (typeof candidate.rationale === "string" && candidate.rationale.length <= RATIONALE_MAX_CHARS) {
    out.rationale = candidate.rationale;
  }
  if (typeof candidate.why_now === "string" && candidate.why_now.length <= WHY_NOW_MAX_CHARS) {
    out.why_now = candidate.why_now;
  }
  if (typeof candidate.why_this === "string" && candidate.why_this.length <= WHY_THIS_MAX_CHARS) {
    out.why_this = candidate.why_this;
  }
  if (typeof candidate.decision_frame === "string" && candidate.decision_frame.length <= DECISION_FRAME_MAX_CHARS) {
    out.decision_frame = candidate.decision_frame;
  }
  return out;
}

export { OPENAI_ADAPTER_ID, openai, validatePatch };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map