// src/adapters/geo/staticGeo.ts
function staticGeo(options) {
  const id = options.id ?? "static@1.0.0";
  const coords = options.coords;
  return {
    id,
    async resolveCoords() {
      return coords;
    }
  };
}

// src/adapters/geo/headerGeo.ts
var DEFAULT_HEADER_PAIRS = [
  ["x-vercel-ip-latitude", "x-vercel-ip-longitude"],
  ["cf-iplatitude", "cf-iplongitude"],
  ["fly-client-ip-lat", "fly-client-ip-lng"]
];
function parseCoord(raw) {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
function headerGeo(options) {
  const id = options.id ?? "header@1.0.0";
  const pairs = options.latLngHeaders ?? DEFAULT_HEADER_PAIRS;
  return {
    id,
    async resolveCoords() {
      const headers = options.getHeaders();
      if (!headers) return null;
      for (const [latName, lngName] of pairs) {
        const lat = parseCoord(headers.get(latName));
        const lng = parseCoord(headers.get(lngName));
        if (lat !== null && lng !== null) return { lat, lng };
      }
      return null;
    }
  };
}
var DEFAULT_HADE_CONFIG = {
  timeouts: {
    geo_ms: 3e3
  }};

// src/adapters/geo/ipLookupGeo.ts
function defaultParse(response) {
  if (!response || typeof response !== "object") return null;
  const obj = response;
  const lat = typeof obj.latitude === "number" ? obj.latitude : Number(obj.latitude);
  const lng = typeof obj.longitude === "number" ? obj.longitude : Number(obj.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}
function ipLookupGeo(options = {}) {
  const id = options.id ?? "ip_lookup@1.0.0";
  const endpoint = options.endpoint ?? "https://ipapi.co/json/";
  const timeoutMs = options.timeoutMs ?? DEFAULT_HADE_CONFIG.timeouts.geo_ms;
  const parse = options.parse ?? defaultParse;
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    id,
    async resolveCoords() {
      try {
        const response = await fetchImpl(endpoint, {
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (!response.ok) return null;
        const json = await response.json();
        return parse(json);
      } catch {
        return null;
      }
    }
  };
}

// src/adapters/geo/compositeGeo.ts
function compositeGeo(first, ...rest) {
  const isOptions = first !== void 0 && typeof first === "object" && !("resolveCoords" in first);
  const options = isOptions ? first : {};
  const adapters = isOptions ? rest : [first, ...rest];
  const id = options.id ?? "composite@1.0.0";
  return {
    id,
    async resolveCoords() {
      for (const adapter of adapters) {
        try {
          const coords = await adapter.resolveCoords();
          if (coords) return coords;
        } catch {
        }
      }
      return null;
    }
  };
}

export { compositeGeo, headerGeo, ipLookupGeo, staticGeo };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map