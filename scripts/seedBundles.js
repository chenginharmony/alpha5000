require('dotenv').config();
const { scanRecentLaunchesForBundles } = require('../dist/services/bundleDetection');

async function seed() {
  console.log('Scanning recent launches to populate top 5 bundled tokens...');
  const count = await scanRecentLaunchesForBundles();
  console.log(`Scan completed. Discovered and analyzed ${count} tokens.`);
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
