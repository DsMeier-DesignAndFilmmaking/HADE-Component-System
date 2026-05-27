/**
 * Negative-filter ("cleanliness rule").
 *
 * Each pillar declares a `subKeywordWhitelist`. A WellnessPlace passes
 * validation for a given pillar iff its `name` (lowercased) OR any entry
 * in `tags` (lowercased) contains at least one whitelist token.
 *
 * This is the rule that filters out generic municipal parks, default
 * commercial gyms, and other category matches that lack a true wellness
 * sub-signal — preventing data pollution of the results array.
 */

import { PILLAR_CONFIG } from "./pillars";
import type { WellnessPillar, WellnessPlace } from "./types";

export function validatePlace(
  place: WellnessPlace,
  pillar: WellnessPillar,
): boolean {
  const whitelist = PILLAR_CONFIG[pillar].subKeywordWhitelist;
  const haystacks: string[] = [
    place.name.toLowerCase(),
    ...(place.tags ?? []).map((t) => t.toLowerCase()),
  ];
  return whitelist.some((token) =>
    haystacks.some((hay) => hay.includes(token)),
  );
}

export interface FilterResult {
  kept: WellnessPlace[];
  rejected: WellnessPlace[];
}

export function filterPlaces(
  places: readonly WellnessPlace[],
  pillar: WellnessPillar,
): FilterResult {
  const kept: WellnessPlace[] = [];
  const rejected: WellnessPlace[] = [];
  for (const p of places) {
    if (p.pillar !== pillar) continue;
    if (validatePlace(p, pillar)) kept.push(p);
    else rejected.push(p);
  }
  return { kept, rejected };
}
