// @hade/copy/en-US — English (US) string bundle (Phase A scaffold)
//
// Phase G populates this with the canonical mapping of every inline string
// found by the audit. For now, a minimal seed so the lookup shape is provable.

export const enUS = {
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
  "offline.engine_unavailable": "Decision engine temporarily unavailable",
} as const satisfies Record<string, string>;

export type EnUSKey = keyof typeof enUS;
