const https = require('https');
const RENDER_API_KEY = 'rnd_054LlrfFbyJQ38R0447uAtQJnIiZ';
const SERVICE_ID = 'srv-da3iec2jnfac73ck70eg';

function getDeploys() {
  return new Promise((resolve, reject) => {
    https.get(`https://api.render.com/v1/services/${SERVICE_ID}/deploys?limit=5`, {
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
  const deploys = await getDeploys();
  console.log(`Latest Deploys for Alpha5000:`);
  for (const d of deploys) {
    const item = d.deploy || d;
    console.log('--------------------------------------------------');
    console.log(`• Deploy ID: ${item.id}`);
    console.log(`• Status: ${item.status}`);
    console.log(`• Created At: ${item.createdAt}`);
    console.log(`• Commit: ${item.commit?.id ? item.commit.id.slice(0, 7) + ' - ' + item.commit.message : 'N/A'}`);
  }
}

main().catch(console.error);
