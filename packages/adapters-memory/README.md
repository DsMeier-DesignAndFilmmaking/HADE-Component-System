# @hade/adapters-memory

In-process LRU `CacheAdapter` for HADE. Dev / CI / single-instance only — not
safe across server processes. For production use `@hade/adapters-upstash` or
similar.

This package is a thin re-export of `memoryCache` from `@hade/core` — included
as a standalone package so the install set for cache-only consumers stays small
and the dependency story stays uniform with the other adapter packages.

## Quickstart

```ts
import { createHade } from "@hade/core";
import { memoryCache } from "@hade/adapters-memory";

const client = createHade({
  adapters: { cache: memoryCache({ maxEntries: 256 }) },
});
```
