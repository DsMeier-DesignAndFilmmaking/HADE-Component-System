# HADE — example consumer apps

Each subdirectory is a **standalone npm project** (NOT a workspace member). They pin specific published versions of `@hade/*` and install from GitHub Packages, so the install path mirrors what an external consumer experiences.

| Example          | Stack                              | Demonstrates                                |
|------------------|------------------------------------|---------------------------------------------|
| [`with-next/`](./with-next)         | Next.js 15 App Router + React 19   | `<HadeProvider>`, `useHade`, Edge route handler |
| [`with-node-edge/`](./with-node-edge) | Pure Node HTTP server              | Standalone `decide()` helper, edge-runtime portability |

## Why aren't these workspace members?

Workspace symlinks hide a class of bugs: missing `exports` entries, broken CJS interop, sub-path resolution failures. By installing from the registry (Verdaccio locally, GitHub Packages in CI), every example proves the package as it will ship.

## Verify all examples

From the monorepo root:

```bash
npm run examples:verify
```

This spins up a local Verdaccio registry, publishes the workspace builds into it, runs `npm install` + `npm run build` in each `examples/*` dir, and reports any packaging regressions. CI runs the same script on every PR that touches `packages/*/dist`.

## Adding a new example

1. Create `examples/<name>/` with its own `package.json` (`"private": true`).
2. Pin `@hade/*` to a real published version (NOT `workspace:*` or `*`).
3. Add a `.npmrc` referencing GitHub Packages.
4. Add a `README.md` with setup + run instructions.
5. The verify script picks it up automatically — no other wiring needed.
