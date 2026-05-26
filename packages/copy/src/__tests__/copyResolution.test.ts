import { describe, expect, it } from "vitest";
import { getCopy, resolveCopyBundle, defineCopy } from "../index.js";

describe("getCopy with optional overrides", () => {
  it("returns the bundle value for a known slot", () => {
    expect(getCopy("action.take_me_there")).toBe("Take me there");
  });

  it("returns [slot] sentinel when neither overrides nor bundle has the value", () => {
    expect(getCopy("nonexistent.slot")).toBe("[nonexistent.slot]");
  });

  it("overrides win over the bundle", () => {
    expect(getCopy("action.take_me_there", "en-US", { "action.take_me_there": "Go" })).toBe("Go");
  });

  it("overrides can fill a slot the bundle is missing", () => {
    expect(getCopy("custom.slot", "en-US", { "custom.slot": "Hello" })).toBe("Hello");
  });

  it("undefined overrides falls through to the bundle (not the sentinel)", () => {
    expect(getCopy("action.take_me_there", "en-US", undefined)).toBe("Take me there");
  });

  it("empty overrides map falls through to the bundle", () => {
    expect(getCopy("action.take_me_there", "en-US", {})).toBe("Take me there");
  });
});

describe("resolveCopyBundle", () => {
  it("returns the locale bundle when no overrides are layered", () => {
    const bundle = resolveCopyBundle("en-US");
    expect(bundle["action.take_me_there"]).toBe("Take me there");
    expect(bundle["label.strong_pick"]).toBe("Strong pick");
  });

  it("layers a single override map on top of the bundle", () => {
    const bundle = resolveCopyBundle("en-US", { "action.refine": "Adjust" });
    expect(bundle["action.refine"]).toBe("Adjust");
    expect(bundle["action.take_me_there"]).toBe("Take me there"); // bundle survives
  });

  it("later layers win over earlier ones (precedence chain)", () => {
    const bundle = resolveCopyBundle(
      "en-US",
      { "action.take_me_there": "Global" },
      { "action.take_me_there": "Vertical" },
    );
    expect(bundle["action.take_me_there"]).toBe("Vertical");
  });

  it("skips undefined layers gracefully", () => {
    const bundle = resolveCopyBundle(
      "en-US",
      undefined,
      { "action.refine": "Adjust" },
      undefined,
    );
    expect(bundle["action.refine"]).toBe("Adjust");
  });

  it("returns a new object — never mutates the source bundle", () => {
    const before = resolveCopyBundle("en-US")["action.take_me_there"];
    resolveCopyBundle("en-US", { "action.take_me_there": "MUTATED" });
    expect(resolveCopyBundle("en-US")["action.take_me_there"]).toBe(before);
  });
});

describe("defineCopy", () => {
  it("preserves identity at runtime (pass-through helper)", () => {
    const table = { "action.take_me_there": "Click" };
    expect(defineCopy(table)).toBe(table);
  });
});
