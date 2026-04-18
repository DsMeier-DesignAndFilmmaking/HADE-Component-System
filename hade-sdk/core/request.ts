import type { HadeDecisionRequestBody, HadeSDKConfig, RawDecisionAPIResponse } from "./types";

export async function requestDecision(
  config: Required<HadeSDKConfig>,
  body: HadeDecisionRequestBody,
): Promise<RawDecisionAPIResponse> {
  const response = await config.fetcher(`${config.apiUrl}/hade/decide`, {
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
