# Installation

## During the alpha/beta cycle — GitHub Packages

All `@hade/*` packages publish to GitHub Packages while the SDK stabilizes. Public npm comes at 1.0.

### Authenticate

Create a [GitHub Personal Access Token (classic)](https://github.com/settings/tokens) with the `read:packages` scope. Export it locally OR drop it in your CI environment as `GITHUB_TOKEN`.

### Configure your project's `.npmrc`

In the **root** of your consuming project (not your home directory — keep secrets project-scoped):

```ini
@hade:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

The `${GITHUB_TOKEN}` reference reads from your shell env at install time — your token never lands in git history.

### Install

```bash
# Headless engine only
npm install @hade/core

# Headless engine + React hooks
npm install @hade/core @hade/react

# Full stack (engine + UI + adapters)
npm install \
  @hade/core \
  @hade/react \
  @hade/tokens \
  @hade/adapters-google-places \
  @hade/adapters-openai
```

Test utilities live as a dev dep:

```bash
npm install -D @hade/testkit
```

## After 1.0 — public npm

Switch your `.npmrc` to the default npm registry (delete the GitHub Packages line). No token needed for install. Provenance attested via npm's [Sigstore integration](https://docs.npmjs.com/generating-provenance-statements).

```bash
npm install @hade/core @hade/react
```

## Peer dependencies

| Package                 | Required peer                | Optional peer       |
|-------------------------|------------------------------|---------------------|
| `@hade/core`            | none                         | none                |
| `@hade/react`           | `react >=18.2.0`, `react-dom >=18.2.0`, `@hade/core` | none |
| `@hade/tokens`          | none                         | none                |
| `@hade/testkit`         | `@hade/core`                 | `vitest >=1.0.0`    |
| `@hade/copy`            | none                         | none                |
| `@hade/adapters-*`      | `@hade/core` + provider SDK  | none                |

## Runtime targets

- **Node** ≥ 20 (ESM + CJS dual-exported via tsup)
- **Browsers**: ES2022 baseline (Chrome 94+, Safari 16.4+, Firefox 93+)
- **Edge runtimes**: Cloudflare Workers, Vercel Edge, Deno Deploy (verified — no Node-only APIs in `@hade/core`)

## Verifying a clean install

```bash
node --input-type=module --eval "
  const { createHade } = await import('@hade/core');
  const c = createHade();
  console.log(await c.decide({ geo: { lat: 40.71, lng: -74.01 } }));
"
```

You should see a `DecisionEngineOutput` JSON object with `is_fallback: true` (no adapters wired → the engine falls back gracefully).
