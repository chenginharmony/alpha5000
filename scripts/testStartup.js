require('dotenv').config();

async function testBoot() {
  console.log('Testing bot startup...');
  console.log('Checking environment variables:');
  console.log('• DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Missing');
  console.log('• TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? 'Set' : 'Missing');
  console.log('• SOLANA_RPC_URL:', process.env.SOLANA_RPC_URL ? 'Set' : 'Missing');
  console.log('• PRIVATE_KEY_BASE58:', process.env.PRIVATE_KEY_BASE58 ? 'Set' : 'Missing');

  try {
    const { initDb } = require('../dist/db');
    await initDb();
    console.log('✅ DB initialized successfully');

    const { bot } = require('../dist/services/telegramBot');
    const me = await bot.getMe();
    console.log(`✅ Telegram bot connected as @${me.username} (${me.first_name})`);

    process.exit(0);
  } catch (e) {
    console.error('❌ Startup test error:', e);
    process.exit(1);
  }
}

testBoot();
