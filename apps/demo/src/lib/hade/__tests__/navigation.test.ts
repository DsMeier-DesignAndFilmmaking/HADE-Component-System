import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getNavigationUrl } from "../navigation";

const ORIGINAL_USER_AGENT = navigator.userAgent;

function setUserAgent(userAgent: string) {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: userAgent,
  });
}

describe("getNavigationUrl", () => {
  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    setUserAgent(ORIGINAL_USER_AGENT);
    vi.restoreAllMocks();
  });

  it("returns an Apple Maps HTTPS URL on iOS", () => {
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    );

    const url = getNavigationUrl(39.7392, -104.9903, "Union Station");

    expect(url).toBe("https://maps.apple.com/?q=Union%20Station&ll=39.7392,-104.9903");
  });

  it("encodes labels in Apple Maps URLs", () => {
    setUserAgent(
      "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    );

    const url = getNavigationUrl(40.7128, -74.006, "Joe's Pizza & Bar");

    expect(url).toBe("https://maps.apple.com/?q=Joe's%20Pizza%20%26%20Bar&ll=40.7128,-74.006");
  });

  it("returns a Google Maps HTTPS URL on Android", () => {
    setUserAgent(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36",
    );

    const url = getNavigationUrl(34.0522, -118.2437, "Grand Central Market");

    expect(url).toBe("https://www.google.com/maps/search/?api=1&query=34.0522,-118.2437");
  });

  it("returns a Google Maps HTTPS URL on desktop browsers", () => {
    setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    );

    const url = getNavigationUrl(51.5074, -0.1278, "London");

    expect(url).toBe("https://www.google.com/maps/search/?api=1&query=51.5074,-0.1278");
  });

  it("logs the generated navigation URL for lightweight debugging", () => {
    const url = getNavigationUrl(39.7392, -104.9903, "Union Station");

    expect(console.debug).toHaveBeenCalledWith("[HADE NAV URL]", url);
  });
});
