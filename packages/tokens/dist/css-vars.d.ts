import { ThemeTokens } from './index.js';

/** Convert a ThemeTokens tree into a list of CSS variable declarations. */
declare function themeToCSSVars(theme: ThemeTokens, prefix?: string): string[];

export { themeToCSSVars };
