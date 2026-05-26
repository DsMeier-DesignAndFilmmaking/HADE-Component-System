'use strict';

var react = require('react');
var core = require('@hade/core');
var jsxRuntime = require('react/jsx-runtime');

// src/HadeProvider.tsx
var HadeClientContext = react.createContext(null);
function HadeProvider(props) {
  const { children, client: providedClient, config, adapters, clientId } = props;
  const ownsClient = providedClient === void 0;
  const client = react.useMemo(() => {
    if (providedClient) return providedClient;
    return core.createHade({ config, adapters, clientId });
  }, [providedClient]);
  react.useEffect(() => {
    if (!ownsClient) return;
    return () => {
      void client.close();
    };
  }, [client, ownsClient]);
  return /* @__PURE__ */ jsxRuntime.jsx(HadeClientContext.Provider, { value: client, children });
}
function useHadeClient() {
  const client = react.useContext(HadeClientContext);
  if (!client) {
    throw new Error(
      "useHadeClient: no HadeProvider found in the tree. Wrap your app in <HadeProvider>."
    );
  }
  return client;
}
function useHade(input) {
  const client = useHadeClient();
  const [output, setOutput] = react.useState(null);
  const [error, setError] = react.useState(null);
  const [isLoading, setIsLoading] = react.useState(false);
  const requestSeqRef = react.useRef(0);
  const abortRef = react.useRef(null);
  const outputRef = react.useRef(null);
  react.useEffect(() => {
    outputRef.current = output;
  }, [output]);
  const decide = react.useCallback(
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
  const refine = react.useCallback(
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
  const reset = react.useCallback(() => {
    requestSeqRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    setOutput(null);
    setError(null);
    setIsLoading(false);
  }, []);
  const inputKey = input ? JSON.stringify(input) : null;
  react.useEffect(() => {
    if (!inputKey || !input) return;
    decide(input).catch(() => {
    });
  }, [inputKey]);
  react.useEffect(() => {
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
var HADE_REACT_VERSION = "0.1.0";

exports.HADE_REACT_VERSION = HADE_REACT_VERSION;
exports.HadeProvider = HadeProvider;
exports.useHade = useHade;
exports.useHadeClient = useHadeClient;
exports.useHadeConfig = useHadeConfig;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map