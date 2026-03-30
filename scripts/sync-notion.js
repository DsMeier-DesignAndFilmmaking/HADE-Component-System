const Notion = require('@notionhq/client'); // Import the whole module
const fs = require('fs');
const path = require('path');

// Initialize Notion Client safely
const notion = new Notion.Client({ 
  auth: process.env.NOTION_TOKEN 
});

const databaseId = process.env.NOTION_DATABASE_ID;

async function syncHADE() {
  try {
    console.log('🧠 Fetching HADE Strategic Command Center data...');
    
    // Debug check: ensures the databases object exists
    if (!notion.databases || typeof notion.databases.query !== 'function') {
      throw new Error(`Notion Client structure mismatch. Available keys: ${Object.keys(notion).join(', ')}`);
    }

    const response = await notion.databases.query({
      database_id: databaseId,
    });

    const agents = response.results.map((page) => {
      const props = page.properties;
      
      // Safety check for Notion properties
      return {
        id: props["Name"]?.title?.[0]?.plain_text || 'unknown',
        role: props["Role"]?.rich_text?.[0]?.plain_text || '',
        tone: props["Tone"]?.multi_select?.map(t => t.name) || [],
        guardrails: props["Guardrails"]?.rich_text?.[0]?.plain_text || '',
        last_updated: page.last_edited_time
      };
    });

    // Path resolution using current working directory
    const dir = path.join(process.cwd(), 'src', 'config');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = path.join(dir, 'agent_definitions.json');
    fs.writeFileSync(filePath, JSON.stringify(agents, null, 2));

    console.log(`✅ Success! Synced ${agents.length} agents to: ${filePath}`);
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    if (error.body) console.error('Notion API Error Body:', error.body);
    process.exit(1);
  }
}

syncHADE();