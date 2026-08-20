const https = require('https');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env
dotenv.config();

const RENDER_API_KEY = process.env.RENDER_API_KEY || process.argv[2];

if (!RENDER_API_KEY) {
  console.log('❌ Please provide your Render API key.');
  console.log('Usage: node scripts/deployRender.js <RENDER_API_KEY>');
  console.log('Or add RENDER_API_KEY=rnd_... to your .env file');
  console.log('\nGet your key at: https://dashboard.render.com/account/api-keys');
  process.exit(1);
}

function renderRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.render.com/v1${endpoint}`);
    const options = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RENDER_API_KEY}`,
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`Render API [${res.statusCode}]: ${JSON.stringify(parsed)}`));
          }
        } catch {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body);
          } else {
            reject(new Error(`Render API [${res.statusCode}]: ${body}`));
          }
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  console.log('🚀 Authenticating with Render API...');
  
  // 1. Get Owner/Workspace
  const owners = await renderRequest('GET', '/owners');
  if (!owners || owners.length === 0) {
    throw new Error('No Render workspace/owner found for this API key.');
  }

  const owner = owners[0].owner;
  console.log(`✅ Authenticated as: ${owner.name} (${owner.email})`);
  console.log(`📁 Workspace ID: ${owner.id}`);

  // 2. List existing services
  const services = await renderRequest('GET', `/services?ownerId=${owner.id}`);
  console.log(`📋 Found ${services.length} existing services.`);

  console.log('\n--------------------------------------------------');
  console.log('✨ Render connection successful and ready to deploy!');
  console.log('--------------------------------------------------');
}

main().catch((err) => {
  console.error('❌ Render setup failed:', err.message);
  process.exit(1);
});
