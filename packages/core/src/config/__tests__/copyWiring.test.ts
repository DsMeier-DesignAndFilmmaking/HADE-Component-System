import { describe, expect, it } from "vitest";
import { loadConfig, resolveEffectiveCopy } from "../loadConfig.js";
import { createHade } from "../../createHade.js";
import { resetAdapterRegistryForTests, createVenueAdapter } from "../../adapters/registry.js";
import { staticGeo } from "../../adapters/geo/staticGeo.js";
import type { VenueCandidate } from "../../types/adapters.js";

const HART_FIXTURE: VenueCandidate = {
  id: "hart-bar",
  name: "Hart's",
  category: "wine_bar",
  vibe: "warm",
  geo: { lat: 40.6818, lng: -73.9591 },
  distance_meters: 420,
  is_open: true,
};

function mockVenue(): ReturnType<typeof createVenueAdapter> {
  return createVenueAdapter({
    id: "mock_venue",
    searchNearby: async () => [HART_FIXTURE],
    searchMultiQuery: async () => [HART_FIXTURE],
    searchForContext: async () => [HART_FIXTURE],
  });
}

describe("resolveEffectiveCopy", () => {
  it("returns an empty object when no overrides anywhere", () => {
    const cfg = loadConfig({});
    // dining (the default) ships with no copy_overrides in BUILT_IN_DOMAINS
    expect(resolveEffectiveCopy(cfg)).toEqual({});
  });

  it("surfaces ecommerce's built-in copy_overrides as the effective bundle", () => {
    const cfg = loadConfig({ active_domain: "ecommerce" });
    const effective = resolveEffectiveCopy(cfg);
    expect(effective["action.take_me_there"]).toBe("Add to cart");
    expect(effective["action.refine"]).toBe("Filter");
    expect(effective["label.strong_pick"]).toBe("Top match");
  });

  it("applies cfg.copy.overrides as the global layer", () => {
    const cfg = loadConfig({
      copy: { overrides: { "action.take_me_there": "Go!" } },
    });
    expect(resolveEffectiveCopy(cfg)).toEqual({ "action.take_me_there": "Go!" });
  });

  it("vertical copy_overrides win over global cfg.copy.overrides (precedence)", () => {
    const cfg = loadConfig({
      active_domain: "ecommerce",
      copy: { overrides: { "action.take_me_there": "GLOBAL_VALUE" } },
    });
    // domain.copy_overrides wins over global copy.overrides per the contract
    expect(resolveEffectiveCopy(cfg)["action.take_me_there"]).toBe("Add to cart");
  });

  it("a custom user vertical's copy_overrides reach the effective bundle", () => {
    const cfg = loadConfig({
      domains: {
        fitness: {
          id: "fitness",
          display_name: "Fitness",
          copy_overrides: { "action.take_me_there": "Book class" },
        },
      },
      active_domain: "fitness",
    });
    expect(resolveEffectiveCopy(cfg)["action.take_me_there"]).toBe("Book class");
  });
});

describe("createHade — output_tokens.keys reflect the effective copy bundle", () => {
  it("ecommerce vertical: output.copy_tokens.keys['action.take_me_there'] === 'Add to cart'", async () => {
    resetAdapterRegistryForTests();
    const client = createHade({
      config: { active_domain: "ecommerce" },
      adapters: {
        venue: mockVenue(),
        geo: staticGeo({ coords: { lat: 40.68, lng: -73.96 } }),
      },
    });
    const out = await client.decide({});
    expect(out.copy_tokens.keys["action.take_me_there"]).toBe("Add to cart");
    expect(out.copy_tokens.keys["action.refine"]).toBe("Filter");
  });

  it("dining vertical: default 'Take me there' CTA copy preserved", async () => {
    resetAdapterRegistryForTests();
    const client = createHade({
      adapters: {
        venue: mockVenue(),
        geo: staticGeo({ coords: { lat: 40.68, lng: -73.96 } }),
      },
    });
    const out = await client.decide({});
    // dining vertical has no overrides, so the BUILTIN_COPY_KEYS value wins
    expect(out.copy_tokens.keys["action.take_me_there"]).toBe("Take me there");
  });

  it("inline cfg.copy.overrides reaches output_tokens.keys (for the active vertical)", async () => {
    resetAdapterRegistryForTests();
    const client = createHade({
      config: { copy: { overrides: { "eyebrow.your_move": "Your call" } } },
      adapters: {
        venue: mockVenue(),
        geo: staticGeo({ coords: { lat: 40.68, lng: -73.96 } }),
      },
    });
    const out = await client.decide({});
    expect(out.copy_tokens.keys["eyebrow.your_move"]).toBe("Your call");
  });

  it("fallback path also receives the effective copy bundle", async () => {
    resetAdapterRegistryForTests();
    // No venue + no geo → fallback output path
    const client = createHade({
      config: { active_domain: "ecommerce" },
    });
    const out = await client.decide({}); // empty venues + static geo defaults → fallback
    expect(out.copy_tokens.keys["action.take_me_there"]).toBe("Add to cart");
  });
});
