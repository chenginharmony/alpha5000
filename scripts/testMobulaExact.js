const fetch = require('cross-fetch');
const dotenv = require('dotenv');

dotenv.config();

const MOBULA_API_KEY = process.env.MOBULA_API_KEY || 'b89973b6-a930-4d94-969a-2314c2eca6bb';

async function test() {
  const tokenMint = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'; // BONK
  const url = `https://api.mobula.io/api/1/market/token/trader-positions?asset=${tokenMint}&blockchain=solana&limit=5`;

  console.log('Testing Mobula trader-positions for BONK...');
  const res = await fetch(url, {
    headers: {
      'accept': 'application/json',
      'Authorization': MOBULA_API_KEY,
      'x-api-key': MOBULA_API_KEY,
    },
  });

  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Result:', JSON.stringify(data, null, 2));
}

test().catch(console.error);
