import { Client } from "@notionhq/client";
import fs from "fs";
import path from "path";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

// --- PROTOCOL CONSTANTS (Strict I/O Contract) ---
const VALID_TONES = ['Concise', 'Technical', 'Editorial', 'Warm', 'Minimalist', 'Adventurous', 'Grounded'];
const VALID_MODELS = ['claude-sonnet', 'claude-haiku', 'gpt-4o', 'gpt-4o-mini', 'gemini-flash', 'ollama-mistral', 'ollama-llama3', 'ollama-phi3'];
const NAME_REGEX = /^[A-Z][A-Za-z0-9_]{2,39}$/;

function toTitleCase(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Validates a single agent row based on the HADE Protocol
 */
function validateAgent(raw, warnings) {
  // 1. Normalization
  const name = (raw.id || '').trim().replace(/\s+/g, '_');
  const role = (raw.role || '').trim().replace(/\s{2,}/g, ' ');
  const rawGuardrails = (raw.guardrails || '').trim().replace(/\|+$/, '');
  const modelTarget = (raw.model_target || '').trim().toLowerCase() || null;

  // 2. Name Validation (Pascal/Snake Case)
  if (!name || !NAME_REGEX.test(name)) {
    warnings.push(`REJECTED "${name}": Invalid Name format. Must start with Uppercase, no spaces.`);
    return null;
  }

  // 3. Role Validation (10-200 chars)
  if (!role || role.length < 10 || role.length > 200) {
    warnings.push(`REJECTED "${name}": Role length must be between 10-200 chars.`);
    return null;
  }

  // 4. Tone Validation (Strip unknowns, keep max 3)
  const rawTones = (raw.tone || []).map(t => toTitleCase(t.trim()));
  const validTones = rawTones.filter(t => VALID_TONES.includes(t));
  const invalidTones = rawTones.filter(t => !VALID_TONES.includes(t));
  
  if (invalidTones.length > 0) {
    warnings.push(`WARN "${name}": Stripped invalid tone tags: ${invalidTones.join(', ')}`);
  }
  if (validTones.length === 0) {
    warnings.push(`REJECTED "${name}": No valid tone tags remain.`);
    return null;
  }

  // 5. Guardrails Parsing (Pipe-delimited)
  const rules = rawGuardrails.split('|').map(r => r.trim()).filter(r => r.length >= 5);
  if (rules.length === 0) {
    warnings.push(`REJECTED "${name}": No valid guardrail rules found.`);
    return null;
  }

  return {
    id: name,
    role: role,
    tone: validTones.slice(0, 3), 
    guardrails: rules,
    model_target: VALID_MODELS.includes(modelTarget) ? modelTarget : null,
    last_updated: raw.last_updated
  };
}

async function sync() {
  console.log("🚀 Starting Hardened HADE Protocol Sync...");
  const warnings = [];
  
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: { property: "Status", select: { equals: "Active" } } // V15: Status Filter
    });

    const agents = response.results.map(page => {
      const p = page.properties;
      return validateAgent({
        id: p.Name?.title?.[0]?.plain_text,
        role: p.Role?.rich_text?.[0]?.plain_text,
        tone: p.Tone?.multi_select?.map(s => s.name),
        guardrails: p.Guardrails?.rich_text?.[0]?.plain_text,
        model_target: p.Model_Target?.select?.name,
        last_updated: page.last_edited_time
      }, warnings);
    }).filter(Boolean);

    // B1: Exit if no agents pass validation
    if (agents.length === 0) {
      console.error("❌ FATAL: 0 agents passed validation. Check Notion 'Status' and 'Name' fields.");
      process.exit(1);
    }

    const payload = {
      version: "1.0", // Schema version for forward compatibility
      synced_at: new Date().toISOString(),
      source_database_id: databaseId.substring(0, 8) + "...",
      agents,
      validation_warnings: warnings
    };

    fs.writeFileSync(
      path.join(process.cwd(), "src/config/agent_definitions.json"),
      JSON.stringify(payload, null, 2)
    );

    console.log(`✅ Sync Complete: ${agents.length} agents hardened.`);
    if (warnings.length > 0) console.warn("⚠️ Warnings encountered:", warnings);

  } catch (error) {
    console.error("❌ Sync Failed:", error.message);
    process.exit(1);
  }
}

sync();