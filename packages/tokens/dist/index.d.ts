interface ColorToken {
    $value: string;
    $type: "color";
    $description?: string;
}
interface DimensionToken {
    $value: string;
    $type: "dimension";
    $description?: string;
}
interface ThemeTokens {
    color: {
        brand: {
            accent: ColorToken;
        };
        surface: {
            background: ColorToken;
            elevated: ColorToken;
            muted: ColorToken;
        };
        text: {
            primary: ColorToken;
            secondary: ColorToken;
            inverted: ColorToken;
        };
        signal: {
            strong: ColorToken;
            medium: ColorToken;
            weak: ColorToken;
        };
    };
    radius: {
        sm: DimensionToken;
        md: DimensionToken;
        lg: DimensionToken;
    };
    space: {
        xs: DimensionToken;
        sm: DimensionToken;
        md: DimensionToken;
        lg: DimensionToken;
    };
}
interface LayoutTokens {
    density: "comfortable" | "compact";
    surface: "hero_card" | "list_row" | "map_pin" | "compact_pill";
}
/**
 * Phase E will replace this with the real default theme extracted from
 * tailwind.config.ts. For now: a minimal placeholder.
 */
declare const defaultTheme: ThemeTokens;
declare const defaultLayout: LayoutTokens;

export { type ColorToken, type DimensionToken, type LayoutTokens, type ThemeTokens, defaultLayout, defaultTheme };
