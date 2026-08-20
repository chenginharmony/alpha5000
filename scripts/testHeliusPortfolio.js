require('dotenv').config();
const fetch = require('cross-fetch');

async function testHeliusPortfolio(address) {
  console.log(`\nAnalyzing portfolio for: ${address}`);
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
  const items = data.result?.items || [];
  const nativeSol = data.result?.nativeBalance?.lamports ? (data.result.nativeBalance.lamports / 1e9) : 0;

  console.log(`• Native SOL: ${nativeSol.toFixed(2)} SOL (~$${(nativeSol * 185).toFixed(2)})`);
  console.log(`• Total Token Holdings: ${items.length}`);

  let totalEstimatedUsd = nativeSol * 185;
  for (const item of items.slice(0, 10)) {
    const tokenInfo = item.token_info;
    const symbol = tokenInfo?.symbol || item.content?.metadata?.symbol || 'SPL';
    const balance = tokenInfo?.balance ? (tokenInfo.balance / Math.pow(10, tokenInfo.decimals || 6)) : 0;
    const priceUsd = tokenInfo?.price_info?.price_per_unit || 0;
    const valueUsd = balance * priceUsd;
    totalEstimatedUsd += valueUsd;
    if (balance > 0) {
      console.log(`   - ${symbol}: ${balance.toLocaleString()} (Price: $${priceUsd}, Value: $${valueUsd.toFixed(2)})`);
    }
  }

  console.log(`💰 Total Estimated Portfolio: ~$${totalEstimatedUsd.toFixed(2)} USD`);
}

async function main() {
  await testHeliusPortfolio('951wq3qDowjKHaycrNaiRB5WpovYVKXnqhnrcKPh46zt');
  await testHeliusPortfolio('MfDuWeqSHEqTFVYZ7LoexgAK9dxk7cy4DFJWjWMGVWa');
}

main();
