/**
 * Deterministic clock helpers for HADE consumer tests.
 *
 * `fakeClock` patches `Date.now()` and `Math.random()` globally for the
 * lifetime of the returned controller, then restores both on `restore()`.
 * Use it in test setup to make request IDs, generated_at timestamps, and
 * any other entropy-driven outputs reproducible.
 *
 * @example
 *   const clock = fakeClock({ nowMs: 1_700_000_000_000, randomSeed: 0.42 });
 *   try {
 *     const output = await client.decide({ ... });
 *     expect(output.generated_at_ms).toBe(1_700_000_000_000);
 *   } finally {
 *     clock.restore();
 *   }
 */
export interface FakeClockOptions {
  /** Initial epoch ms returned by `Date.now()`. Defaults to a Y2024 ms. */
  readonly nowMs?: number;
  /** Value returned by every `Math.random()` call. Defaults to 0.5. */
  readonly randomSeed?: number;
}

export interface FakeClock {
  /** Current frozen time in epoch ms. */
  now(): number;
  /** Advance the clock by `ms`. */
  advance(ms: number): void;
  /** Restore the original `Date.now` + `Math.random`. */
  restore(): void;
}

const Y2024_MS = 1_700_000_000_000;

export function fakeClock(options: FakeClockOptions = {}): FakeClock {
  const originalNow = Date.now;
  const originalRandom = Math.random;
  const seed = options.randomSeed ?? 0.5;
  let current = options.nowMs ?? Y2024_MS;

  Date.now = (): number => current;
  Math.random = (): number => seed;

  return {
    now(): number {
      return current;
    },
    advance(ms: number): void {
      current += ms;
    },
    restore(): void {
      Date.now = originalNow;
      Math.random = originalRandom;
    },
  };
}
