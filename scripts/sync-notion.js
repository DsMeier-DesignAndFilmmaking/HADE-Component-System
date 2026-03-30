const { Client } = require('@notionhq/client'); // Destructure Client directly
const fs = require('fs');
const path = require('path');

// Initialize the Client using the constructor
const notion = new Client({ 
  auth: process.env.NOTION_TOKEN 
});

const databaseId = process.env.NOTION_DATABASE_ID;

async function syncHADE() {
  try {
    console.log('🧠 Fetching HADE Strategic Command Center data...');
    
    // The logs showed 'databases' exists, so we call it directly here
    const response = await notion.databases.query({
      database_id: databaseId,
    });

    const agents = response.results.map((page) => {
      const props = page.properties;
      
      // Safety check for Notion properties using bracket notation
      // Note: Ensure your Notion columns are named exactly "Name", "Role", "Tone", "Guardrails"
      return {
        id: props["Name"]?.title?.[0]?.plain_text || 'unknown',
        role: props["Role"]?.rich_text?.[0]?.plain_text || '',
        tone: props["Tone"]?.multi_select?.map(t => t.name) || [],
        guardrails: props["Guardrails"]?.rich_text?.[0]?.plain_text || '',
        last_updated: page.last_edited_time
      };
    });

    const dir = path.join(process.cwd(), 'src', 'config');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = path.join(dir, 'agent_definitions.json');
    fs.writeFileSync(filePath, JSON.stringify(agents, null, 2));

    console.log(`✅ Success! Synced ${agents.length} agents to: ${filePath}`);
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    if (error.body) {
        console.error('Notion API Details:', JSON.parse(error.body).message);
    }
    process.exit(1);
  }
}

syncHADE();