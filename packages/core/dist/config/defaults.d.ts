import { HadeDomainConfig, HadeScoringProfile, ResolvedHadeConfig } from './schema.js';

declare const DEFAULT_CONFIG_HASH: "sha256:unconfigured";
/**
 * Built-in scoring profiles. `balanced` matches Phase C's `DEFAULT_OPPORTUNITY_SCORING_WEIGHTS`.
 * Consumers can add custom profiles via `config.scoring.profiles.my_profile = {...}`.
 * Every profile is validated to sum to 1.0 ± 0.01 by validateConfig.
 */
declare const BUILT_IN_SCORING_PROFILES: Readonly<Record<string, HadeScoringProfile>>;
/**
 * Built-in vertical configurations. Mirrors `DOMAIN_RADIUS_M` + `DOMAIN_CATEGORY_BUCKETS`
 * from `src/core/services/places.ts:281-293` for the three legacy verticals,
 * plus a new `ecommerce` example proving the open-vertical contract.
 *
 * Consumers can add ANY vertical via `config.domains.my_vertical = {...}` —
 * the schema is keyed by arbitrary string id.
 */
declare const BUILT_IN_DOMAINS: Readonly<Record<string, Required<HadeDomainConfig>>>;
declare const DEFAULT_HADE_CONFIG: ResolvedHadeConfig;

export { BUILT_IN_DOMAINS, BUILT_IN_SCORING_PROFILES, DEFAULT_CONFIG_HASH, DEFAULT_HADE_CONFIG };
