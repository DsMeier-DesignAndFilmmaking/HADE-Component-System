/**
 * @hade/react smoke tests. Verifies that:
 *   - HadeProvider supplies a client to the subtree
 *   - useHadeClient throws when used outside a provider
 *   - useHade auto-runs on mount with an input
 *   - useHade returns a stable shape with output/error/isLoading
 *   - refine() inherits from the prior decision
 *   - reset() clears output + error
 *   - useHadeConfig reads the resolved config
 */
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createHade } from "@hade/core";
import {
  mockVenueAdapter,
  makeVenueCandidate,
  resetVenueCandidateCounter,
} from "@hade/testkit";

import {
  HadeProvider,
  useHade,
  useHadeClient,
  useHadeConfig,
} from "../index.js";
import type { ReactElement, ReactNode } from "react";

function wrapper(props: { children: ReactNode }): ReactElement {
  resetVenueCandidateCounter();
  const venue = mockVenueAdapter({
    batches: [
      [makeVenueCandidate({ name: "Joe's Pizza", category: "restaurant" })],
      [makeVenueCandidate({ name: "Quiet Tea House", category: "cafe" })],
    ],
    loop: true,
  });
  return (
    <HadeProvider config={{ active_domain: "dining" }} adapters={{ venue }}>
      {props.children}
    </HadeProvider>
  );
}

describe("HadeProvider + useHadeClient", () => {
  it("supplies a client to descendant hooks", () => {
    const { result } = renderHook(() => useHadeClient(), { wrapper });
    expect(result.current).toBeDefined();
    expect(typeof result.current.decide).toBe("function");
    expect(typeof result.current.refine).toBe("function");
  });

  it("throws when useHadeClient is used outside a provider", () => {
    // Console error suppression for the expected throw.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useHadeClient())).toThrow(/no HadeProvider/);
    } finally {
      spy.mockRestore();
    }
  });

  it("accepts a pre-built client and skips internal construction", () => {
    const venue = mockVenueAdapter({});
    const prebuilt = createHade({ adapters: { venue } });

    function Inner(): ReactElement {
      const c = useHadeClient();
      return <span data-testid="id">{c === prebuilt ? "same" : "different"}</span>;
    }

    render(
      <HadeProvider client={prebuilt}>
        <Inner />
      </HadeProvider>,
    );
    expect(screen.getByTestId("id").textContent).toBe("same");
  });
});

describe("useHade", () => {
  it("auto-runs on mount when input is supplied", async () => {
    const { result } = renderHook(
      () => useHade({ geo: { lat: 40.71, lng: -74.01 }, situation: { intent: "eat" } }),
      { wrapper },
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.output).toBeNull();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.output).not.toBeNull();
    expect(result.current.output?.decision.venue_name).toBe("Joe's Pizza");
  });

  it("does NOT auto-run when input is omitted (lazy mode)", async () => {
    const { result } = renderHook(() => useHade(), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.output).toBeNull();
    expect(typeof result.current.decide).toBe("function");
  });

  it("decide() commits the result to state and returns it", async () => {
    const { result } = renderHook(() => useHade(), { wrapper });

    let returned;
    await act(async () => {
      returned = await result.current.decide({
        geo: { lat: 40.71, lng: -74.01 },
        situation: { intent: "eat" },
      });
    });

    expect(returned).toBeDefined();
    expect(result.current.output).toEqual(returned);
    expect(result.current.error).toBeNull();
  });

  it("refine() inherits from the prior decision and updates state", async () => {
    const { result } = renderHook(() => useHade(), { wrapper });

    await act(async () => {
      await result.current.decide({ geo: { lat: 40.71, lng: -74.01 } });
    });
    const first = result.current.output;
    expect(first?.decision.venue_name).toBe("Joe's Pizza");

    await act(async () => {
      await result.current.refine("quieter");
    });
    const second = result.current.output;
    expect(second?.decision.venue_name).toBe("Quiet Tea House");
    expect(second).not.toBe(first);
  });

  it("reset() clears output, error, and loading", async () => {
    const { result } = renderHook(() => useHade(), { wrapper });
    await act(async () => {
      await result.current.decide({ geo: { lat: 40.71, lng: -74.01 } });
    });
    expect(result.current.output).not.toBeNull();

    act(() => {
      result.current.reset();
    });
    expect(result.current.output).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});

describe("useHadeConfig", () => {
  it("returns the resolved config from the active client", () => {
    const { result } = renderHook(() => useHadeConfig(), { wrapper });
    expect(result.current.active_domain).toBe("dining");
    expect(result.current.copy.locale).toBe("en-US");
    expect(result.current.config_hash).toMatch(/^fnv:/);
  });
});
