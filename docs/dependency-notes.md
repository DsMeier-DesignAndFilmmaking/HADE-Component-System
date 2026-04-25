# Dependency Policy

## Structural rule — Reachability gate

> **We only fix dependencies that are reachable from application runtime
> or build-customization layers we own.**

A vulnerability advisory by itself does **not** constitute justification to act.
Before any `npm install`, `npm uninstall`, `overrides:` entry, version pin, or
`--force` resolution, the change must answer **yes** to at least one of:

1. **Runtime reachability** — the package's code can execute in our server,
   client, or service-worker bundle (i.e. it appears in our shipped JS, or is
   imported from a route handler / RSC / client component / `public/sw.js`).
2. **Owned build customization** — the package is invoked by config we author
   and maintain (`next.config.ts`, `postcss.config.mjs`, `tailwind.config.ts`,
   `vitest.config.ts`, `tsconfig.json`, scripts under `scripts/`).

If neither is true — i.e. the package is **internal to a framework dependency**
(Next.js, serwist, vite, tailwind) and we have no import path to it — the
correct action is **document and defer**, not patch.

### Why this rule exists

Three failure modes this prevents:

- **Workbox-internal chasing.** Force-pinning `serialize-javascript` /
  `terser-webpack-plugin` inside `next-pwa`'s tree previously broke the PWA
  build. We have since removed `next-pwa`; do not reintroduce the same class
  of fix against the new SW toolchain (`serwist`).
- **Next-internal CSS tooling chasing.** Next.js bundles its own `postcss` for
  the built-in CSS pipeline. Overriding it forces a divergence Next was never
  tested against and silently breaks the build cache.
- **Backdoor downgrades.** `npm audit fix` for a transitive will sometimes
  propose a semver-major **downgrade** of the parent (e.g. `next@9.3.3` to
  resolve a `postcss` bundled in `next@15`). Auto-applying that destroys the
  app. The rule blocks this path.

### Decision flow for any audit finding

```
audit finding appears
        │
        ▼
Is the package in our package.json deps/devDeps?
        │
   yes ─┴─ no
   │       │
   │       ▼
   │   Is it pulled in by an owned build-config layer?
   │       │
   │       yes ─┴─ no
   │       │       │
   │       │       ▼
   │       │   Is it bundled into our shipped JS or SW?
   │       │       │
   │       │       yes ─┴─ no
   │       │       │       │
   │       │       │       ▼
   │       │       │   ► document + defer (this file)
   │       │       │
   │       └───────┴──► fix per normal policy:
   │                    1. prefer minor/patch upgrade of the direct parent
   │                    2. only use `overrides:` if (1) is unavailable
   │                       AND impact is verified
   │                    3. never force a semver-major downgrade
   │
   └──► fix directly: bump the direct dependency
```

### Allowed mitigation tools, in order of preference

1. Bump the **direct parent** to a release that ships the patched transitive.
2. Wait for the upstream framework's next patch release (preferred for
   Next.js / serwist / vite / tailwind internals).
3. `overrides:` in `package.json` — only with a documented compatibility check
   and a recorded entry in this file.
4. Replacing the parent dependency entirely — only if (1)–(3) are exhausted
   and the parent is no longer maintained.

`npm audit fix --force` is **prohibited**.

### Required record for any deferred finding

For each accepted upstream risk, append to "Recorded deferrals" below:

- advisory ID + URL
- top-level package that pulls it in
- reachability classification (internal / owned-config / runtime)
- decision and revisit trigger

---

## Recorded deferrals

### Next.js bundled PostCSS vulnerability

As of Next.js 15.5.15:

- `postcss@8.4.31` is bundled at `node_modules/next/node_modules/postcss`
- flagged by npm audit (GHSA-qx2v-qp2m-jg93)
- **classification: framework-internal** — not reachable from application
  runtime, not invoked by our `postcss.config.mjs` (which uses the top-level
  `postcss@8.5.10`)
- cannot be fixed without upgrading Next.js upstream
- npm's proposed `fixAvailable` is a semver-major downgrade to `next@9.3.3` —
  rejected per "never force a semver-major downgrade"

Decision:
- accepted upstream risk per the reachability gate above
- no override, no downgrade, no force-fix applied
- revisit trigger: Next.js patch release that bumps bundled `postcss` to
  `>=8.5.10`
