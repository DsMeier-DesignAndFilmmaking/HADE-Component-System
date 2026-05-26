import { ReactNode, ReactElement } from 'react';
import { HadeClient, HadeClientConfig, DecisionEngineOutput, DecideInput, DecideOptions, RefineInput, ResolvedHadeConfig } from '@hade/core';
export { DecideInput, DecideOptions, DecisionEngineOutput, HadeClient, HadeClientConfig, HadeConfig, RefineInput, ResolvedHadeConfig } from '@hade/core';

/**
 * HadeProvider — supplies a single HadeClient instance to descendant hooks
 * via React context. The client is constructed lazily on first render
 * (synchronous, no I/O) and cached for the lifetime of the provider.
 *
 * Two construction modes:
 *
 *   1. Pass an EXISTING client (`<HadeProvider client={c}>`) — useful when
 *      you need control over construction timing (e.g. server-side rendering
 *      with a server-built client) or want to share one client across many
 *      providers in a test harness.
 *
 *   2. Pass `config` + `adapters` and let the provider call `createHade()`
 *      itself — the common path for app code.
 *
 * On unmount the provider calls `client.close()` ONLY if it owns construction
 * (mode 2). When you pass a client in (mode 1), lifecycle is your problem.
 */

interface HadeProviderProps {
    children: ReactNode;
    /** A pre-built HadeClient. When provided, `config` + `adapters` are ignored. */
    client?: HadeClient;
    /** Construct-time inputs; passed straight to `createHade()`. */
    config?: HadeClientConfig["config"];
    adapters?: HadeClientConfig["adapters"];
    clientId?: HadeClientConfig["clientId"];
}
declare function HadeProvider(props: HadeProviderProps): ReactElement;
/**
 * Returns the HadeClient from the nearest HadeProvider. Throws if used
 * outside a provider — fail loud rather than silently returning a fresh
 * client (which would defeat caching + adapter wiring).
 */
declare function useHadeClient(): HadeClient;

interface UseHadeResult {
    /** Latest decision output, or null before the first successful call. */
    output: DecisionEngineOutput | null;
    /** Error from the most recent call, or null if the latest call succeeded. */
    error: Error | null;
    /** True while a request is in flight. */
    isLoading: boolean;
    /**
     * Issue a fresh decision. Returns the resulting output (or throws on error).
     * Cancels any in-flight call from the same hook instance.
     */
    decide: (input: DecideInput, options?: DecideOptions) => Promise<DecisionEngineOutput>;
    /**
     * Refine the prior decision. If no prior decision exists yet, behaves like
     * `decide(input as DecideInput)`.
     */
    refine: (input: RefineInput, options?: DecideOptions) => Promise<DecisionEngineOutput>;
    /** Reset output + error + loading state to their initial values. */
    reset: () => void;
}
/**
 * Hook overload signatures: input is optional. When supplied, the hook
 * auto-runs on mount and whenever the JSON-stringified input changes.
 */
declare function useHade(): UseHadeResult;
declare function useHade(input: DecideInput): UseHadeResult;

/**
 * useHadeConfig — returns the fully-resolved HadeConfig from the active
 * client. Useful for rendering settings/debug UI, deriving locale-dependent
 * strings, or asserting on `config_hash` for analytics.
 *
 * The returned config is stable across renders (the client itself caches it),
 * so use it directly in deps arrays without `useMemo`.
 */

declare function useHadeConfig(): ResolvedHadeConfig;

declare const HADE_REACT_VERSION: "0.1.0-alpha.0";

export { HADE_REACT_VERSION, HadeProvider, type HadeProviderProps, type UseHadeResult, useHade, useHadeClient, useHadeConfig };
