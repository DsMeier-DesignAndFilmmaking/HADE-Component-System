import { ResolvedHadeConfig } from '../config/schema.js';

type LocationNode = {
    signal_count: number;
    weight_map: Record<string, number>;
    last_updated: string;
};
declare function computeConfidence(node?: LocationNode, config?: Pick<ResolvedHadeConfig, "confidence" | "weights">): number;
/**
 * Maps a synthetic ranking score (0–1) to a confidence value (0.30–0.95).
 */
declare function syntheticConfidence(finalScore: number, config?: ResolvedHadeConfig["confidence"]["synthetic"]): number;

export { computeConfidence, syntheticConfidence };
