const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

const token = process.env.NOTION_TOKEN;
const databaseId = process.env.NOTION_DATABASE_ID;

if (!token || !databaseId) {
  console.error('Missing required environment variables: NOTION_TOKEN and/or NOTION_DATABASE_ID');
  process.exit(1);
}

const notion = new Client({ auth: token });

async function syncHADE() {
  try {
    console.log('Fetching HADE Strategic Command Center data...');

    const response = await notion.databases.query({
      database_id: databaseId,
    });

    const agents = response.results.map((page) => {
      const props = page.properties;
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

    console.log(`Synced ${agents.length} agents to ${filePath}`);
  } catch (error) {
    console.error('Sync failed:', error.message);
    process.exit(1);
  }
}

syncHADE();
