# HADE Component System

## Redis Requirement

HADE requires Upstash Redis in production.

Without Redis:
- UGC will not persist
- Cross-user signal propagation will not work
- Network effects are disabled

The app will fail to start in production without Redis configured.

### Setup

1. Create a database at [console.upstash.com](https://console.upstash.com)
2. Copy the REST URL and token into your environment:

```
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here
```

### Environment Behavior

| Environment | Redis missing | Behavior |
|-------------|---------------|----------|
| `production` | — | **Fatal error on startup** |
| `development` / `test` | — | In-memory fallback, one-time warning logged |

### Runtime Inspection

```ts
import { HADE_PERSISTENCE_MODE } from "@/lib/hade/redis";
// "redis" | "memory"
```
