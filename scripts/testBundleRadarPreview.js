require('dotenv').config();
const { prisma } = require('../dist/db');

async function testRadar() {
  const bundles = await prisma.bundleDetection.findMany({
    orderBy: [{ riskScore: 'desc' }, { createdAt: 'desc' }],
    take: 3,
  });

  console.log('--- 🚨 PREVIEW: AUTO-RANK BUNDLE RADAR ALERT ---');
  let msg = `🚨 LIVE BUNDLE RADAR — Top Ranked Bundled Launches\n\n`;
  msg += `Coordinated insider sniper bundles & Jito clusters detected on Solana:\n\n`;

  for (let i = 0; i < bundles.length; i++) {
    const b = bundles[i];
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    const riskEmoji = b.riskScore >= 80 ? '🟥' : b.riskScore >= 60 ? '🟧' : b.riskScore >= 35 ? '🟨' : '🟢';
    const riskBadge = b.riskScore >= 80 ? '🟥 EXTREME' : b.riskScore >= 60 ? '🟧 HIGH' : b.riskScore >= 35 ? '🟨 MEDIUM' : '🟢 LOW';
    const timeAgo = Math.max(1, Math.round((Date.now() - b.createdAt.getTime()) / (60 * 1000)));

    msg += `${medal} *${riskEmoji} $${b.tokenSymbol || 'TOKEN'}* (\`${b.tokenMint.slice(0, 4)}...${b.tokenMint.slice(-4)}\`)\n`;
    msg += `   ├─ ⚠️ Risk Score: *${b.riskScore}/100* (${riskBadge})\n`;
    msg += `   ├─ 📦 Bundle Size: *${b.walletCount} wallets* | *${Number(b.totalSolSpent).toFixed(1)} SOL*`;
    if (b.totalUsdSpent) msg += ` (~$${Math.round(Number(b.totalUsdSpent)).toLocaleString()})`;
    msg += `\n`;
    msg += `   ├─ 📊 Supply Grabbed: *${Number(b.pctSupplyBought).toFixed(1)}%*\n`;
    msg += `   ├─ 🔗 Funder: ${b.commonFunder ? `\`${b.commonFunder.slice(0, 4)}...${b.commonFunder.slice(-4)}\` (Same Funder)` : 'Mixed Funders'}\n`;
    msg += `   └─ ⏱️ Discovered: _${timeAgo}m ago_\n\n`;
  }

  msg += `🤖 AGENTIC RECOMMENDATION:\n`;
  msg += `💡 Do not ape blindly! Use the 5-Agent AI Swarm Council (/agent) to audit honeypot risks, sentiment, and liquidity before trading.`;

  console.log(msg);
  console.log('\nInteractive Buttons:');
  bundles.slice(0, 3).forEach((b, i) => {
    console.log(`[🔍 #${i + 1} $${b.tokenSymbol}]`);
  });
  console.log('[🤖 AI Swarm Council] [💳 Fund via Coinbase]');
  console.log('[🚨 View All Bundles] [🐋 Whale Tracker]');
}

testRadar().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
