declare const enUS: {
    readonly "eyebrow.your_move": "Your move";
    readonly "action.take_me_there": "Take me there";
    readonly "action.refine": "Refine";
    readonly "action.show_alts": "See alternatives";
    readonly "label.strong_pick": "Strong pick";
    readonly "label.good_fit": "Good fit";
    readonly "label.exploratory": "Exploratory";
    readonly "fallback.walk_nearby": "Take a walk nearby";
    readonly "fallback.coffee_nearby": "Grab coffee nearby";
    readonly "fallback.explore_nearby": "Explore this area";
    readonly "offline.engine_unavailable": "Decision engine temporarily unavailable";
};
type EnUSKey = keyof typeof enUS;

export { type EnUSKey, enUS };
