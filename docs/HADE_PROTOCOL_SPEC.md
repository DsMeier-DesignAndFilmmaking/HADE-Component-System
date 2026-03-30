# HADE Protocol Specification v1.0

**Strict I/O Contract & Validation Protocol**
**Date:** 2026-03-30
**Status:** Canonical
**Scope:** Notion (L2 Intelligence) -> GitHub Sync -> React/FastAPI (L3 Presentation)

---

## Table of Contents

1. [Pipeline Architecture](#1-pipeline-architecture)
2. [Notion Schema Contract](#2-notion-schema-contract)
3. [JSON Schema: agent_definitions.json](#3-json-schema-agent_definitionsjson)
4. [TypeScript Interface: AgentPersona](#4-typescript-interface-agentpersona)
5. [Validation Layer](#5-validation-layer)
6. [Failure Modes & Fallback Protocol](#6-failure-modes--fallback-protocol)
7. [Hardware Context: Ollama Integration](#7-hardware-context-ollama-integration)
8. [Integration Roadmap](#8-integration-roadmap)
9. [Audit Findings](#9-audit-findings)

---

## 1. Pipeline Architecture

```
                    MOBILE / DESKTOP EDITOR
                            |
                            v
                  +-------------------+
                  |   Notion Database  |  <-- L2 Intelligence
                  | "Strategic Command |      (Agent Personas + Guardrails)
                  |      Center"       |
                  +-------------------+
                            |
                   GitHub Action (hourly / on push / manual)
                   scripts/sync-notion.js
                            |
                   +-- VALIDATION GATE --+  <-- Rejects malformed rows BEFORE write
                            |
                            v
                  +-------------------+
                  | agent_definitions  |  <-- src/config/agent_definitions.json
                  |       .json        |      (Committed to repo)
                  +-------------------+
                       /          \
                      v            v
            +------------+    +------------+
            |  prompt.ts  |   |  brain.py  |  <-- L3 Presentation
            | (Frontend)  |   | (Backend)  |      System prompt injection
            +------------+    +------------+
                      \            /
                       v          v
                  +-------------------+
                  |    LLM Provider    |  <-- Claude / GPT / Gemini / Ollama
                  +-------------------+
```

**Current state:** `agent_definitions.json` exists but is orphaned. Neither `prompt.ts` nor `brain.py` reads from it. Both have hardcoded system prompts. This spec defines the contract for wiring them together.

---

## 2. Notion Schema Contract

### 2.1 Required Columns

| Column Name      | Notion Type    | Required | Description                                     |
|------------------|----------------|----------|-------------------------------------------------|
| `Name`           | Title          | YES      | Unique agent identifier                         |
| `Role`           | Rich Text      | YES      | One-sentence agent role description              |
| `Tone`           | Multi Select   | YES      | 1-3 tone tags from the allowed enum             |
| `Guardrails`     | Rich Text      | YES      | Behavioral constraints (pipe-delimited rules)    |
| `Model_Target`   | Select         | NO       | LLM provider/model identifier for this agent    |
| `Status`         | Select         | YES      | Agent lifecycle status                           |

### 2.2 Column Specifications

#### Name (Title) - REQUIRED

The unique identifier for this agent persona.

**Regex:** `^[A-Z][A-Za-z0-9_]{2,39}$`

**Rules:**
- Starts with an uppercase letter
- 3-40 characters total
- Only alphanumeric characters and underscores
- No spaces, hyphens, or special characters
- Must be unique across all rows

**Valid examples:**
- `HADE_Core_Brain`
- `Nightlife_Agent`
- `Wellness_Scout`
- `Budget_Optimizer`

**Invalid examples:**
- `hade core brain` (spaces, lowercase start)
- `H` (too short)
- `my-agent` (hyphens, lowercase start)
- `123_Agent` (starts with number)

**Mobile input risk:** Autocorrect may lowercase the first letter or insert spaces. The validation layer normalizes trailing whitespace but rejects structural violations.

---

#### Role (Rich Text) - REQUIRED

A single-sentence description of what this agent does.

**Constraints:**
- Minimum 10 characters, maximum 200 characters
- Must be a non-empty string after trimming whitespace
- No newlines (single sentence only)

**Valid examples:**
- `Primary decision engine for HADE L2 Intelligence.`
- `Specializes in late-night venue selection for solo travelers.`

**Invalid examples:**
- `Agent` (too short, under 10 chars)
- `` (empty)
- Multi-paragraph text (newlines)

---

#### Tone (Multi Select) - REQUIRED

Tags that define the agent's communication style. These map to LLM prompt modifiers.

**Allowed enum values (case-sensitive in Notion, normalized on sync):**

| Value          | Prompt Effect                                        |
|----------------|------------------------------------------------------|
| `Concise`      | Short sentences. No filler. Under 2 sentences.       |
| `Technical`    | Precise vocabulary. Data-referenced rationale.       |
| `Editorial`    | Opinionated. Takes a stance. No hedging.             |
| `Warm`         | Friendly second-person. Approachable.                |
| `Minimalist`   | Absolute minimum words. Telegram-style.              |
| `Adventurous`  | Pushes toward discovery. Favors the unexpected.      |
| `Grounded`     | References real constraints. No hallucinated vibes.  |

**Rules:**
- Minimum 1 tag, maximum 3 tags
- Must be from the allowed enum (case-insensitive match, normalized to Title Case)
- Unknown tags are stripped with a warning, not rejected (graceful degradation)
- If all tags are stripped, the row is rejected

**Mobile input risk:** Notion mobile may create new tags with typos (e.g., "Concicse"). The sync validates each tag against the enum and strips unknowns.

---

#### Guardrails (Rich Text) - REQUIRED

Behavioral constraints that are injected into the system prompt as explicit rules.

**Format:** Pipe-delimited rules (`|` separator) or single rule.

**Constraints:**
- Minimum 10 characters total (after trim)
- Maximum 500 characters total
- Each rule (split by `|`) must be at least 5 characters
- No empty rules between pipes

**Valid examples:**
- `If location signal < 10% accuracy, fallback to last known City Pack.`
- `Never suggest venues rated below 3.5 stars.|Always mention walking distance.|Reject chains.`

**Invalid examples:**
- `` (empty)
- `Rule` (under 10 chars)
- `Rule one||Rule three` (empty rule between pipes)

**Parsing:** The sync script splits on `|`, trims each rule, and stores as a string array in JSON.

---

#### Model_Target (Select) - OPTIONAL

Which LLM provider and model this agent should use.

**Allowed enum values:**

| Value                 | Provider   | Model                     | Context  |
|-----------------------|-----------|---------------------------|----------|
| `claude-sonnet`       | Anthropic | claude-sonnet-4-20250514  | Cloud    |
| `claude-haiku`        | Anthropic | claude-3-5-haiku-20241022 | Cloud    |
| `gpt-4o`              | OpenAI    | gpt-4o                    | Cloud    |
| `gpt-4o-mini`         | OpenAI    | gpt-4o-mini               | Cloud    |
| `gemini-flash`        | Google    | gemini-1.5-flash          | Cloud    |
| `ollama-mistral`      | Ollama    | mistral:7b                | Local    |
| `ollama-llama3`       | Ollama    | llama3:8b                 | Local    |
| `ollama-phi3`         | Ollama    | phi3:mini                 | Local    |

**Default:** If empty or missing, inherits from `HADE_LLM_PROVIDER` environment variable.

**Hardware note:** `ollama-*` targets are for the 2013 iMac local deployment. See [Section 7](#7-hardware-context-ollama-integration).

---

#### Status (Select) - REQUIRED

Agent lifecycle status. Only `Active` agents are included in the sync output.

**Allowed enum values:**

| Value       | Behavior                                        |
|-------------|------------------------------------------------|
| `Active`    | Included in agent_definitions.json              |
| `Draft`     | Excluded from sync. Visible only in Notion.     |
| `Archived`  | Excluded from sync. Retained for audit trail.   |
| `Disabled`  | Excluded from sync. Temporarily deactivated.    |

**Default:** `Draft` (new rows are excluded until explicitly activated)

---

## 3. JSON Schema: agent_definitions.json

### 3.1 Formal Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "HADE Agent Definitions",
  "description": "Agent personas synced from the Notion Strategic Command Center",
  "type": "object",
  "required": ["version", "synced_at", "agents"],
  "properties": {
    "version": {
      "type": "string",
      "const": "1.0",
      "description": "Schema version for forward compatibility"
    },
    "synced_at": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp of when this sync completed"
    },
    "source_database_id": {
      "type": "string",
      "description": "Notion database ID (for audit trail, not the secret)"
    },
    "agents": {
      "type": "array",
      "minItems": 0,
      "items": {
        "$ref": "#/$defs/AgentPersona"
      }
    },
    "validation_warnings": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Non-fatal warnings from validation (e.g., stripped tone tags)"
    }
  },
  "$defs": {
    "AgentPersona": {
      "type": "object",
      "required": ["id", "role", "tone", "guardrails", "last_updated"],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^[A-Z][A-Za-z0-9_]{2,39}$",
          "description": "Unique agent identifier from Notion Name column"
        },
        "role": {
          "type": "string",
          "minLength": 10,
          "maxLength": 200,
          "description": "One-sentence agent role description"
        },
        "tone": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": ["Concise", "Technical", "Editorial", "Warm", "Minimalist", "Adventurous", "Grounded"]
          },
          "minItems": 1,
          "maxItems": 3,
          "description": "Tone tags that modify system prompt behavior"
        },
        "guardrails": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 5
          },
          "minItems": 1,
          "description": "Behavioral constraints, parsed from pipe-delimited Notion field"
        },
        "model_target": {
          "type": "string",
          "enum": [
            "claude-sonnet", "claude-haiku",
            "gpt-4o", "gpt-4o-mini",
            "gemini-flash",
            "ollama-mistral", "ollama-llama3", "ollama-phi3"
          ],
          "description": "LLM provider/model target. Null inherits from env."
        },
        "last_updated": {
          "type": "string",
          "format": "date-time",
          "description": "ISO 8601 timestamp from Notion last_edited_time"
        }
      },
      "additionalProperties": false
    }
  }
}
```

### 3.2 Example Output

```json
{
  "version": "1.0",
  "synced_at": "2026-03-30T19:15:00.000Z",
  "source_database_id": "abc123...",
  "agents": [
    {
      "id": "HADE_Core_Brain",
      "role": "Primary decision engine for HADE L2 Intelligence.",
      "tone": ["Technical", "Concise"],
      "guardrails": [
        "If location signal < 10% accuracy, fallback to last known City Pack."
      ],
      "model_target": "claude-sonnet",
      "last_updated": "2026-03-30T19:12:00.000Z"
    },
    {
      "id": "Nightlife_Agent",
      "role": "Specializes in late-night venue curation for high-energy solo or group contexts.",
      "tone": ["Editorial", "Adventurous"],
      "guardrails": [
        "Never suggest venues closing within 60 minutes",
        "Reject venues rated below 3.5 stars",
        "Always include walking distance in rationale"
      ],
      "model_target": "ollama-mistral",
      "last_updated": "2026-03-30T18:00:00.000Z"
    }
  ],
  "validation_warnings": []
}
```

---

## 4. TypeScript Interface: AgentPersona

Add to `src/types/hade.ts`:

```typescript
// ─── Agent Persona (synced from Notion L2) ──────────────────────────────────

/**
 * Valid tone modifiers for agent personas.
 * Each tag maps to a system prompt behavioral modifier.
 * Sourced from the Notion "Tone" multi_select column.
 */
export type AgentTone =
  | "Concise"
  | "Technical"
  | "Editorial"
  | "Warm"
  | "Minimalist"
  | "Adventurous"
  | "Grounded";

/**
 * Valid LLM model targets. Null means inherit from HADE_LLM_PROVIDER env var.
 * ollama-* targets are for local deployment on the 2013 iMac.
 */
export type ModelTarget =
  | "claude-sonnet"
  | "claude-haiku"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gemini-flash"
  | "ollama-mistral"
  | "ollama-llama3"
  | "ollama-phi3";

/**
 * An agent persona synced from the Notion Strategic Command Center.
 * This defines WHO the LLM is when making decisions — its identity,
 * constraints, and communication style.
 *
 * The sync pipeline (scripts/sync-notion.js) validates every field
 * before writing to src/config/agent_definitions.json.
 */
export interface AgentPersona {
  /** Unique identifier. Regex: ^[A-Z][A-Za-z0-9_]{2,39}$ */
  id: string;

  /** One-sentence role description. 10-200 characters. */
  role: string;

  /** 1-3 tone tags from the AgentTone enum. */
  tone: AgentTone[];

  /** Behavioral constraints. Array of rule strings (parsed from pipe-delimited Notion field). */
  guardrails: string[];

  /** LLM target. Null = inherit from env. */
  model_target?: ModelTarget | null;

  /** ISO 8601 timestamp of last Notion edit. */
  last_updated: string;
}

/**
 * The root structure of agent_definitions.json.
 */
export interface AgentDefinitions {
  version: string;
  synced_at: string;
  source_database_id: string;
  agents: AgentPersona[];
  validation_warnings: string[];
}
```

---

## 5. Validation Layer

### 5.1 Design Principle

> **Assume every Notion edit is made on a phone, one-handed, while walking. Validate accordingly.**

The validation layer runs inside `scripts/sync-notion.js` BEFORE any data is written to `agent_definitions.json`. Invalid rows are **rejected** (excluded from output), not fixed. The sync script logs warnings but does not fail the entire pipeline for a single bad row — this ensures that a typo on one agent doesn't block all other agents from syncing.

### 5.2 Validation Rules (Per Row)

```
RULE                           CHECK                                    ACTION ON FAIL
────────────────────────────── ──────────────────────────────────────── ─────────────────
V1: Name exists                Title field is non-empty after trim      REJECT row
V2: Name format                Matches ^[A-Z][A-Za-z0-9_]{2,39}$       REJECT row
V3: Name unique                No duplicate IDs in the batch            REJECT duplicate
V4: Role exists                Rich text is non-empty after trim        REJECT row
V5: Role length                10-200 characters after trim             REJECT row
V6: Tone exists                Multi-select has >= 1 tag                REJECT row
V7: Tone valid                 Each tag in allowed enum (case-insensitive) STRIP invalid tag + WARN
V8: Tone not empty after strip At least 1 valid tag remains             REJECT row
V9: Tone count                 <= 3 tags after stripping                STRIP excess + WARN
V10: Guardrails exists         Rich text is non-empty after trim        REJECT row
V11: Guardrails length         10-500 characters total                  REJECT row
V12: Guardrails parse          Split by | — no empty rules              STRIP empty + WARN
V13: Guardrails rule length    Each rule >= 5 characters                STRIP short + WARN
V14: Model_Target valid        In allowed enum or empty                 DEFAULT to null + WARN
V15: Status filter             Only Status === "Active" rows pass       SKIP row (silent)
```

### 5.3 Normalization Rules (Applied Before Validation)

```
N1: Trim all string fields (leading/trailing whitespace)
N2: Normalize Tone tags to Title Case ("concise" -> "Concise", "EDITORIAL" -> "Editorial")
N3: Normalize Model_Target to lowercase ("Claude-Sonnet" -> "claude-sonnet")
N4: Collapse multiple spaces in Role and Guardrails to single space
N5: Strip trailing pipe characters from Guardrails ("rule one|rule two|" -> "rule one|rule two")
```

### 5.4 Batch-Level Validation

After all rows are processed:

```
B1: At least 1 valid agent must remain after row-level validation.
    If 0 agents pass: EXIT with error code 1. Do NOT write an empty file.
    This prevents a mass-typo from nuking the entire agent config.

B2: No duplicate IDs across valid agents.
    If duplicates exist: keep the most recently updated, WARN about discarded.

B3: Write validation_warnings array to the output JSON.
    Every WARN action above is logged here for observability.
```

### 5.5 Validation Implementation

The following function should be added to `scripts/sync-notion.js`:

```javascript
const VALID_TONES = ['Concise', 'Technical', 'Editorial', 'Warm', 'Minimalist', 'Adventurous', 'Grounded'];
const VALID_MODELS = ['claude-sonnet', 'claude-haiku', 'gpt-4o', 'gpt-4o-mini', 'gemini-flash', 'ollama-mistral', 'ollama-llama3', 'ollama-phi3'];
const NAME_REGEX = /^[A-Z][A-Za-z0-9_]{2,39}$/;

function toTitleCase(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function validateAgent(raw, warnings) {
  // --- Normalize ---
  const name = (raw.id || '').trim().replace(/\s+/g, '_');
  const role = (raw.role || '').trim().replace(/\s{2,}/g, ' ');
  const rawGuardrails = (raw.guardrails || '').trim().replace(/\|+$/, '');
  const modelTarget = (raw.model_target || '').trim().toLowerCase() || null;

  // --- V1-V2: Name ---
  if (!name) return null;
  if (!NAME_REGEX.test(name)) {
    warnings.push(`REJECTED "${name}": Name fails regex ^[A-Z][A-Za-z0-9_]{2,39}$`);
    return null;
  }

  // --- V4-V5: Role ---
  if (!role || role.length < 10) {
    warnings.push(`REJECTED "${name}": Role too short (${role.length} chars, min 10)`);
    return null;
  }
  if (role.length > 200) {
    warnings.push(`REJECTED "${name}": Role too long (${role.length} chars, max 200)`);
    return null;
  }

  // --- V6-V9: Tone ---
  const rawTones = (raw.tone || []).map(t => toTitleCase(t.trim()));
  const validTones = rawTones.filter(t => VALID_TONES.includes(t));
  const invalidTones = rawTones.filter(t => !VALID_TONES.includes(t));
  if (invalidTones.length > 0) {
    warnings.push(`WARN "${name}": Stripped invalid tone tags: ${invalidTones.join(', ')}`);
  }
  if (validTones.length === 0) {
    warnings.push(`REJECTED "${name}": No valid tone tags remain after filtering`);
    return null;
  }
  const finalTones = validTones.slice(0, 3);
  if (validTones.length > 3) {
    warnings.push(`WARN "${name}": Trimmed tone tags from ${validTones.length} to 3`);
  }

  // --- V10-V13: Guardrails ---
  if (!rawGuardrails || rawGuardrails.length < 10) {
    warnings.push(`REJECTED "${name}": Guardrails too short (${rawGuardrails.length} chars, min 10)`);
    return null;
  }
  if (rawGuardrails.length > 500) {
    warnings.push(`REJECTED "${name}": Guardrails too long (${rawGuardrails.length} chars, max 500)`);
    return null;
  }
  const rules = rawGuardrails.split('|').map(r => r.trim()).filter(r => r.length >= 5);
  if (rules.length === 0) {
    warnings.push(`REJECTED "${name}": No valid guardrail rules after parsing`);
    return null;
  }

  // --- V14: Model_Target ---
  let finalModel = null;
  if (modelTarget) {
    if (VALID_MODELS.includes(modelTarget)) {
      finalModel = modelTarget;
    } else {
      warnings.push(`WARN "${name}": Unknown model_target "${modelTarget}", defaulting to null`);
    }
  }

  return {
    id: name,
    role: role,
    tone: finalTones,
    guardrails: rules,
    model_target: finalModel,
    last_updated: raw.last_updated
  };
}
```

---

## 6. Failure Modes & Fallback Protocol

### 6.1 Sync Pipeline Failures

| Failure                                 | Symptom                              | Response                                                        |
|----------------------------------------|--------------------------------------|-----------------------------------------------------------------|
| Notion API unreachable                  | `sync-notion.js` throws network err  | Exit code 1. Do NOT overwrite existing `agent_definitions.json`. GitHub Action fails. Vercel deploy hook is NOT triggered. Previous config persists. |
| Notion token expired/invalid           | 401 from Notion API                   | Exit code 1. Same as above. Log `NOTION_TOKEN may be expired`. |
| Database ID wrong                      | 404 from Notion API                   | Exit code 1. Log `NOTION_DATABASE_ID not found`.               |
| All rows fail validation               | 0 valid agents after validation       | Exit code 1. Do NOT write empty file. Log `FATAL: 0 agents passed validation`. |
| Some rows fail validation              | N < total valid agents                | Write the valid agents. Log warnings. Continue to deploy.       |
| File write permission denied           | EACCES on `src/config/`              | Exit code 1. Log path and permissions error.                    |

**Key principle:** The sync script should never produce an empty or structurally invalid `agent_definitions.json`. If it can't produce valid output, it fails loudly and the previous file persists.

### 6.2 Frontend Failures (React / prompt.ts)

| Failure                                 | Detection                             | Fallback                                                        |
|----------------------------------------|---------------------------------------|-----------------------------------------------------------------|
| `agent_definitions.json` missing       | Import throws / file not found        | Use hardcoded `FALLBACK_PERSONA` constant (see below).          |
| `agent_definitions.json` empty array   | `agents.length === 0`                 | Use `FALLBACK_PERSONA`.                                         |
| Requested agent ID not found           | `.find(a => a.id === id)` returns undefined | Use first agent in array, or `FALLBACK_PERSONA` if empty.  |
| `tone` array empty (should not happen) | `agent.tone.length === 0`             | Default to `["Editorial", "Concise"]`.                          |
| `guardrails` array empty               | `agent.guardrails.length === 0`       | Default to `["Follow all standard HADE decision rules."]`.      |
| `model_target` is null                 | `agent.model_target === null`         | Inherit from `HADE_LLM_PROVIDER` env var. Expected behavior.    |

### 6.3 Fallback Persona

This constant should be defined in `src/lib/hade/prompt.ts`:

```typescript
export const FALLBACK_PERSONA: AgentPersona = {
  id: "HADE_Fallback",
  role: "Default HADE decision engine. Active when no synced agents are available.",
  tone: ["Editorial", "Concise"],
  guardrails: ["Follow all standard HADE decision rules."],
  model_target: null,
  last_updated: "1970-01-01T00:00:00.000Z",
};
```

### 6.4 Backend Failures (FastAPI / brain.py)

| Failure                                 | Detection                             | Fallback                                                        |
|----------------------------------------|---------------------------------------|-----------------------------------------------------------------|
| `agent_definitions.json` not readable  | `FileNotFoundError` on load           | Use `HADE_SYSTEM_PROMPT` constant (current behavior).           |
| Agent persona has invalid `model_target` | Not in supported providers           | Fall back to `HADE_LLM_PROVIDER` env var.                       |
| Ollama target but Ollama not running   | Connection refused to localhost:11434 | Fall back to cloud provider (`HADE_LLM_PROVIDER`). Log warning. |
| LLM returns malformed JSON            | `json.loads` raises                    | Use `_fallback_decision()` (current behavior).                  |

---

## 7. Hardware Context: Ollama Integration

### 7.1 Target Hardware

- **Machine:** 2013 iMac (Late 2013, 27-inch)
- **CPU:** Intel Core i5-4570 (4 cores, 3.2 GHz)
- **RAM:** 8-32 GB (depending on upgrade)
- **GPU:** NVIDIA GeForce GT 755M (1 GB VRAM) — NOT usable for inference
- **Inference:** CPU-only via Ollama
- **OS:** macOS (likely Ventura or Sonoma)

### 7.2 Recommended Models

Given CPU-only inference on a 2013 i5:

| Model Target      | Ollama Model    | Parameters | RAM Required | Speed (est.)      | Recommended For            |
|-------------------|-----------------|------------|-------------|-------------------|----------------------------|
| `ollama-phi3`     | `phi3:mini`     | 3.8B       | ~4 GB       | ~5-8 tok/s        | Fast iteration, dev/test   |
| `ollama-mistral`  | `mistral:7b`    | 7B         | ~6 GB       | ~2-4 tok/s        | Best quality/speed balance |
| `ollama-llama3`   | `llama3:8b`     | 8B         | ~6.5 GB     | ~2-3 tok/s        | Strongest reasoning        |

**Recommendation:** Use `ollama-phi3` as the default local target for development. Its lower parameter count means faster iteration cycles. Reserve `ollama-mistral` for production-quality local testing.

### 7.3 System Prompt Injection for Ollama

When `model_target` starts with `ollama-`, the system prompt must be adapted for smaller models:

**Modifications for local models:**
1. Reduce the system prompt length (smaller context windows)
2. Simplify the output format (fewer fields)
3. Remove banned-phrase lists (wastes context on small models)
4. Increase temperature slightly (small models need more creativity headroom)

**Ollama provider implementation outline** (`hade-api/providers/ollama.py`):

```python
import httpx

OLLAMA_BASE_URL = "http://localhost:11434"

# Map HADE model_target values to Ollama model names
OLLAMA_MODELS = {
    "ollama-mistral": "mistral:7b",
    "ollama-llama3": "llama3:8b",
    "ollama-phi3": "phi3:mini",
}

OLLAMA_SYSTEM_PROMPT = """\
You are HADE, a decision engine. Select ONE venue from the list.

Return ONLY JSON:
{
  "venue_id": "<id>",
  "venue_name": "<name>",
  "rationale": "<1-2 sentences>",
  "why_now": "<1 sentence>",
  "confidence": <0.0-1.0>
}

Rules: Pick one. No lists. Reference the user's energy and group type.
"""

async def generate(model_target: str, system_prompt: str, user_prompt: str) -> str:
    model = OLLAMA_MODELS.get(model_target, "mistral:7b")

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": model,
                "system": OLLAMA_SYSTEM_PROMPT,  # Use compact prompt for local
                "prompt": user_prompt,
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "num_predict": 512,  # Shorter output for speed
                },
            },
        )
        response.raise_for_status()
        return response.json()["response"]
```

### 7.4 Agent-Specific Prompt Assembly

When `agent_definitions.json` is wired in, the system prompt should be assembled from the agent's tone and guardrails:

```
BASE SYSTEM PROMPT (identity + output format)
  + TONE MODIFIERS (from agent.tone[])
  + GUARDRAIL RULES (from agent.guardrails[])
  = FINAL SYSTEM PROMPT
```

For Ollama targets, the base prompt is compressed (see `OLLAMA_SYSTEM_PROMPT` above). For cloud targets, the full `HADE_SYSTEM_PROMPT` from `brain.py` is used.

The tone modifiers are appended as:

```
TONE: {tone_tags_joined}
- Concise: Use short sentences. No filler.
- Editorial: Take a stance. Be opinionated.
[... only include descriptions for the active tags]

GUARDRAILS:
- {guardrails[0]}
- {guardrails[1]}
[... one per line]
```

---

## 8. Integration Roadmap

### Phase 1: Schema + Validation (Current Sprint)

1. Add `AgentPersona`, `AgentTone`, `ModelTarget`, and `AgentDefinitions` types to `src/types/hade.ts`
2. Add `Model_Target` (Select) and `Status` (Select) columns to Notion database
3. Update `scripts/sync-notion.js` with the validation layer from Section 5
4. Update JSON output structure to include `version`, `synced_at`, `validation_warnings` envelope

### Phase 2: Frontend Integration

1. Add `FALLBACK_PERSONA` constant to `src/lib/hade/prompt.ts`
2. Create `src/lib/hade/agents.ts`:
   - `loadAgentDefinitions()` — reads and validates `agent_definitions.json`
   - `getAgent(id: string)` — returns agent by ID or fallback
   - `getActiveAgent()` — returns the first active agent (for single-agent v0)
3. Modify `buildSystemPrompt()` in `prompt.ts` to accept an `AgentPersona` parameter
4. Inject tone modifiers and guardrails from the agent into the system prompt string

### Phase 3: Backend Integration

1. Add `agent_definitions.json` loading to `hade-api/brain.py`
2. Accept `agent_id` in `DecideRequest` (optional, defaults to first agent)
3. Assemble system prompt from agent persona + base template
4. Add Ollama provider to `hade-api/providers/`
5. Route to correct provider based on agent's `model_target`

### Phase 4: Observability

1. Log which agent persona was used for each `/decide` call
2. Include `agent_id` in `DecideResponse.context_snapshot`
3. Surface `validation_warnings` in a Notion-side dashboard or GitHub Action summary

---

## 9. Audit Findings

### 9.1 Ghost Properties (Data Exists, Not Used)

| Property                    | Location                          | Status                                    |
|-----------------------------|-----------------------------------|-------------------------------------------|
| `agent_definitions.json`    | `src/config/`                     | File exists. Not imported anywhere.       |
| `HadeDecision.id`           | `src/types/hade.ts:176`           | Defined. Never referenced in UI.          |
| `HadeDecision.geo`          | `src/types/hade.ts:179`           | Defined. Never referenced in UI.          |
| `HadeDecision.distance_meters` | `src/types/hade.ts:180`       | Defined. Only `eta_minutes` is displayed. |
| `HadeConfig.trust_threshold` | `src/types/hade.ts:145`          | Defined. Never read.                      |
| `HadeConfig.auto_emit_presence` | `src/types/hade.ts:144`       | Defined. Never read.                      |
| `Opportunity.is_primary`    | `src/types/hade.ts:260`           | Defined. Never referenced in UI.          |

### 9.2 Missing Properties (Needed But Not Present)

| Property                    | Needed By                         | Resolution                                |
|-----------------------------|-----------------------------------|-------------------------------------------|
| `AgentPersona` type         | `src/types/hade.ts`               | Add per Section 4.                        |
| `model_target` column       | Notion database                   | Add Select column per Section 2.          |
| `Status` column             | Notion database                   | Add Select column per Section 2.          |
| Agent-driven system prompt  | `prompt.ts`, `brain.py`           | Wire per Phase 2-3 roadmap.              |
| Ollama provider             | `hade-api/providers/`             | Build per Section 7.                      |

### 9.3 Dual Prompt Problem

The system currently has **two independent system prompts**:

1. **Frontend:** `src/lib/hade/prompt.ts` → `buildSystemPrompt()` (246 lines, detailed rules + banned phrases + gold path)
2. **Backend:** `hade-api/brain.py` → `HADE_SYSTEM_PROMPT` (85 lines, simpler heuristic-based)

These prompts have different personalities, different rule structures, and different output schemas. The `agent_definitions.json` pipeline should become the **single source of truth** for agent identity, with the base prompt templates remaining in code but the persona (tone + guardrails) injected from the synced config.

### 9.4 Enum Cross-Reference

The existing TypeScript union types in `hade.ts` define the vocabulary that the Notion schema should align with:

| TypeScript Type  | Values                                                    | Notion Relevance          |
|------------------|-----------------------------------------------------------|---------------------------|
| `Intent`         | eat, drink, chill, scene, anything                        | Could inform agent specialization |
| `EnergyLevel`    | low, medium, high                                         | Referenced in guardrails  |
| `TimeOfDay`      | morning, midday, afternoon, early_evening, evening, late_night | Referenced in guardrails |
| `DayType`        | weekday, weekday_evening, weekend, weekend_prime, holiday | Referenced in guardrails  |
| `Openness`       | comfort, open, adventurous                                | Matches `Adventurous` tone tag |
| `GroupType`      | solo, couple, friends, family, work                       | Referenced in guardrails  |
| `Budget`         | free, low, medium, high, unlimited                        | Referenced in guardrails  |
| `SignalType`     | PRESENCE, SOCIAL_RELAY, ENVIRONMENTAL, BEHAVIORAL, AMBIENT, EVENT | Could drive agent routing |

---

## Appendix A: Sync Script Quick Reference

```bash
# Local test (requires .env with NOTION_TOKEN and NOTION_DATABASE_ID)
NOTION_TOKEN=secret_xxx NOTION_DATABASE_ID=xxx node scripts/sync-notion.js

# Verify output
cat src/config/agent_definitions.json | python3 -m json.tool

# Manual GitHub Action trigger
gh workflow run "HADE Notion Sync"

# Check last sync status
gh run list --workflow="HADE Notion Sync" --limit=5
```

## Appendix B: Notion Database Setup Checklist

- [ ] Create database named "HADE Strategic Command Center"
- [ ] Add `Name` column (Title) — already exists
- [ ] Add `Role` column (Rich Text) — already exists
- [ ] Add `Tone` column (Multi Select) — already exists. Populate options: Concise, Technical, Editorial, Warm, Minimalist, Adventurous, Grounded
- [ ] Add `Guardrails` column (Rich Text) — already exists
- [ ] Add `Model_Target` column (Select) — NEW. Populate options per Section 2.2
- [ ] Add `Status` column (Select) — NEW. Populate options: Active, Draft, Archived, Disabled
- [ ] Set first agent row to Status = Active
- [ ] Set `NOTION_TOKEN` in GitHub Secrets
- [ ] Set `NOTION_DATABASE_ID` in GitHub Secrets
- [ ] Set `VERCEL_DEPLOY_HOOK` in GitHub Secrets
- [ ] Run `gh workflow run "HADE Notion Sync"` to verify
