const https = require('https');
const RENDER_API_KEY = 'rnd_054LlrfFbyJQ38R0447uAtQJnIiZ';
const SERVICE_ID = 'srv-da3iec2jnfac73ck70eg';

function getService() {
  return new Promise((resolve, reject) => {
    https.get(`https://api.render.com/v1/services/${SERVICE_ID}`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${RENDER_API_KEY}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function listAllServices() {
  return new Promise((resolve, reject) => {
    https.get(`https://api.render.com/v1/services`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${RENDER_API_KEY}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function main() {
  const service = await getService();
  console.log('Service details:', JSON.stringify(service, null, 2));

  const all = await listAllServices();
  console.log('\nAll services count:', all.length);
  for (const s of all) {
    const item = s.service || s;
    console.log(`• ${item.name} (${item.id}) - Type: ${item.type} - Status: ${item.suspended ? 'SUSPENDED' : 'ACTIVE'}`);
  }
}

main().catch(console.error);
