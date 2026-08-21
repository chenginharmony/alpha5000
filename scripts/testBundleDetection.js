require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const fetch = require('cross-fetch');

const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

// Sample recent tokens on Pump.fun / Solana
const sampleMints = [
  '9W8G5PoHCmLq3KktuGTfMMtSHDrJkidyxT4UPHvzpump',
  'FhBfSgb1Nxu53kDR9sgHoHYRMoV1dvyL4rd1wn8cpump',
];

async function analyzeTokenLaunch(tokenMint) {
  console.log(`\n========================================`);
  console.log(`Analyzing Token Launch for: ${tokenMint}`);
  console.log(`========================================`);

  if (!HELIUS_API_KEY) {
    console.error('HELIUS_API_KEY missing');
    return;
  }

  // 1. Fetch earliest transactions via Helius Enhanced API
  const url = `https://api.helius.xyz/v0/addresses/${tokenMint}/transactions?api-key=${HELIUS_API_KEY}&limit=50`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error('Helius fetch failed:', res.status, await res.text());
    return;
  }

  const txs = await res.json();
  console.log(`Fetched ${txs.length} transactions from Helius.`);

  if (txs.length === 0) {
    console.log('No transactions found.');
    return;
  }

  // Sort chronological (earliest first)
  txs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const creationTx = txs[0];
  const creationSlot = creationTx.slot;
  console.log(`Creation Slot: ${creationSlot} | Timestamp: ${new Date(creationTx.timestamp * 1000).toISOString()}`);
  console.log(`Creator/FeePayer: ${creationTx.feePayer}`);

  // Analyze buys in early slots (within 10 slots of creation)
  const earlyTxs = txs.filter(t => t.slot <= creationSlot + 15);
  console.log(`Transactions in first 15 slots: ${earlyTxs.length}`);

  const slotGroups = new Map();
  const buyers = new Set();
  let totalSolSpent = 0;

  for (const tx of earlyTxs) {
    const slot = tx.slot;
    if (!slotGroups.has(slot)) slotGroups.set(slot, []);
    slotGroups.get(slot).push(tx);

    if (tx.feePayer) buyers.add(tx.feePayer);

    // Sum native SOL spent
    if (tx.nativeTransfers) {
      for (const transfer of tx.nativeTransfers) {
        if (transfer.fromUserAccount === tx.feePayer) {
          totalSolSpent += (transfer.amount || 0) / 1e9;
        }
      }
    }
  }

  console.log(`Unique Buyers in early slots: ${buyers.size}`);
  console.log(`Total SOL spent in early slots: ${totalSolSpent.toFixed(2)} SOL`);
  console.log(`Slot distribution:`);
  for (const [slot, slotTxList] of slotGroups.entries()) {
    console.log(`  • Slot ${slot}: ${slotTxList.length} txs (Signers: ${slotTxList.map(t => t.feePayer?.slice(0, 4) + '...' + t.feePayer?.slice(-4)).join(', ')})`);
  }
}

async function main() {
  for (const mint of sampleMints) {
    await analyzeTokenLaunch(mint);
  }
}

main();
