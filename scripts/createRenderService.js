const https = require('https');
const dotenv = require('dotenv');

dotenv.config();

const RENDER_API_KEY = process.env.RENDER_API_KEY || 'rnd_054LlrfFbyJQ38R0447uAtQJnIiZ';
const OWNER_ID = 'tea-da1agiou01pc739rar6g';

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
  console.log('🚀 Creating Alpha5000 Web Service on Render...');

  // Prepare environment variables from .env
  const envVars = [
    { key: 'PORT', value: '3000' },
    { key: 'DATABASE_URL', value: process.env.DATABASE_URL || '' },
    { key: 'SOLANA_RPC_URL', value: process.env.SOLANA_RPC_URL || '' },
    { key: 'HELIUS_API_KEY', value: process.env.HELIUS_API_KEY || '' },
    { key: 'PRIVATE_KEY_BASE58', value: process.env.PRIVATE_KEY_BASE58 || '' },
    { key: 'TELEGRAM_BOT_TOKEN', value: process.env.TELEGRAM_BOT_TOKEN || '' },
    { key: 'MOBULA_API_KEY', value: process.env.MOBULA_API_KEY || '' },
    { key: 'WEBHOOK_SECRET', value: process.env.WEBHOOK_SECRET || 'alpha_whale_pass_8877' },
    { key: 'TRADE_BUDGET_USD', value: process.env.TRADE_BUDGET_USD || '6.00' },
    { key: 'TAKE_PROFIT_PERCENT', value: process.env.TAKE_PROFIT_PERCENT || '50' },
    { key: 'STOP_LOSS_PERCENT', value: process.env.STOP_LOSS_PERCENT || '-30' },
    { key: 'MAX_SLIPPAGE_BPS', value: process.env.MAX_SLIPPAGE_BPS || '200' },
    { key: 'MIN_WHALE_BUY_USD', value: process.env.MIN_WHALE_BUY_USD || '100' },
    { key: 'PLATFORM_FEE_BPS', value: process.env.PLATFORM_FEE_BPS || '20' },
    { key: 'JUPITER_API_KEY', value: process.env.JUPITER_API_KEY || '' },
  ];

  const payload = {
    type: 'web_service',
    name: 'alpha5000-bot',
    ownerId: OWNER_ID,
    repo: 'https://github.com/chenginharmony/alpha5000',
    branch: 'main',
    autoDeploy: 'no',
    serviceDetails: {
      env: 'node',
      region: 'frankfurt',
      plan: 'starter',
      healthCheckPath: '/health',
      envSpecificDetails: {
        buildCommand: 'npm install && npx prisma generate && npm run build',
        startCommand: 'npm start',
      },
      envVars,
    },
  };

  try {
    const service = await renderRequest('POST', '/services', payload);
    console.log('--------------------------------------------------');
    console.log('✅ Service created successfully on Render!');
    console.log(`• Service ID: ${service.id || service.service?.id}`);
    console.log(`• Service Name: ${service.name || service.service?.name}`);
    console.log(`• Live URL: ${service.serviceDetails?.url || service.service?.serviceDetails?.url || 'Provisioning...'}`);
    console.log('--------------------------------------------------');
  } catch (err) {
    console.log('Attempting with standard/free plan if starter fails...');
    payload.serviceDetails.plan = 'free';
    const service = await renderRequest('POST', '/services', payload);
    console.log('--------------------------------------------------');
    console.log('✅ Service created successfully on Render (Free Plan)!');
    console.log(`• Service ID: ${service.id || service.service?.id}`);
    console.log(`• Service Name: ${service.name || service.service?.name}`);
    console.log(`• Live URL: ${service.serviceDetails?.url || service.service?.serviceDetails?.url || 'Provisioning...'}`);
    console.log('--------------------------------------------------');
  }
}

main().catch((e) => {
  console.error('❌ Failed to create Render service:', e.message);
  process.exit(1);
});
