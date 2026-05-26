'use strict';

// src/en-US.ts
var enUS = {
  "eyebrow.your_move": "Your move",
  "action.take_me_there": "Take me there",
  "action.refine": "Refine",
  "action.show_alts": "See alternatives",
  "label.strong_pick": "Strong pick",
  "label.good_fit": "Good fit",
  "label.exploratory": "Exploratory",
  "fallback.walk_nearby": "Take a walk nearby",
  "fallback.coffee_nearby": "Grab coffee nearby",
  "fallback.explore_nearby": "Explore this area",
  "offline.engine_unavailable": "Decision engine temporarily unavailable"
};

// src/index.ts
var BUNDLES = {
  "en-US": enUS
};
function getCopy(slot, locale = "en-US", overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, slot)) {
    return overrides[slot];
  }
  const bundle = BUNDLES[locale] ?? BUNDLES["en-US"];
  return bundle[slot] ?? `[${slot}]`;
}
function resolveCopyBundle(locale = "en-US", ...overrideLayers) {
  const bundle = BUNDLES[locale] ?? BUNDLES["en-US"];
  const merged = { ...bundle };
  for (const layer of overrideLayers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      merged[key] = value;
    }
  }
  return merged;
}
function defineCopy(table) {
  return table;
}

exports.defineCopy = defineCopy;
exports.enUS = enUS;
exports.getCopy = getCopy;
exports.resolveCopyBundle = resolveCopyBundle;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map