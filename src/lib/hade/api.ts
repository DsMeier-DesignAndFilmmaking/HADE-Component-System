// Same-origin relative paths. Works for dev, preview, prod, and custom domains
// without env vars. Server-to-server calls go through HADE_UPSTREAM_URL on the
// route handler, not from the browser.
const RAW_BASE = process.env.NEXT_PUBLIC_HADE_API_BASE ?? "";
const TRIMMED  = RAW_BASE.replace(/\/+$/, "");
export const HADE_API_BASE = TRIMMED || "/api";

export const HADE_ENDPOINTS = {
  decide: `${HADE_API_BASE}/hade/decide`,
  ugc:    `${HADE_API_BASE}/hade/ugc`,
  signal: `${HADE_API_BASE}/hade/signal`,
};
