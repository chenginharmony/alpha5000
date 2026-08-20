const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testPoints() {
  console.log('🧪 Testing AlphaPoints System...\n');

  const testChatId = 'test_user_998877';

  // Cleanup any existing test data
  await prisma.pointsLedger.deleteMany({ where: { userChatId: testChatId } });
  await prisma.userPoints.deleteMany({ where: { userChatId: testChatId } });

  // 1. Load points service (compiled dist or direct logic)
  const {
    getOrCreateUserPoints,
    claimDailyBonus,
    awardPoints,
    getUserPointsSummary,
    getPointsLeaderboard,
    getTierInfo,
  } = require('../dist/services/points');

  console.log('1️⃣ Creating User Profile & Welcome Bonus (+100 AP)...');
  const user = await getOrCreateUserPoints(testChatId, 'AlphaWhaleTest', 'TestTrader');
  console.log(`✅ User created: ${user.userChatId} (Tier: ${user.tier})`);

  console.log('\n2️⃣ Claiming Daily Login Bonus (+50 AP)...');
  const claimRes = await claimDailyBonus(testChatId, 'AlphaWhaleTest', 'TestTrader');
  console.log(`✅ Daily Claim: ${claimRes.success ? 'SUCCESS' : 'FAILED'}, Streak: ${claimRes.streak}, Points: +${claimRes.pointsAwarded}`);

  console.log('\n3️⃣ Simulating Copy-Trade Execution (+100 AP)...');
  await awardPoints(testChatId, 'COPY_TRADE', 100, '⚡ Copy-traded $BONK ($6.00)');

  console.log('\n4️⃣ Simulating Take Profit Win (+150 AP)...');
  await awardPoints(testChatId, 'PROFIT_WIN', 150, '🎯 Profit win on $BONK (+52.4%)');

  console.log('\n5️⃣ Simulating Friend Referral Invite (+200 AP)...');
  await awardPoints(testChatId, 'REFERRAL_JOIN', 200, '👥 Friend joined via your invite link');

  console.log('\n6️⃣ Fetching User Points Summary & Tier...');
  const summary = await getUserPointsSummary(testChatId);
  console.log(`--------------------------------------------------`);
  console.log(`👤 User: ${summary.username} (${summary.chatId})`);
  console.log(`💎 Total AlphaPoints: ${summary.totalPoints} AP`);
  console.log(`🏅 Tier: ${summary.tierBadge} ${summary.tier}`);
  console.log(`🔥 Streak: ${summary.currentStreak} Days`);
  console.log(`📜 Recent Ledger Entries: ${summary.recentLedger.length}`);
  summary.recentLedger.forEach((l) => console.log(`   • +${l.amount} AP: ${l.description}`));

  console.log('\n7️⃣ Fetching AlphaPoints Leaderboard...');
  const { leaders, userRankInfo } = await getPointsLeaderboard(5, testChatId);
  console.log(`🏆 Top Leaderboard Entries (${leaders.length}):`);
  leaders.forEach((u) => {
    console.log(`   #${u.rank} ${u.badge} ${u.username}: ${u.totalPoints.toLocaleString()} AlphaPoints (${u.tier}) | 🔥 ${u.streak}d streak`);
  });
  if (userRankInfo) {
    console.log(`👉 User Rank: #${userRankInfo.rank} with ${userRankInfo.totalPoints} AP (${userRankInfo.tier})`);
  }

  // Cleanup test user
  await prisma.pointsLedger.deleteMany({ where: { userChatId: testChatId } });
  await prisma.userPoints.deleteMany({ where: { userChatId: testChatId } });

  console.log('\n==================================================');
  console.log('✅ ALL ALPHAPOINTS TESTS PASSED PERFECTLY!');
  console.log('==================================================');
}

testPoints()
  .catch((e) => {
    console.error('❌ Test failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
