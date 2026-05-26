/**
 * Pure-Node HTTP server using the standalone `decide()` helper from @hade/core.
 *
 * No React, no Next.js — proves the engine runs in any JS host. The same
 * `decide()` call works inside a Cloudflare Worker `fetch` handler or a
 * Vercel Edge function with zero changes.
 *
 * Run:
 *   node src/server.mjs
 *   curl 'http://localhost:3000/decide?lat=40.71&lng=-74.01&intent=eat'
 */
import { createServer } from "node:http";
import { decide } from "@hade/core";

const PORT = process.env.PORT ?? 3000;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname !== "/decide") {
    res.statusCode = 404;
    res.end("Not found. Try /decide?lat=40.71&lng=-74.01&intent=eat");
    return;
  }

  const lat = parseFloat(url.searchParams.get("lat") ?? "40.7128");
  const lng = parseFloat(url.searchParams.get("lng") ?? "-74.006");
  const intent = url.searchParams.get("intent") ?? "eat";

  try {
    const output = await decide({
      geo: { lat, lng },
      situation: { intent },
    });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(output, null, 2));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
});

server.listen(PORT, () => {
  console.log(`HADE example listening on http://localhost:${PORT}`);
  console.log(`Try: curl 'http://localhost:${PORT}/decide?lat=40.71&lng=-74.01&intent=eat'`);
});
