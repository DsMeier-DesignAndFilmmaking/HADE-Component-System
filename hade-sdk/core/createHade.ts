import { withHadeDefaults } from "./defaults";
import { toSDKResponse } from "./normalize";
import { requestDecision } from "./request";
import type {
  HadeDecisionRequestBody,
  HadeRefineInput,
  HadeSDKClient,
  HadeSDKConfig,
  HadeSDKResponse,
} from "./types";

const INITIAL_RESPONSE: HadeSDKResponse = {
  status: "loading",
  decision: null,
  reasoning: [],
  confidence: 0,
};

export function createHade(config?: HadeSDKConfig): HadeSDKClient {
  const resolved = withHadeDefaults(config);

  let currentResponse = INITIAL_RESPONSE;
  let rejectionHistory: NonNullable<HadeDecisionRequestBody["rejection_history"]> = [];

  const buildBaseRequest = async (): Promise<HadeDecisionRequestBody> => {
    const geo = await resolved.getGeo();
    const timeContext = resolved.getTimeContext();

    return {
      geo,
      time_of_day: timeContext.timeOfDay,
      day_type: timeContext.dayType,
    };
  };

  const performDecision = async (options?: {
    alternative?: boolean;
    refine?: HadeRefineInput;
  }): Promise<HadeSDKResponse> => {
    const baseRequest = await buildBaseRequest();
    const nextRejectionHistory =
      options?.alternative && currentResponse.decision
        ? [
            ...rejectionHistory,
            {
              venue_name: currentResponse.decision.title,
              pivot_reason: "user_requested_alternative" as const,
            },
          ].slice(-5)
        : rejectionHistory;

    const refineTone = options?.refine?.tone;

    const requestBody: HadeDecisionRequestBody = {
      ...baseRequest,
      ...(nextRejectionHistory.length > 0 ? { rejection_history: nextRejectionHistory } : {}),
      ...(refineTone
        ? {
            situation: {
              intent: null,
              urgency: refineTone === "faster" ? "high" : "medium",
            },
            signals: [
              {
                type: "INTENT",
                content: `refine:${refineTone}`,
                strength: 0.8,
                geo: baseRequest.geo,
              },
            ],
          }
        : {}),
    };

    const rawResponse = await requestDecision(resolved, requestBody);
    const normalized = toSDKResponse(rawResponse);

    rejectionHistory = nextRejectionHistory;
    currentResponse = normalized;

    return normalized;
  };

  return {
    async getDecision() {
      if (currentResponse.status === "ready" && currentResponse.decision) {
        return currentResponse;
      }

      return performDecision();
    },
    async regenerate() {
      return performDecision({ alternative: true });
    },
    async refine(input) {
      return performDecision({ refine: input });
    },
    async getAlternative() {
      return performDecision({ alternative: true });
    },
  };
}
