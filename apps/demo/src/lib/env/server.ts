import "server-only";
import { hadeLog } from "@/lib/hade/logging";

const _rawGoogleKey = process.env.GOOGLE_API_KEY ?? "";
const PLACEHOLDER_VALUES = new Set(["your_actual_key_here", "undefined", "null", "your_google_api_key"]);
const _googleKeyValid =
  _rawGoogleKey.length >= 10 && !PLACEHOLDER_VALUES.has(_rawGoogleKey.toLowerCase());

if (!_googleKeyValid) {
  console.warn(
    "[HADE CONFIG] GOOGLE_API_KEY is missing or invalid. " +
    "Set a real key in .env.local (copy .env.example and fill in GOOGLE_API_KEY). " +
    "All decisions will use cold_start_fallback until this is fixed.",
    { keyLength: _rawGoogleKey.length, isPlaceholder: PLACEHOLDER_VALUES.has(_rawGoogleKey.toLowerCase()) },
  );
}

hadeLog("debug", "[HADE ENV CHECK]", {
  keyExists: _googleKeyValid,
  runtime: typeof window === "undefined" ? "server" : "client",
}, { debugOnly: true });

export const serverEnv = {
  hadeUpstreamUrl: process.env.HADE_UPSTREAM_URL ?? "http://localhost:8000",
  hadeApiKey: process.env.HADE_API_KEY ?? "",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  googleApiKey: _googleKeyValid ? _rawGoogleKey : "",
};
