/**
 * Server bootstrap: registers the default adapters for HADE.
 *   • {@link VenueAdapter} → Google Places (lazy factory)
 *   • {@link LLMAdapter}   → OpenAI chat completions (wrapped via legacyOpenAIAdapter)
 *
 * Import this module once from API routes and the synthetic engine.
 */
import { registerDefaultAdapters, setDefaultVenueAdapterFactory } from "@hade/core";
import { createGooglePlacesVenueAdapter } from "./googlePlacesVenueAdapter";
import { createOpenAIChatLLMAdapter } from "./openAIChatLLMAdapter";

setDefaultVenueAdapterFactory(() => createGooglePlacesVenueAdapter());
registerDefaultAdapters({ llm: createOpenAIChatLLMAdapter() });
