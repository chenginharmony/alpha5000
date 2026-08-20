require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const prisma = new PrismaClient();
const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');

async function syncBalances() {
  console.log('🔄 Syncing live on-chain balances for discovered wallets in Supabase...');

  const wallets = await prisma.discoveredWallet.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  console.log(`Found ${wallets.length} discovered wallets to sync.`);

  let updated = 0;
  for (const w of wallets) {
    try {
      const lamports = await connection.getBalance(new PublicKey(w.address));
      const sol = lamports / LAMPORTS_PER_SOL;
      await prisma.discoveredWallet.update({
        where: { id: w.id },
        data: { netWorthSol: sol },
      });
      if (sol > 0) {
        console.log(`• Updated ${w.address.slice(0, 6)}...${w.address.slice(-6)}: ${sol.toFixed(4)} SOL`);
      }
      updated++;
    } catch (e) {
      console.warn(`Failed ${w.address}: ${e.message}`);
    }
  }

  console.log(`✅ Synced ${updated} wallets successfully!`);
}

syncBalances()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
