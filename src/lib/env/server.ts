import "server-only";

export const serverEnv = {
  hadeUpstreamUrl: process.env.HADE_UPSTREAM_URL ?? "http://localhost:8000",
  hadeApiKey: process.env.HADE_API_KEY ?? "",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
};
