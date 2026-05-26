# @hade/adapters-openai

OpenAI Chat Completions `LLMAdapter` for HADE copy enhancement.

**Status: Phase D ships the clean-room factory.** Replicates the inline OpenAI
fetch from `src/app/api/hade/decide/route.ts:844-915` byte-for-byte (model,
temperature, max_tokens, response_format, char-cap validation).

## Install

```bash
npm install @hade/core @hade/adapters-openai
```

## Quickstart

```ts
import { createHade } from "@hade/core";
import { openai } from "@hade/adapters-openai";

const client = createHade({
  adapters: { llm: openai({ apiKey: process.env.OPENAI_API_KEY }) },
});
```

## Options

| Option | Default | Notes |
|---|---|---|
| `apiKey` | `process.env.OPENAI_API_KEY` | Required at first call |
| `model` | `"gpt-4o-mini"` | Any chat-completions model |
| `temperature` | `0.7` | Matches legacy route default |
| `maxTokens` | `260` | Matches legacy route default |
| `timeoutMs` | `1500` | Matches `COPY_ENHANCE_TIMEOUT_MS` |
| `baseUrl` | `"https://api.openai.com/v1"` | Override for proxies / Azure |
| `fetchImpl` | global `fetch` | Override for tests |
