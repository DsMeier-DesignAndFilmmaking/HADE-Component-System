import { createContext, useMemo, useEffect, useContext, useState, useRef, useCallback } from 'react';
import { createHade } from '@hade/core';
import { jsx } from 'react/jsx-runtime';

// src/HadeProvider.tsx
var HadeClientContext = createContext(null);
function HadeProvider(props) {
  const { children, client: providedClient, config, adapters, clientId } = props;
  const ownsClient = providedClient === void 0;
  const client = useMemo(() => {
    if (providedClient) return providedClient;
    return createHade({ config, adapters, clientId });
  }, [providedClient]);
  useEffect(() => {
    if (!ownsClient) return;
    return () => {
      void client.close();
    };
  }, [client, ownsClient]);
  return /* @__PURE__ */ jsx(HadeClientContext.Provider, { value: client, children });
}
function useHadeClient() {
  const client = useContext(HadeClientContext);
  if (!client) {
    throw new Error(
      "useHadeClient: no HadeProvider found in the tree. Wrap your app in <HadeProvider>."
    );
  }
  return client;
}
function useHade(input) {
  const client = useHadeClient();
  const [output, setOutput] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestSeqRef = useRef(0);
  const abortRef = useRef(null);
  const outputRef = useRef(null);
  useEffect(() => {
    outputRef.current = output;
  }, [output]);
  const decide = useCallback(
    async (callInput, options) => {
      const mySeq = ++requestSeqRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);
      try {
        const result = await client.decide(callInput, {
          ...options,
          signal: options?.signal ?? controller.signal
        });
        if (mySeq === requestSeqRef.current) {
          setOutput(result);
          setError(null);
        }
        return result;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (mySeq === requestSeqRef.current) {
          setError(err);
        }
        throw err;
      } finally {
        if (mySeq === requestSeqRef.current) {
          setIsLoading(false);
        }
      }
    },
    [client]
  );
  const refine = useCallback(
    async (refineInput, options) => {
      const mySeq = ++requestSeqRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);
      try {
        const result = await client.refine(refineInput, outputRef.current ?? void 0, {
          ...options,
          signal: options?.signal ?? controller.signal
        });
        if (mySeq === requestSeqRef.current) {
          setOutput(result);
          setError(null);
        }
        return result;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (mySeq === requestSeqRef.current) {
          setError(err);
        }
        throw err;
      } finally {
        if (mySeq === requestSeqRef.current) {
          setIsLoading(false);
        }
      }
    },
    [client]
  );
  const reset = useCallback(() => {
    requestSeqRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    setOutput(null);
    setError(null);
    setIsLoading(false);
  }, []);
  const inputKey = input ? JSON.stringify(input) : null;
  useEffect(() => {
    if (!inputKey || !input) return;
    decide(input).catch(() => {
    });
  }, [inputKey]);
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);
  return { output, error, isLoading, decide, refine, reset };
}

// src/useHadeConfig.ts
function useHadeConfig() {
  return useHadeClient().getConfig();
}

// src/index.ts
var HADE_REACT_VERSION = "0.1.0-alpha.0";

export { HADE_REACT_VERSION, HadeProvider, useHade, useHadeClient, useHadeConfig };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map