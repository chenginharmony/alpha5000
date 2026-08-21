require('dotenv').config();
const { runSwarmCouncilAnalysis } = require('../dist/services/aiSwarm');

async function testSwarm() {
  console.log('🤖 ========================================');
  console.log('Testing Multi-Agent AI Swarm Council Debate');
  console.log('========================================\n');

  const testTokens = [
    { name: 'Albie (Bundled / High Risk)', mint: '9W8G5PoHCmLq3KktuGTfMMtSHDrJkidyxT4UPHvzpump' },
    { name: 'BONK (Clean / Established)', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
  ];

  for (const t of testTokens) {
    console.log(`\n----------------------------------------`);
    console.log(`Analyzing ${t.name}: ${t.mint}`);
    console.log(`----------------------------------------`);

    const result = await runSwarmCouncilAnalysis(t.mint);

    console.log(`\n🤖 Agent Council: $${result.tokenSymbol} (${result.tokenName})`);
    console.log(`Price: $${result.priceUsd} | Liquidity: $${result.liquidityUsd.toLocaleString()}`);

    console.log('\n--- AGENT DEBATE DIALOGUE ---');
    for (const a of result.agents) {
      const badge = a.vote === 'BUY' ? '🟢' : a.vote === 'CAUTION' ? '🟡' : '🔴';
      console.log(`${a.emoji} ${a.name} ${badge} (${a.score}/100):`);
      console.log(`   "${a.quote}"`);
      if (a.details.length > 0) {
        console.log(`   [Details: ${a.details.join(' | ')}]`);
      }
    }

    console.log('\n--- CONSENSUS DECISION ---');
    console.log(`⚖️ DECISION: ${result.decision} ${result.decisionEmoji} (Score: ${result.consensusScore}/100)`);
    console.log(`💡 Reasoning: ${result.reasoning}`);
    console.log(`🎯 Recommended Size: ${result.recommendedSolSize} SOL (~$${result.recommendedUsdSize.toFixed(2)})`);
    console.log(`⚡ Slippage: ${(result.recommendedSlippageBps / 100).toFixed(1)}% | Jito MEV Tip: ${result.jitoProtection ? 'YES' : 'NO'}`);
  }
}

testSwarm().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
