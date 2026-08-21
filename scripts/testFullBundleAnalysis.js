require('dotenv').config();
const { analyzeTokenBundle, getLatestBundledTokens, scanRecentLaunchesForBundles } = require('../dist/services/bundleDetection');

async function test() {
  console.log('--- Testing Bundle Analysis ---');
  const mint = '9W8G5PoHCmLq3KktuGTfMMtSHDrJkidyxT4UPHvzpump';
  const result = await analyzeTokenBundle(mint);
  console.log('Result for $Albie:', {
    tokenSymbol: result.tokenSymbol,
    bundleType: result.bundleType,
    walletCount: result.walletCount,
    totalSolSpent: result.totalSolSpent,
    pctSupplyBought: result.pctSupplyBought,
    riskScore: result.riskScore,
    riskLevel: result.riskLevel,
    riskEmoji: result.riskEmoji,
    reasons: result.reasons,
    walletsCount: result.wallets.length,
  });

  console.log('\n--- Testing Latest Bundles ---');
  const latest = await getLatestBundledTokens(5);
  console.log(`Retrieved ${latest.length} latest bundled tokens:`);
  latest.forEach((b, i) => {
    console.log(`${i + 1}. $${b.tokenSymbol} - Risk: ${b.riskScore}/100 (${b.riskLevel}) - ${b.walletCount} wallets - ${b.totalSolSpent} SOL - ${b.pctSupplyBought}% supply`);
  });
}

test().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
