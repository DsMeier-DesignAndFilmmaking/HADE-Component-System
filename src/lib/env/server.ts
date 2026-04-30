import "server-only";

console.log("[HADE ENV CHECK]", {
  keyExists: !!process.env.GOOGLE_API_KEY,
  runtime: typeof window === "undefined" ? "server" : "client",
});

export const serverEnv = {
  hadeUpstreamUrl: process.env.HADE_UPSTREAM_URL ?? "http://localhost:8000",
  hadeApiKey: process.env.HADE_API_KEY ?? "",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  googleApiKey: process.env.GOOGLE_API_KEY ?? "",
};
