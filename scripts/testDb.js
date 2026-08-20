const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  console.log('Testing Supabase PostgreSQL connection...');
  const wallets = await prisma.watchedWallet.count();
  const referrals = await prisma.referralUser.count();
  const trades = await prisma.trade.count();
  const settings = await prisma.settings.findFirst();

  console.log('--------------------------------------------');
  console.log('✅ Supabase PostgreSQL is CONNECTED and HEALTHY:');
  console.log(`• Watched Wallets: ${wallets}`);
  console.log(`• Referral Users: ${referrals}`);
  console.log(`• Trades Logged: ${trades}`);
  console.log(`• Bot Settings: Budget $${settings?.tradeBudget || 6.00}, TP ${settings?.takeProfit || 50}%, SL ${settings?.stopLoss || -30}%`);
  console.log('--------------------------------------------');
}

test()
  .catch((e) => {
    console.error('❌ Connection failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
