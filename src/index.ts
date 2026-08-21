import express from 'express';
import { config } from './config';
import { initDb, prisma } from './db';
import { handleHeliusWebhook, setupHeliusWebhook } from './services/helius';
import { startProfitMonitor } from './services/profitMonitor';
import { startDiscoveryJobs } from './services/walletDiscovery';
import './services/telegramBot'; // Initializes bot polling + UI
import { initGroupBot } from './services/groupBot';

const app = express();
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ⚡ Helius webhook endpoint — must respond FAST
app.post('/webhook/helius', async (req, res) => {
  // Respond immediately to Helius (don't wait for processing)
  res.status(200).send('OK');

  // Process asynchronously
  try {
    const payload = req.body;
    const payloads = Array.isArray(payload) ? payload : [payload];

    for (const p of payloads) {
      await handleHeliusWebhook(p);
    }
  } catch (e) {
    console.error('Webhook processing error:', (e as Error).message);
  }
});

// Admin: sync wallets to Helius
app.post('/admin/sync-wallets', async (_req, res) => {
  const wallets = await prisma.watchedWallet.findMany({ where: { isActive: true } });
  res.json({ wallets: wallets.map(w => w.address), count: wallets.length });
});

async function main() {
  await initDb();
  
  // Initialize group bot handlers
  const { bot } = await import('./services/telegramBot');
  initGroupBot(bot);

  const port = config.PORT;
  app.listen(port, () => {
    console.log(`🚀 Server listening on port ${port}`);
    console.log(`🔗 Webhook URL: http://YOUR_SERVER:${port}/webhook/helius`);
  });

  // Start profit monitor
  startProfitMonitor();

  // Start wallet discovery jobs
  startDiscoveryJobs();

  // Setup Helius webhook
  const webhookUrl = process.env.WEBHOOK_URL;
  if (webhookUrl) {
    await setupHeliusWebhook(webhookUrl);
  } else {
    console.log('⚠️ Set WEBHOOK_URL env var to auto-configure Helius webhook');
    console.log('   Or configure manually at https://dev.helius.xyz/webhooks');
  }

  // 24/7 Keep-Alive ping to prevent Render Free Tier from sleeping
  const publicUrl = webhookUrl ? webhookUrl.replace('/webhook/helius', '') : 'https://alpha5000-bot.onrender.com';
  console.log(`⏱️ Keep-alive engine active: self-pinging ${publicUrl}/health every 5 minutes`);
  setInterval(async () => {
    try {
      await fetch(`${publicUrl}/health`);
    } catch {}
  }, 5 * 60 * 1000);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
