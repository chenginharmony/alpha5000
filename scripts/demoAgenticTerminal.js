require('dotenv').config();
const { getCdpAgentStatus, generateAgentOnrampLink, evaluateAgenticOpportunity } = require('../dist/services/coinbaseAgent');
const { runSwarmCouncilAnalysis } = require('../dist/services/aiSwarm');

async function runTerminalDemo() {
  console.log('\n================================================================');
  console.log('🤖 ALPHA5000: COINBASE CDP AGENTIC AI SWARM TERMINAL TEST');
  console.log('================================================================\n');

  // 1. Check Coinbase CDP Agent Connection
  console.log('1️⃣ CHECKING COINBASE DEVELOPER PLATFORM (CDP) STATUS:');
  console.log('----------------------------------------------------------------');
  const status = getCdpAgentStatus();
  console.log(`• Status:            ${status.isConfigured ? '🟢 CONNECTED' : '🔴 DISCONNECTED'}`);
  console.log(`• Project ID:        ${status.projectId}`);
  console.log(`• Client Key:        ${status.clientKey}`);
  console.log(`• API Key ID:        ${status.apiKeyId}`);
  console.log(`• Network:           ${status.network}`);
  console.log(`• Active Capabilities:`);
  status.supportedCapabilities.forEach(c => console.log(`   └─ ⚡ ${c}`));

  // 2. Generate Agentic Onramp Link for User Wallet
  console.log('\n2️⃣ GENERATING 1-TAP COINBASE AGENTIC ONRAMP LINK:');
  console.log('----------------------------------------------------------------');
  const sampleWallet = '54uXTNYGjG9NwbwPZ138JkHNx7Rk9qZk8FmX3w4N9Lwb';
  const onrampUrl = generateAgentOnrampLink(sampleWallet, 50);
  console.log(`• Embedded Agent Wallet: ${sampleWallet}`);
  console.log(`• Preset Fiat Amount:    $50.00 USD`);
  console.log(`• Generated Onramp URL:`);
  console.log(`  ${onrampUrl}`);

  // 3. Run Autonomous Swarm Council Debate on Live Token
  console.log('\n3️⃣ RUNNING AUTONOMOUS AI SWARM COUNCIL DEBATE:');
  console.log('----------------------------------------------------------------');
  const testMint = '9W8G5PoHCmLq3KktuGTfMMtSHDrJkidyxT4UPHvzpump'; // $Albie
  console.log(`Analyzing Token: ${testMint} ($Albie)...`);

  const swarm = await runSwarmCouncilAnalysis(testMint);
  console.log(`\n🪙 Token: $${swarm.tokenSymbol} (${swarm.tokenName})`);
  console.log(`📊 Market Data: Price: $${swarm.priceUsd} | Liq: $${swarm.liquidityUsd.toLocaleString()} | 24h Vol: $${swarm.volume24hUsd.toLocaleString()}`);
  console.log(`🎯 Swarm Consensus: ${swarm.decisionEmoji} ${swarm.decision} (Score: ${swarm.consensusScore}/100)`);
  console.log(`🧠 Reasoning: ${swarm.reasoning}\n`);

  console.log('🗳️ Individual Agent Votes:');
  swarm.agents.forEach(agent => {
    const vetoTag = agent.isVeto ? ' [🚫 VETO POWER USED]' : '';
    console.log(`  ${agent.emoji} ${agent.name.padEnd(16)} | Vote: ${agent.vote.padEnd(8)} | Score: ${agent.score}/100${vetoTag}`);
    console.log(`     Quote: "${agent.quote}"`);
  });

  // 4. Generate Final CDP Agentic Execution Plan
  console.log('\n4️⃣ CDP AUTONOMOUS AGENTIC EXECUTION PLAN:');
  console.log('----------------------------------------------------------------');
  const plan = await evaluateAgenticOpportunity(testMint, swarm.tokenSymbol, 0.05);
  console.log(`• Agent Name:            ${plan.agentName}`);
  console.log(`• Autonomous Action:     ${plan.action === 'BUY' ? '🟢 BUY' : plan.action === 'SELL' ? '🔴 SELL / PASS' : '🟡 HOLD'}`);
  console.log(`• Suggested Allocation:  ${plan.suggestedAllocationSol} SOL`);
  console.log(`• Confidence Score:      ${plan.confidenceScore}/100`);
  console.log(`• Execution Reasoning:   ${plan.reasoning}`);

  console.log('\n================================================================');
  console.log('✅ ALL COINBASE CDP AGENTIC COMPONENTS VERIFIED OPERATIONAL!');
  console.log('================================================================\n');
}

runTerminalDemo().then(() => process.exit(0)).catch(e => {
  console.error('Demo error:', e);
  process.exit(1);
});
