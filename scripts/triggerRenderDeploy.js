const https = require('https');
const RENDER_API_KEY = 'rnd_054LlrfFbyJQ38R0447uAtQJnIiZ';
const SERVICE_ID = 'srv-da3iec2jnfac73ck70eg';

function triggerDeploy() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      clearCache: 'do_not_clear',
    });

    const req = https.request(`https://api.render.com/v1/services/${SERVICE_ID}/deploys`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RENDER_API_KEY}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getServiceDeploys() {
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

function resumeService() {
  return new Promise((resolve, reject) => {
    const req = https.request(`https://api.render.com/v1/services/${SERVICE_ID}/resume`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${RENDER_API_KEY}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('1. Resuming service if suspended...');
  const resumeRes = await resumeService();
  console.log('Resume response:', resumeRes);

  console.log('\n2. Triggering fresh deploy on Render...');
  const deployRes = await triggerDeploy();
  console.log('Deploy triggered:', deployRes);

  console.log('\n3. Waiting 5s and checking deploys...');
  await new Promise(r => setTimeout(r, 5000));
  const deploys = await getServiceDeploys();
  console.log('Current deploys:', JSON.stringify(deploys, null, 2));
}

main().catch(console.error);
