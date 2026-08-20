const https = require('https');
const RENDER_API_KEY = 'rnd_054LlrfFbyJQ38R0447uAtQJnIiZ';

function getServices() {
  return new Promise((resolve, reject) => {
    https.get('https://api.render.com/v1/services?limit=20', {
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
  const list = await getServices();
  console.log(`Found ${list.length} services on Render:`);
  for (const s of list) {
    console.log('--------------------------------------------------');
    console.log(`• Name: ${s.service.name}`);
    console.log(`• ID: ${s.service.id}`);
    console.log(`• Repo: ${s.service.repo}`);
    console.log(`• Service URL: ${s.service.serviceDetails?.url || 'N/A'}`);
    console.log(`• Updated: ${s.service.updatedAt}`);
  }
}

main().catch(console.error);
