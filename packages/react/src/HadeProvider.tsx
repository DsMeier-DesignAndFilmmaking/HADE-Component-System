"use client";

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
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactElement,
  type ReactNode,
} from "react";
import { createHade } from "@hade/core";
import type { HadeClient, HadeClientConfig } from "@hade/core";

const HadeClientContext = createContext<HadeClient | null>(null);

export interface HadeProviderProps {
  children: ReactNode;
  /** A pre-built HadeClient. When provided, `config` + `adapters` are ignored. */
  client?: HadeClient;
  /** Construct-time inputs; passed straight to `createHade()`. */
  config?: HadeClientConfig["config"];
  adapters?: HadeClientConfig["adapters"];
  clientId?: HadeClientConfig["clientId"];
}

export function HadeProvider(props: HadeProviderProps): ReactElement {
  const { children, client: providedClient, config, adapters, clientId } = props;

  const ownsClient = providedClient === undefined;

  const client = useMemo<HadeClient>(() => {
    if (providedClient) return providedClient;
    return createHade({ config, adapters, clientId });
    // We intentionally omit `config`/`adapters`/`clientId` from deps so the
    // client is stable across re-renders. To swap the client at runtime,
    // pass a new `key` to the provider OR construct outside and pass via
    // `client={...}`.
  }, [providedClient]);

  useEffect(() => {
    if (!ownsClient) return;
    return () => {
      // Best-effort cleanup. The promise is intentionally not awaited —
      // React unmount is synchronous.
      void client.close();
    };
  }, [client, ownsClient]);

  return (
    <HadeClientContext.Provider value={client}>{children}</HadeClientContext.Provider>
  );
}

/**
 * Returns the HadeClient from the nearest HadeProvider. Throws if used
 * outside a provider — fail loud rather than silently returning a fresh
 * client (which would defeat caching + adapter wiring).
 */
export function useHadeClient(): HadeClient {
  const client = useContext(HadeClientContext);
  if (!client) {
    throw new Error(
      "useHadeClient: no HadeProvider found in the tree. Wrap your app in <HadeProvider>.",
    );
  }
  return client;
}
