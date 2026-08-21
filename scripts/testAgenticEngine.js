require('dotenv').config();
const { getCdpAgentStatus, generateAgentOnrampLink, evaluateAgenticOpportunity } = require('../dist/services/coinbaseAgent');

async function main() {
  console.log('--- 🤖 Testing Alpha5000 Coinbase CDP Agentic Engine ---');
  const status = getCdpAgentStatus();
  console.log('CDP Status:', status);

  const testWallet = '54uXTNYGjG9NwbwPZ138JkHNx7Rk9qZk8FmX3w4N9Lwb';
  const onramp = generateAgentOnrampLink(testWallet, 50);
  console.log('\nAgentic Onramp URL:', onramp);

  console.log('\n--- Evaluating Agentic Opportunity on $Albie ---');
  const plan = await evaluateAgenticOpportunity(
    '9W8G5PoHCmLq3KktuGTfMMtSHDrJkidyxT4UPHvzpump',
    'Albie',
    0.05
  );
  console.log('Agentic Plan:', plan);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
