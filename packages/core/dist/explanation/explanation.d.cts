type LocationNode = {
    signal_count: number;
    weight_map: Record<string, number>;
    last_updated: string;
};
declare function buildExplanation(node?: LocationNode): string[];

export { buildExplanation };
