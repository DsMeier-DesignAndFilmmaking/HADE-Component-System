import { HadeConfig } from './schema.js';

interface HadeConfigValidationIssue {
    readonly path: string;
    readonly message: string;
    readonly value?: unknown;
}
declare class HadeConfigValidationError extends Error {
    readonly issues: readonly HadeConfigValidationIssue[];
    constructor(issues: readonly HadeConfigValidationIssue[]);
}
declare function validateConfig(config?: HadeConfig): HadeConfigValidationIssue[];
declare function assertValidConfig(config?: HadeConfig): void;

export { HadeConfigValidationError, type HadeConfigValidationIssue, assertValidConfig, validateConfig };
