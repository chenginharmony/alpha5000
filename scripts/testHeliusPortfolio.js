require('dotenv').config();
const fetch = require('cross-fetch');

async function testHeliusPortfolio(address) {
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'helius-portfolio',
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
  const result = data.result;
  const nativeSol = result?.nativeBalance?.lamports ? (result.nativeBalance.lamports / 1e9) : 0;
  const items = result?.items || [];

  let totalEstimatedUsd = nativeSol * 185; // approximate SOL price
  let tokenCount = 0;

  for (const item of items) {
    if (item.interface === 'FungibleToken' || item.interface === 'FungibleAsset') {
      tokenCount++;
      const pricePerToken = item.token_info?.price_info?.price_per_token || 0;
      const balance = item.token_info?.balance || 0;
      const decimals = item.token_info?.decimals || 0;
      const amount = balance / Math.pow(10, decimals);
      const usdValue = item.token_info?.price_info?.total_price || (amount * pricePerToken);
      if (usdValue > 0) {
        totalEstimatedUsd += usdValue;
      }
    }
  }

  console.log(`Wallet ${address}:`);
  console.log(`• Native SOL: ${nativeSol.toFixed(2)} SOL (~$${(nativeSol * 185).toFixed(2)})`);
  console.log(`• Token Assets: ${tokenCount} tokens`);
  console.log(`• Total Portfolio Value: ~$${totalEstimatedUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`);
}

async function main() {
  await testHeliusPortfolio('MfDuWeqSHEqTFVYZ7LoexgAK9dxk7cy4DFJWjWMGVWa');
  await testHeliusPortfolio('951wq3qDowjKHaycrNaiRB5WpovYVKXnqhnrcKPh46zt');
}

main();
