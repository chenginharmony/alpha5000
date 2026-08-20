const fetch = require('cross-fetch');

async function testBatch() {
  const profileRes = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
  const profiles = await profileRes.json();
  const solTokens = profiles.filter(t => t.chainId === 'solana').slice(0, 5);
  const mints = solTokens.map(t => t.tokenAddress);

  console.log('Fetching batch metadata for mints:', mints);
  const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mints.join(',')}`);
  const pairData = await pairRes.json();
  const pairs = pairData.pairs || [];

  console.log(`Received ${pairs.length} pairs. Extracted tokens:`);
  const seen = new Set();
  for (const p of pairs) {
    if (p.chainId === 'solana' && !seen.has(p.baseToken.address)) {
      seen.add(p.baseToken.address);
      console.log(`• $${p.baseToken.symbol} (${p.baseToken.name}) - Price: $${p.priceUsd} - 24h Vol: $${p.volume?.h24}`);
    }
  }
}

testBatch();
