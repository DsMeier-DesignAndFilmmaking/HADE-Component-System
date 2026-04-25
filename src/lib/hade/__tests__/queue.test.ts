import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignalQueue } from "../queue";
import type { VibeSignal } from "@/types/hade";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeVibeSignal(id = "test-sig"): VibeSignal {
  const now = new Date();
  return {
    id,
    type: "AMBIENT",
    venue_id: "venue-123",
    location_node_id: "venue-123",
    content: "too_crowded",
    strength: 0.8,
    emitted_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 14_400_000).toISOString(),
    geo: { lat: 37.7749, lng: -122.4194 },
    source: "user",
    category: "vibe",
    shareable: false,
    validation_status: "pending",
    vibe_tags: ["too_crowded"],
    sentiment: "negative",
  };
}

function makeOkResponse(accepted = 1): Response {
  return new Response(
    JSON.stringify({
      accepted,
      rejected: 0,
      signal_ids: Array.from({ length: accepted }, (_, i) => `sig-${i}`),
      node_versions: {},
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SignalQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("flushAsync resolves after POST round-trip, not synchronously", async () => {
    let resolvePost!: (r: Response) => void;
    const postHeld = new Promise<Response>((res) => {
      resolvePost = res;
    });

    const fetchSpy = vi.fn().mockReturnValue(postHeld);
    vi.stubGlobal("fetch", fetchSpy);

    const queue = new SignalQueue();
    queue.enqueue(makeVibeSignal());

    let resolved = false;
    const flushDone = queue.flushAsync().then(() => {
      resolved = true;
    });

    // fetch must have been called immediately (flushAsync drains synchronously before awaiting)
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/hade/signal");
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ method: "POST" });

    // Promise must not have resolved yet — we're waiting on the network
    expect(resolved).toBe(false);

    // Unblock the network response
    resolvePost(makeOkResponse());
    await flushDone;

    expect(resolved).toBe(true);
  });

  it("flushAsync batches multiple enqueued signals into a single POST", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(makeOkResponse(3));
    vi.stubGlobal("fetch", fetchSpy);

    const queue = new SignalQueue();
    queue.enqueue(makeVibeSignal("s1"));
    queue.enqueue(makeVibeSignal("s2"));
    queue.enqueue(makeVibeSignal("s3"));

    await queue.flushAsync();

    expect(fetchSpy).toHaveBeenCalledOnce();

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string) as {
      signals: unknown[];
    };
    expect(body.signals).toHaveLength(3);
  });

  it("flushAsync resolves immediately when queue is empty (no POST)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const queue = new SignalQueue();
    await queue.flushAsync(); // nothing in queue

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
