# @hade/adapters-upstash

Upstash Redis `CacheAdapter` for HADE. Internalizes the recovery-proxy semantics
from `src/lib/hade/redis.ts:63 wrapForRecovery` so degraded mode auto-clears on
the next successful call.

## Install

```bash
npm install @hade/core @hade/adapters-upstash @upstash/redis
```

## Quickstart

```ts
import { createHade } from "@hade/core";
import { upstash } from "@hade/adapters-upstash";

const client = createHade({
  adapters: {
    cache: upstash({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    }),
  },
});
```

## Options

| Option | Default | Notes |
|---|---|---|
| `url` | `process.env.UPSTASH_REDIS_REST_URL` | Required for non-degraded mode |
| `token` | `process.env.UPSTASH_REDIS_REST_TOKEN` | Required for non-degraded mode |
| `defaultTtlSeconds` | none | Applied to `set()` calls that omit TTL |
| `productionOnlyDegradation` | `true` | Matches `getRedisMode()` semantics |
