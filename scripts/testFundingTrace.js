require('dotenv').config();
const fetch = require('cross-fetch');

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

async function traceFundingSource(walletAddress) {
  const url = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${HELIUS_API_KEY}&limit=10`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const txs = await res.json();
  // Find the earliest incoming native transfer (funding tx)
  txs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  for (const tx of txs) {
    if (tx.nativeTransfers) {
      for (const transfer of tx.nativeTransfers) {
        if (transfer.toUserAccount === walletAddress && transfer.fromUserAccount !== walletAddress) {
          return {
            funder: transfer.fromUserAccount,
            amountSol: (transfer.amount || 0) / 1e9,
            timestamp: tx.timestamp,
            txid: tx.signature,
          };
        }
      }
    }
  }
  return null;
}

async function main() {
  const testWallets = [
    'CJXRn4f7j6W5jRj3BwW9qE8D9C8D9C8D9C8D9C8D9RAM',
    '3kCca4V9F7A2Qd1W8B5Z7D6C5A4B3C2D1E9F8A7BwD3W',
  ];

  console.log('Testing funding source trace on sample wallets:');
  for (const w of testWallets) {
    const funding = await traceFundingSource(w);
    console.log(`Wallet: ${w} -> Funder:`, funding);
  }
}

main();
