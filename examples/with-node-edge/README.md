# HADE example — Node / Edge runtime (no React)

External-consumer reference for the standalone `decide()` helper. Proves `@hade/core` runs in any JS host: Node, Cloudflare Workers, Vercel Edge, Deno Deploy.

## Setup

```bash
export GITHUB_TOKEN=ghp_…

cd examples/with-node-edge
npm install
npm start
```

```bash
curl 'http://localhost:3000/decide?lat=40.71&lng=-74.01&intent=eat' | jq
```

## Porting to Cloudflare Workers

The exact same `decide()` call works in a Worker:

```ts
// worker.ts
import { decide } from "@hade/core";

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const lat = parseFloat(url.searchParams.get("lat") ?? "40.7128");
    const lng = parseFloat(url.searchParams.get("lng") ?? "-74.006");
    const output = await decide({ geo: { lat, lng } });
    return new Response(JSON.stringify(output), {
      headers: { "content-type": "application/json" },
    });
  },
};
```

No code changes from the Node version above (aside from the runtime adapter). The engine is intentionally edge-safe — `@hade/core` audits forbid Node-only APIs at module scope.
