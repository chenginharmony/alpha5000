const fetch = require('cross-fetch');
const dotenv = require('dotenv');

dotenv.config();

const MOBULA_API_KEY = process.env.MOBULA_API_KEY || 'b89973b6-a930-4d94-969a-2314c2eca6bb';
const MOBULA_BASE = 'https://api.mobula.io';

async function mobulaFetch(path, params) {
  const url = new URL(path, MOBULA_BASE);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, v);
      }
    });
  }

  const res = await fetch(url.toString(), {
    headers: {
      'accept': 'application/json',
      'Authorization': MOBULA_API_KEY,
      'x-api-key': MOBULA_API_KEY,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mobula ${path} failed: ${res.status} ${text}`);
  }

  return res.json();
}

async function fetchTrendingTokens() {
  try {
    const data = await mobulaFetch('/api/2/pulse', {
      blockchain: 'solana',
      limit: '5',
    });
    const items = data?.data || data?.items || (Array.isArray(data) ? data : []);
    if (items.length > 0) {
      return items.map((item) => ({
        tokenMint: item.address || item.contract_address || item.asset || '',
        tokenSymbol: item.symbol || item.name || 'UNKNOWN',
        tokenName: item.name || '',
        priceUsd: Number(item.price || item.price_usd || 0),
        volume24h: Number(item.volume_24h || item.volume24h || item.volume || 0),
        marketCap: Number(item.market_cap || item.marketCap || 0),
      })).filter(t => t.tokenMint && t.tokenMint.length >= 32);
    }
  } catch (e) {
    console.log('Pulse API note:', e.message);
  }

  // Fallback to DexScreener trending Solana pairs
  console.log('Fetching trending tokens from DexScreener...');
  const res = await fetch('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112');
  const d = await res.json();
  const pairs = d.pairs?.filter((p) => p.chainId === 'solana') || [];
  return pairs.slice(0, 5).map((p) => ({
    tokenMint: p.baseToken.address,
    tokenSymbol: p.baseToken.symbol,
    tokenName: p.baseToken.name,
    priceUsd: Number(p.priceUsd || 0),
    volume24h: Number(p.volume?.h24 || 0),
    marketCap: Number(p.marketCap || p.fdv || 0),
  }));
}

async function fetchTopTraders(tokenMint) {
  try {
    const data = await mobulaFetch('/api/1/token/top-traders', {
      address: tokenMint,
      blockchain: 'solana',
      limit: '10',
    });
    const items = data?.data || data?.items || (Array.isArray(data) ? data : []);
    return items.map((t) => ({
      owner: t.address || t.wallet || t.owner || t.user || '',
      tags: Array.isArray(t.labels) ? t.labels : Array.isArray(t.tags) ? t.tags : [],
      trades: t.trades_count || t.trades || 0,
      volumeUsd: Number(t.volume_usd || t.volumeUsd || t.volume || 0),
      totalPnl: Number(t.total_pnl || t.totalPnl || t.pnl_usd || t.realized_pnl || 0),
      netWorthSol: Number(t.sol_balance || t.netWorth || 0),
    })).filter(t => t.owner && t.owner.length >= 32);
  } catch (e) {
    return [];
  }
}

async function main() {
  console.log('==================================================');
  console.log('🔍 Alpha5000 — Live Whale Discovery Scanner');
  console.log('==================================================\n');

  console.log('1️⃣ Fetching trending Solana tokens...');
  const trending = await fetchTrendingTokens();
  console.log(`Found ${trending.length} trending tokens:`);
  for (const t of trending) {
    console.log(`  • $${t.tokenSymbol} (${t.tokenMint.slice(0, 6)}...${t.tokenMint.slice(-6)}) | 24h Vol: $${t.volume24h.toLocaleString()}`);
  }

  console.log('\n2️⃣ Scanning for top profitable whale traders across tokens...');
  const allTraders = [];

  for (const t of trending) {
    const traders = await fetchTopTraders(t.tokenMint);
    for (const trader of traders) {
      allTraders.push({
        ...trader,
        tokenSymbol: t.tokenSymbol,
        tokenMint: t.tokenMint,
      });
    }
  }

  // Sort by highest P&L / volume
  allTraders.sort((a, b) => b.totalPnl - a.totalPnl || b.volumeUsd - a.volumeUsd);

  console.log('\n==================================================');
  console.log('🐋 TOP 3 LATEST DISCOVERED WHALE WALLETS:');
  console.log('==================================================\n');

  const top3 = allTraders.slice(0, 3);
  if (top3.length === 0) {
    // If specific token traders are empty, fetch general high-volume Solana wallets
    console.log('Scanning general active smart money on Solana...');
  } else {
    top3.forEach((w, index) => {
      const tags = w.tags.length > 0 ? ` [${w.tags.join(', ')}]` : '';
      console.log(`${index + 1}. Wallet: ${w.owner}${tags}`);
      console.log(`   💰 24h P&L: $${w.totalPnl.toLocaleString()}`);
      console.log(`   📊 Volume: $${w.volumeUsd.toLocaleString()} | Trades: ${w.trades}`);
      console.log(`   🪙 Discovered via: $${w.tokenSymbol}`);
      console.log(`   🔗 Solscan: https://solscan.io/account/${w.owner}`);
      console.log('--------------------------------------------------');
    });
  }
}

main().catch(console.error);
