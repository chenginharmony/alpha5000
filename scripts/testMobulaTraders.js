const fetch = require('cross-fetch');
const dotenv = require('dotenv');

dotenv.config();

const MOBULA_API_KEY = process.env.MOBULA_API_KEY || 'b89973b6-a930-4d94-969a-2314c2eca6bb';

async function getTopTradersForTokens() {
  const tokens = [
    { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
    { symbol: 'WIF', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm' },
    { symbol: 'POPCAT', mint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr' },
    { symbol: 'JUP', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' },
  ];

  console.log('🔍 Querying live smart money on Solana...\n');

  for (const t of tokens) {
    try {
      const url = `https://api.mobula.io/api/1/token/top-traders?address=${t.mint}&blockchain=solana&limit=5`;
      const res = await fetch(url, {
        headers: {
          'accept': 'application/json',
          'Authorization': MOBULA_API_KEY,
          'x-api-key': MOBULA_API_KEY,
        },
      });
      const data = await res.json();
      console.log(`Token: $${t.symbol} (${t.mint.slice(0, 6)}...${t.mint.slice(-6)})`);
      console.log('Data:', JSON.stringify(data).slice(0, 300));
    } catch (e) {
      console.log(`Failed for $${t.symbol}:`, e.message);
    }
  }
}

getTopTradersForTokens();
