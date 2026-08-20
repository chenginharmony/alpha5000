const https = require('https');
const dotenv = require('dotenv');

dotenv.config();

const RENDER_API_KEY = 'rnd_054LlrfFbyJQ38R0447uAtQJnIiZ';
const SERVICE_ID = 'srv-da3iec2jnfac73ck70eg';

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
  console.log('🔄 Syncing Environment Variables to Render (alpha5000-bot)...');

  const envVars = [
    { key: 'PORT', value: '3000' },
    { key: 'DATABASE_URL', value: process.env.DATABASE_URL || '' },
    { key: 'SOLANA_RPC_URL', value: process.env.SOLANA_RPC_URL || '' },
    { key: 'HELIUS_API_KEY', value: process.env.HELIUS_API_KEY || '' },
    { key: 'PRIVATE_KEY_BASE58', value: process.env.PRIVATE_KEY_BASE58 || '' },
    { key: 'TELEGRAM_BOT_TOKEN', value: process.env.TELEGRAM_BOT_TOKEN || '' },
    { key: 'MOBULA_API_KEY', value: process.env.MOBULA_API_KEY || '' },
    { key: 'WEBHOOK_SECRET', value: 'alpha_whale_pass_8877' },
    { key: 'WEBHOOK_URL', value: 'https://alpha5000-bot.onrender.com/webhook/helius' },
    { key: 'TRADE_BUDGET_USD', value: process.env.TRADE_BUDGET_USD || '6.00' },
    { key: 'TAKE_PROFIT_PERCENT', value: process.env.TAKE_PROFIT_PERCENT || '50' },
    { key: 'STOP_LOSS_PERCENT', value: process.env.STOP_LOSS_PERCENT || '-30' },
    { key: 'MAX_SLIPPAGE_BPS', value: process.env.MAX_SLIPPAGE_BPS || '200' },
    { key: 'MIN_WHALE_BUY_USD', value: process.env.MIN_WHALE_BUY_USD || '100' },
    { key: 'PLATFORM_FEE_BPS', value: process.env.PLATFORM_FEE_BPS || '20' },
    { key: 'JUPITER_API_KEY', value: process.env.JUPITER_API_KEY || '' },
  ];

  await renderRequest('PUT', `/services/${SERVICE_ID}/env-vars`, envVars);
  console.log('✅ All environment variables uploaded successfully to Render!');

  console.log('🚀 Triggering a new Deployment on Render...');
  const deploy = await renderRequest('POST', `/services/${SERVICE_ID}/deploys`, {
    clearCache: 'do_not_clear',
  });

  console.log('--------------------------------------------------');
  console.log('🎉 Deployment Triggered Successfully!');
  console.log(`• Deploy ID: ${deploy.id || deploy.deploy?.id}`);
  console.log(`• Status: ${deploy.status || deploy.deploy?.status || 'queued'}`);
  console.log(`• Live URL: https://alpha5000-bot.onrender.com`);
  console.log(`• Webhook Endpoint: https://alpha5000-bot.onrender.com/webhook/helius`);
  console.log('--------------------------------------------------');
}

main().catch((e) => {
  console.error('❌ Sync failed:', e.message);
  process.exit(1);
});
