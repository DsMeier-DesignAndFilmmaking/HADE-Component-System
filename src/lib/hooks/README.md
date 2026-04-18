# useToken Hook — Animate CSS Variables with Framer Motion

## Problem

Framer Motion cannot animate CSS variables directly:

```tsx
// ❌ This triggers: "value not animatable" warning
<motion.div animate={{ backgroundColor: "var(--color-border)" }} />
```

Framer Motion needs concrete hex codes to interpolate between colors smoothly.

---

## Solution

Use the `useToken` hook to resolve CSS variables into hex values at runtime:

```tsx
import { useToken } from "@/lib/hooks/useToken";
import { motion } from "framer-motion";

export function MyComponent() {
  const borderColor = useToken("--color-border");

  return (
    <motion.div
      animate={{ borderColor: borderColor || "#e5e7eb" }}
      transition={{ duration: 0.6 }}
    >
      ✅ Animates smoothly, no warning
    </motion.div>
  );
}
```

---

## API Reference

### `useToken(variableName: string): string | null`

Resolves a single CSS variable into its computed value.

```tsx
const accentColor = useToken("--color-accent-primary");
// Returns: "#316bff"
```

**When to use:**
- Single color animation
- Lazy initialization (only reads on mount)

---

### `useTokens(variableNames: string[]): Record<string, string | null>`

Batch-resolves multiple CSS variables at once.

```tsx
const tokens = useTokens([
  "--color-border",
  "--color-surface",
  "--color-accent-primary",
]);

// Returns:
// {
//   "--color-border": "#e5e7eb",
//   "--color-surface": "#ffffff",
//   "--color-accent-primary": "#316bff",
// }
```

**When to use:**
- Multiple colors needed
- Avoid calling `useToken` multiple times (watchers are expensive)

---

### `useTokenLive(variableName: string): string | null`

Watches for CSS variable changes and re-renders when they update.

```tsx
const surfaceColor = useTokenLive("--color-surface");
// Re-computes whenever the CSS variable is updated dynamically
```

**When to use:**
- Theme switching (dark mode, user preferences)
- Dynamic CSS variable updates at runtime

---

## Examples

### Basic Animation

```tsx
import { useToken } from "@/lib/hooks/useToken";
import { motion } from "framer-motion";

export function AnimatedCard() {
  const backgroundColor = useToken("--color-surface");

  return (
    <motion.div
      animate={{
        backgroundColor: backgroundColor || "#ffffff",
      }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      className="p-6 rounded-lg"
    />
  );
}
```

### Gradient Animation

```tsx
const primary = useToken("--color-accent-primary");
const secondary = useToken("--color-accent-secondary");

<motion.div
  animate={{
    background: [
      `linear-gradient(135deg, ${primary}, ${secondary})`,
      `linear-gradient(135deg, ${secondary}, ${primary})`,
    ],
  }}
  transition={{ duration: 3, repeat: Infinity }}
/>;
```

### Multiple Colors

```tsx
const tokens = useTokens([
  "--color-border",
  "--color-surface",
  "--color-text-primary",
]);

const border = tokens["--color-border"] || "#e5e7eb";
const surface = tokens["--color-surface"] || "#ffffff";
const text = tokens["--color-text-primary"] || "#1f2937";

<motion.div
  animate={{
    borderColor: border,
    backgroundColor: surface,
    color: text,
  }}
/>;
```

### With Theme Switching

```tsx
// For theme switching, use useTokenLive to track changes
const surfaceColor = useTokenLive("--color-surface");

// In your theme toggle:
document.documentElement.style.setProperty(
  "--color-surface",
  isDark ? "#1a1a1a" : "#ffffff"
);
// useTokenLive automatically re-reads the updated value
```

---

## Why This Approach

| Approach | CSS Variables? | Animatable? | Watch Changes? | Files |
| --- | --- | --- | --- | --- |
| **useToken** ✅ | Yes | Yes (hex) | No | One file |
| **useTokenLive** ✅ | Yes | Yes (hex) | Yes | One file |
| Tailwind `theme.extend` | No | Yes | N/A | tailwind.config.ts |
| Radix `useToken` | Depends | Yes (if design tokens) | Yes | @radix-ui/themes |

**useToken advantages:**
- Keeps your design system in CSS (globals.css)
- No Tailwind config changes
- Resolves at runtime — works with any CSS variable source
- Zero dependencies beyond React + Framer Motion

---

## Troubleshooting

### Q: The color is `null`

```tsx
const color = useToken("--color-border"); // null
```

**Causes:**
1. CSS variable name is wrong (check `globals.css`)
2. CSS hasn't loaded yet (shouldn't happen, but try in useEffect)
3. Variable is scoped to a smaller selector (not `:root`)

**Fix:**
```tsx
// Debug: Check computed styles directly
useEffect(() => {
  const root = document.documentElement;
  const value = getComputedStyle(root).getPropertyValue("--color-border");
  console.log("Computed value:", value);
}, []);
```

---

### Q: Animation is jerky / inconsistent

**Cause:** Token is resolved late, initial animation state is a fallback.

**Fix:** Use `initial` state to match the resolved value:

```tsx
const color = useToken("--color-border");

<motion.div
  initial={{ borderColor: color || "#e5e7eb" }} // Match animate
  animate={{ borderColor: color || "#e5e7eb" }}
  transition={{ duration: 0.6 }}
/>;
```

Or wait until resolved:

```tsx
const color = useToken("--color-border");
const isReady = color !== null;

<motion.div
  animate={isReady ? { borderColor: color } : {}}
  transition={{ duration: 0.6 }}
/>;
```

---

### Q: Multiple useToken calls are slow

**Cause:** Each hook sets up independent watchers.

**Fix:** Use `useTokens` (batch) instead:

```tsx
// ❌ Slow: Three separate hooks
const a = useToken("--color-border");
const b = useToken("--color-surface");
const c = useToken("--color-accent-primary");

// ✅ Fast: One batch call
const tokens = useTokens([
  "--color-border",
  "--color-surface",
  "--color-accent-primary",
]);
```

---

## Integration with Your Design System

Your CSS variables are defined in `src/app/globals.css`:

```css
:root {
  --color-background: #fafafa;
  --color-surface: #ffffff;
  --color-border: #e5e7eb;
  --color-accent-primary: #316bff;
  --color-accent-secondary: #f59e0b;
  --color-text-primary: #1f2937;
  --color-text-muted: #4b5563;
}
```

Use them anywhere in your animations:

```tsx
const backgroundColor = useToken("--color-background");
const accentColor = useToken("--color-accent-primary");
```

No changes needed to Tailwind or your CSS—just use the hook.

---

## Advanced: Custom Token Hook

If you need tokens beyond colors (e.g., spacing, border-radius), extend the hook:

```ts
export function useSpacingToken(variableName: string): string | null {
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const resolved = getComputedStyle(root)
      .getPropertyValue(variableName)
      .trim();
    setValue(resolved || null);
  }, [variableName]);

  return value;
}

// Usage:
const spacing = useSpacingToken("--spacing-lg"); // e.g., "1.5rem"
```
