export const HADE_API_BASE =
  process.env.NEXT_PUBLIC_HADE_API_BASE ||
  "https://hade-component-system.vercel.app/api";

export const HADE_ENDPOINTS = {
  decide: `${HADE_API_BASE}/hade/decide`,
  ugc: `${HADE_API_BASE}/hade/ugc`,
  signal: `${HADE_API_BASE}/hade/signal`,
};
