const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

// Initialize Notion Client
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

async function syncHADE() {
  try {
    console.log('🧠 Fetching HADE Strategic Command Center data...');
    
    const response = await notion.databases.query({
      database_id: databaseId,
    });

    const agents = response.results.map((page) => {
      const props = page.properties;
      
      // Map these keys to your exact Notion Column Names
      return {
        id: props.Name?.title[0]?.plain_text || 'unknown',
        role: props.Role?.rich_text[0]?.plain_text || '',
        tone: props.Tone?.multi_select.map(t => t.name) || [],
        guardrails: props.Guardrails?.rich_text[0]?.plain_text || '',
        last_updated: page.last_edited_time
      };
    });

    // Ensure the config directory exists
    const dir = path.join(__dirname, '../src/config');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Write the JSON file that HADE will consume
    fs.writeFileSync(
      path.join(dir, 'agent_definitions.json'),
      JSON.stringify(agents, null, 2)
    );

    console.log(`✅ Success! Synced ${agents.length} agents to HADE System.`);
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    process.exit(1);
  }
}

syncHADE();