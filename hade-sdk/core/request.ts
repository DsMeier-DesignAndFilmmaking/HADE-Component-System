import { HADE_ENDPOINTS } from "@/lib/hade/api";
import type { HadeDecisionRequestBody, HadeSDKConfig, RawDecisionAPIResponse } from "./types";

export async function requestDecision(
  config: Required<HadeSDKConfig>,
  body: HadeDecisionRequestBody,
): Promise<RawDecisionAPIResponse> {
  if (process.env.NODE_ENV !== "production") {
    console.log("[HADE ENDPOINT]", HADE_ENDPOINTS.decide);
  }
  const response = await config.fetcher(HADE_ENDPOINTS.decide, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HADE SDK request failed with ${response.status}`);
  }

  return (await response.json()) as RawDecisionAPIResponse;
}
