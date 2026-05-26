import { loadConfig, fromHadeDecision } from '@hade/core';

// src/fixtures/makeConfig.ts
function makeConfig(overrides = {}) {
  return loadConfig(overrides, { clientId: "testkit-client" });
}

// src/fixtures/makeDecision.ts
var counter = 0;
function makeDecision(overrides = {}) {
  const id = `decision-${++counter}`;
  return {
    id,
    venue_name: `Test Venue ${counter}`,
    category: "restaurant",
    geo: { lat: 40.7128, lng: -74.006 },
    distance_meters: 250,
    eta_minutes: 5,
    rationale: "A solid pick that matches your situation.",
    why_now: "Right time of day for this kind of place.",
    why_this: "Strong fit with your stated intent.",
    decision_frame: "We weighed proximity vs. signal strength.",
    confidence_label: "Good fit",
    confidence: 0.72,
    situation_summary: "Looking for a place to eat nearby.",
    is_fallback: false,
    ...overrides
  };
}
function resetDecisionCounter() {
  counter = 0;
}
function makeDecisionEngineOutput(decisionOverrides = {}, outputOverrides = {}) {
  const decision = makeDecision(decisionOverrides);
  const base = fromHadeDecision(decision, {
    request_id: outputOverrides.request_id ?? "req_test",
    generated_at_ms: outputOverrides.generated_at_ms ?? 17e11,
    locale: "en-US",
    config_hash: "sha256:test"
  });
  return { ...base, ...outputOverrides };
}

// src/fixtures/makeVenueCandidate.ts
var counter2 = 0;
function makeVenueCandidate(overrides = {}) {
  const id = `venue-${++counter2}`;
  return {
    id,
    name: `Venue ${counter2}`,
    category: "restaurant",
    vibe: "neighborhood favorite",
    geo: { lat: 40.7128, lng: -74.006 },
    distance_meters: 250,
    is_open: true,
    rating: 4.5,
    ...overrides
  };
}
function resetVenueCandidateCounter() {
  counter2 = 0;
}

// src/mocks/mockVenueAdapter.ts
function mockVenueAdapter(options = {}) {
  const id = options.id ?? "mock_venue@1.0.0";
  const batches = options.batches ?? [];
  const calls = [];
  let cursor = 0;
  function nextBatch() {
    if (batches.length === 0) return [];
    if (cursor >= batches.length) {
      if (options.loop) cursor = 0;
      else return [];
    }
    const batch = batches[cursor];
    cursor++;
    return [...batch];
  }
  function maybeThrow() {
    if (options.alwaysFail) {
      if (options.alwaysFail instanceof Error) throw options.alwaysFail;
      throw new Error(`${id}: mock adapter configured to always fail`);
    }
  }
  return {
    id,
    calls,
    reset() {
      calls.length = 0;
      cursor = 0;
    },
    async searchNearby(args) {
      calls.push({ kind: "searchNearby", args });
      maybeThrow();
      return nextBatch();
    },
    async searchMultiQuery(args) {
      calls.push({ kind: "searchMultiQuery", args });
      maybeThrow();
      return nextBatch();
    },
    async searchForContext(args, categories) {
      calls.push({ kind: "searchForContext", args, categories: [...categories] });
      maybeThrow();
      return nextBatch();
    }
  };
}

// src/mocks/mockLLMAdapter.ts
function mockLLMAdapter(options = {}) {
  const id = options.id ?? "mock_llm@1.0.0";
  const responses = options.responses ?? [];
  const calls = [];
  let cursor = 0;
  return {
    id,
    calls,
    reset() {
      calls.length = 0;
      cursor = 0;
    },
    async enhanceCopy(prompt, opts) {
      calls.push({ prompt, options: opts });
      if (options.alwaysFail) {
        if (options.alwaysFail instanceof Error) throw options.alwaysFail;
        throw new Error(`${id}: mock adapter configured to always fail`);
      }
      if (cursor >= responses.length) return null;
      const response = responses[cursor];
      cursor++;
      return response;
    }
  };
}

// src/mocks/mockCacheAdapter.ts
function mockCacheAdapter(options = {}) {
  const id = options.id ?? "mock_cache@1.0.0";
  const mode = options.mode ?? "FULL";
  const store = new Map(Object.entries(options.initial ?? {}));
  const calls = [];
  return {
    id,
    calls,
    store,
    mode() {
      return mode;
    },
    reset() {
      calls.length = 0;
      store.clear();
      for (const [k, v] of Object.entries(options.initial ?? {})) store.set(k, v);
    },
    async get(key) {
      const hit = store.has(key);
      calls.push({ kind: "get", key, hit });
      return hit ? store.get(key) : null;
    },
    async set(key, value, ttlSeconds) {
      calls.push({ kind: "set", key, ttlSeconds });
      store.set(key, value);
    }
  };
}

// src/mocks/mockGeoAdapter.ts
function mockGeoAdapter(options = {}) {
  const id = options.id ?? "mock_geo@1.0.0";
  const queue = [...options.coords ?? []];
  let calls = 0;
  return {
    id,
    get calls() {
      return calls;
    },
    reset() {
      calls = 0;
      queue.length = 0;
      queue.push(...options.coords ?? []);
    },
    async resolveCoords() {
      calls++;
      if (options.alwaysFail) {
        if (options.alwaysFail instanceof Error) throw options.alwaysFail;
        throw new Error(`${id}: mock adapter configured to always fail`);
      }
      if (queue.length === 0) return null;
      return queue.shift() ?? null;
    }
  };
}

// src/clock/fakeClock.ts
var Y2024_MS = 17e11;
function fakeClock(options = {}) {
  const originalNow = Date.now;
  const originalRandom = Math.random;
  const seed = options.randomSeed ?? 0.5;
  let current = options.nowMs ?? Y2024_MS;
  Date.now = () => current;
  Math.random = () => seed;
  return {
    now() {
      return current;
    },
    advance(ms) {
      current += ms;
    },
    restore() {
      Date.now = originalNow;
      Math.random = originalRandom;
    }
  };
}

// src/index.ts
var HADE_TESTKIT_VERSION = "0.1.0-alpha.0";

export { HADE_TESTKIT_VERSION, fakeClock, makeConfig, makeDecision, makeDecisionEngineOutput, makeVenueCandidate, mockCacheAdapter, mockGeoAdapter, mockLLMAdapter, mockVenueAdapter, resetDecisionCounter, resetVenueCandidateCounter };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map