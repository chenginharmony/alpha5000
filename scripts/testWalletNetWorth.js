require('dotenv').config();
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fetch = require('cross-fetch');

const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
const MOBULA_API_KEY = process.env.MOBULA_API_KEY;

const sampleWallets = [
  'HNQmwcXMWGsho6CZBauj6JgY1fXhGWXA2PcZqmYBSWjt',
  '951wq3qDowjKHaycrNaiRB5WpovYVKXnqhnrcKPh46zt',
  'MfDuWeqSHEqTFVYZ7LoexgAK9dxk7cy4DFJWjWMGVWa',
];

async function checkNetWorth(address) {
  console.log(`\nChecking Net Worth for: ${address}`);

  // 1. Live SOL balance from RPC
  try {
    const lamports = await connection.getBalance(new PublicKey(address));
    const sol = lamports / LAMPORTS_PER_SOL;
    console.log(`• RPC SOL Balance: ${sol.toFixed(4)} SOL`);
  } catch (e) {
    console.error('RPC balance error:', e.message);
  }

  // 2. Mobula Wallet Portfolio
  if (MOBULA_API_KEY) {
    try {
      const res = await fetch(`https://api.mobula.io/api/1/wallet/portfolio?address=${address}&blockchain=solana`, {
        headers: { 'Authorization': MOBULA_API_KEY },
      });
      const data = await res.json();
      console.log('• Mobula Portfolio response:', {
        total_wallet_value: data?.data?.total_wallet_value,
        realized_pnl: data?.data?.realized_pnl,
        unrealized_pnl: data?.data?.unrealized_pnl,
        assets_count: data?.data?.assets?.length,
      });
    } catch (e) {
      console.error('Mobula portfolio error:', e.message);
    }
  }

  // 3. Helius getAssetsByOwner / portfolio if available
  if (process.env.HELIUS_API_KEY) {
    try {
      const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'my-id',
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: address,
            page: 1,
            limit: 100,
            displayOptions: { showFungible: true, showNativeBalance: true },
          },
        }),
      });
      const data = await res.json();
      const nativeBalance = data.result?.nativeBalance?.lamports ? (data.result.nativeBalance.lamports / LAMPORTS_PER_SOL) : null;
      console.log('• Helius Assets:', {
        totalAssets: data.result?.total,
        nativeSol: nativeBalance,
      });
    } catch (e) {
      console.error('Helius assets error:', e.message);
    }
  }
}

async function main() {
  for (const w of sampleWallets) {
    await checkNetWorth(w);
  }
}

main();
