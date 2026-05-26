import { V as VenueAdapter, P as PartialHadeAdapters, H as HadeAdapters } from '../adapters-2-CsI3Kq.js';

/**
 * Registers default adapter implementations (typically from the Next.js app).
 * Merges with any prior registration.
 */
declare function registerDefaultAdapters(adapters: PartialHadeAdapters): void;
/**
 * Registers a lazy factory for the venue adapter (avoids import cycles at module load).
 */
declare function setDefaultVenueAdapterFactory(factory: () => VenueAdapter): void;
/**
 * Resolves adapters for the current request, applying optional overrides (tests, DI).
 */
declare function resolveAdapters(override?: PartialHadeAdapters): HadeAdapters;
/**
 * Convenience accessor used by legacy `getPlacesCandidates` shims.
 */
declare function getVenueAdapter(override?: VenueAdapter): VenueAdapter;
/**
 * Test helper — clears registered defaults and factory cache.
 */
declare function resetAdapterRegistryForTests(): void;
/**
 * Builds a {@link VenueAdapter} from plain functions (tests, custom providers).
 */
declare function createVenueAdapter(impl: {
    id: string;
    searchNearby: VenueAdapter["searchNearby"];
    searchMultiQuery: VenueAdapter["searchMultiQuery"];
    searchForContext: VenueAdapter["searchForContext"];
}): VenueAdapter;

export { createVenueAdapter, getVenueAdapter, registerDefaultAdapters, resetAdapterRegistryForTests, resolveAdapters, setDefaultVenueAdapterFactory };
