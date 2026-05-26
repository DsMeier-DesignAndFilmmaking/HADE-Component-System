import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueSignal } from "../queue";
import { recordNavigationTelemetry } from "../navigationTelemetry";

vi.mock("../deviceId", () => ({
  getDeviceId: () => "device-test",
}));

vi.mock("../queue", () => ({
  enqueueSignal: vi.fn(() => Promise.resolve()),
}));

const baseInput = {
  objectId: "place-123",
  title: "Union Station",
  lat: 39.7392,
  lng: -104.9903,
  url: "https://maps.apple.com/?q=Union%20Station&ll=39.7392,-104.9903",
  platform: "ios",
  coordinatesValid: true,
};

async function readBeaconPayload(body: BodyInit): Promise<Record<string, unknown>> {
  expect(body).toBeInstanceOf(Blob);
  return JSON.parse(await (body as Blob).text()) as Record<string, unknown>;
}

describe("recordNavigationTelemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 202 }))));
  });

  it("sends a valid signal ingest payload with sendBeacon", async () => {
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon,
    });

    recordNavigationTelemetry(baseInput);

    expect(sendBeacon).toHaveBeenCalledOnce();
    expect(sendBeacon).toHaveBeenCalledWith("/api/hade/signal", expect.any(Blob));

    const beaconCalls = sendBeacon.mock.calls as unknown as Array<[string, BodyInit]>;
    const payload = await readBeaconPayload(beaconCalls[0][1]);
    const signals = payload.signals as Array<Record<string, unknown>>;
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      id: "nav_place-123_39739200_-104990300",
      type: "INTENT",
      venue_id: "place-123",
      location_node_id: "place-123",
      content: "navigation_conversion",
      strength: 1,
      source_user_id: "device-test",
      source: "user",
      category: "vibe",
      shareable: false,
      validation_status: "pending",
      vibe_tags: ["worth_it"],
      sentiment: "positive",
      geo: { lat: 39.7392, lng: -104.9903 },
    });
    expect(enqueueSignal).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to durable queue and keepalive fetch when sendBeacon fails", () => {
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: vi.fn(() => false),
    });

    recordNavigationTelemetry({ ...baseInput, objectId: "place-456" });

    expect(enqueueSignal).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      "/api/hade/signal",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
      }),
    );
  });

  it("prevents duplicate conversion telemetry for the same object and URL", () => {
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon,
    });

    const input = { ...baseInput, objectId: "place-789" };
    recordNavigationTelemetry(input);
    recordNavigationTelemetry(input);

    expect(sendBeacon).toHaveBeenCalledOnce();
  });
});
