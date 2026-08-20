const fetch = require('cross-fetch');

async function testDexScreener() {
  console.log('Testing DexScreener token profiles:');
  const res = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
  const data = await res.json();
  const solanaTokens = data.filter(t => t.chainId === 'solana').slice(0, 3);
  console.log('Token profiles sample:', JSON.stringify(solanaTokens, null, 2));

  if (solanaTokens.length > 0) {
    const mint = solanaTokens[0].tokenAddress;
    console.log(`\nFetching metadata for ${mint} from DexScreener DEX API...`);
    const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const pairData = await pairRes.json();
    const pair = pairData.pairs?.[0];
    console.log('Pair baseToken:', pair?.baseToken);
  }
}

testDexScreener();
