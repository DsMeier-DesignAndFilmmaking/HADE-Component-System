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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SignalQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("flushAsync does not POST directly from the UI queue", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const queue = new SignalQueue();
    queue.enqueue(makeVibeSignal());

    await queue.flushAsync();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("flushAsync drains the in-memory queue without direct network delivery", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const queue = new SignalQueue();
    queue.enqueue(makeVibeSignal("s1"));
    queue.enqueue(makeVibeSignal("s2"));
    queue.enqueue(makeVibeSignal("s3"));

    await queue.flushAsync();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("flushAsync resolves immediately when queue is empty (no POST)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const queue = new SignalQueue();
    await queue.flushAsync(); // nothing in queue

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
