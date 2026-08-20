const fetch = require('cross-fetch');
const dotenv = require('dotenv');

dotenv.config();

const MOBULA_API_KEY = process.env.MOBULA_API_KEY || 'b89973b6-a930-4d94-969a-2314c2eca6bb';

async function scanWhales() {
  const tokens = [
    { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
    { symbol: 'WIF', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm' },
    { symbol: 'POPCAT', mint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr' },
    { symbol: 'JUP', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' },
  ];

  console.log('🔍 Scanning Solana smart money across top tokens...\n');
  const allWallets = [];

  for (const t of tokens) {
    try {
      const url = `https://api.mobula.io/api/2/token/trader-positions?address=${t.mint}&blockchain=solana&limit=10`;
      const res = await fetch(url, {
        headers: {
          'accept': 'application/json',
          'Authorization': MOBULA_API_KEY,
          'x-api-key': MOBULA_API_KEY,
        },
      });

      const json = await res.json();
      const items = json.data || [];
      console.log(`✅ Scanned $${t.symbol}: Found ${items.length} top traders`);

      for (const item of items) {
        const pnl = parseFloat(item.realizedPnlUSD || item.totalPnlUSD || '0') || 0;
        const volumeBuy = parseFloat(item.volumeBuyUSD || '0') || 0;
        const volumeSell = parseFloat(item.volumeSellUSD || '0') || 0;
        const totalTrades = (item.buys || 0) + (item.sells || 0);

        if (item.walletAddress && pnl > 1000) {
          allWallets.push({
            address: item.walletAddress,
            token: t.symbol,
            pnl,
            volume: volumeBuy + volumeSell,
            buys: item.buys || 0,
            sells: item.sells || 0,
            trades: totalTrades,
            lastTradeAt: item.lastTradeAt,
            labels: Array.isArray(item.labels) ? item.labels.map(l => typeof l === 'string' ? l : l.name).filter(Boolean) : [],
          });
        }
      }
    } catch (e) {
      console.error(`Error scanning $${t.symbol}:`, e.message);
    }
  }

  // Deduplicate and sort by highest Realized P&L
  const uniqueMap = new Map();
  for (const w of allWallets) {
    if (!uniqueMap.has(w.address) || uniqueMap.get(w.address).pnl < w.pnl) {
      uniqueMap.set(w.address, w);
    }
  }

  const sorted = Array.from(uniqueMap.values()).sort((a, b) => b.pnl - a.pnl);

  console.log('\n========================================================================');
  console.log('🐋 TOP 3 LATEST DISCOVERED SOLANA WHALE WALLETS:');
  console.log('========================================================================\n');

  sorted.slice(0, 3).forEach((w, i) => {
    const labelStr = w.labels.length > 0 ? ` [${w.labels.join(', ')}]` : '';
    console.log(`🏆 Whale #${i + 1}: ${w.address}${labelStr}`);
    console.log(`   💰 Realized Profit: +$${w.pnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`   📊 Trading Volume: $${w.volume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${w.trades} trades: ${w.buys}B / ${w.sells}S)`);
    console.log(`   🪙 Discovered via: $${w.token}`);
    console.log(`   ⏱️ Last Active: ${w.lastTradeAt || 'Recent'}`);
    console.log(`   🔗 Solscan: https://solscan.io/account/${w.address}`);
    console.log('------------------------------------------------------------------------');
  });
}

scanWhales().catch(console.error);
