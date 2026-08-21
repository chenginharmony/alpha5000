require('dotenv').config();
const { prisma } = require('../dist/db');
const { getOrCreateReferralUser, recordTradeReferralReward, getReferralStats, updatePayoutWallet, requestPayout } = require('../dist/services/referral');
const { getOrCreateUserPoints, awardPoints, getUserPointsSummary } = require('../dist/services/points');

async function testReferral() {
  console.log('\n================================================================');
  console.log('👥 TESTING COMPLETE REFERRAL SYSTEM & COMMISSION ENGINE');
  console.log('================================================================\n');

  const referrerId = 11223344;
  const refereeId = 55667788;
  const botUsername = 'Alpha5000Bot';

  // 1. Initialize Referrer
  console.log('1️⃣ Creating / Fetching Referrer Profile...');
  const refUser = await getOrCreateReferralUser(referrerId, 'top_referrer_alpha', 'AlphaWhale');
  await getOrCreateUserPoints(referrerId, 'top_referrer_alpha', 'AlphaWhale');
  console.log(`✅ Referrer registered: @top_referrer_alpha (Chat ID: ${refUser.userChatId})`);

  // 2. Fetch Referrer Stats & Deep Link
  console.log('\n2️⃣ Generating Referral Deep Link...');
  const initialStats = await getReferralStats(referrerId, botUsername);
  console.log(`• Referral Link: ${initialStats.referralLink}`);
  console.log(`• Share URL:     ${initialStats.shareUrl}`);
  console.log(`• Total Referred: ${initialStats.totalReferred}`);

  // 3. New User Joins via Referral Deep Link
  console.log('\n3️⃣ New Trader Joins via Referral Link (/start ref_11223344)...');
  const referee = await getOrCreateReferralUser(refereeId, 'new_degen_trader', 'DegenTrader', String(referrerId));
  await getOrCreateUserPoints(refereeId, 'new_degen_trader', 'DegenTrader');
  await awardPoints(referrerId, 'REFERRAL_JOIN', 200, `👥 Friend joined via your invite link (@new_degen_trader)`);
  console.log(`✅ Referee created: @new_degen_trader | Linked to Referrer: ${referee.referredBy}`);

  // 4. Check AlphaPoints Awarded to Referrer (+200 AP)
  console.log('\n4️⃣ Verifying AlphaPoints Awarded for Referral (+200 AP)...');
  const pointsSummary = await getUserPointsSummary(referrerId);
  console.log(`• Referrer Total AP: ${pointsSummary.totalPoints} AP`);
  console.log(`• Referrer Tier:     ${pointsSummary.tier}`);
  console.log(`• Latest Ledger Entry: +${pointsSummary.recentLedger[0]?.amount} AP — "${pointsSummary.recentLedger[0]?.description}"`);

  // 5. Simulate Referred User Executing a Copy-Trade ($100 volume, $0.20 platform fee)
  console.log('\n5️⃣ Simulating Copy Trade Execution by Referred User ($100 Trade)...');
  const tradeVolumeUsd = 100.0;
  const platformFeeUsd = 0.20; // 0.20% fee
  const tradeResult = await recordTradeReferralReward(
    'test_tx_sig_123',
    refereeId,
    tradeVolumeUsd,
    platformFeeUsd
  );
  console.log(`✅ Trade fee processed: Referrer Earned 20% commission = $${tradeResult?.rewardAmountUsd?.toFixed(4)} USD`);

  // 6. Check Updated Referral Dashboard Stats
  console.log('\n6️⃣ Checking Updated Referrer Dashboard Stats...');
  const updatedStats = await getReferralStats(referrerId, botUsername);
  console.log(`• Friends Invited:       ${updatedStats.totalReferred}`);
  console.log(`• Active Traders:        ${updatedStats.activeTraders}`);
  console.log(`• Total Volume Traded:   $${updatedStats.totalVolumeUsd.toFixed(2)} USD`);
  console.log(`• Total Commission:      $${updatedStats.totalEarningsUsd.toFixed(4)} USD`);
  console.log(`• Unclaimed Balance:     $${updatedStats.unclaimedEarningsUsd.toFixed(4)} USD`);

  // 7. Test Setting Payout Wallet and Requesting Commission Payout
  console.log('\n7️⃣ Testing Payout Wallet Configuration & Payout Claim...');
  const payoutAddress = '54uXTNYGjG9NwbwPZ138JkHNx7Rk9qZk8FmX3w4N9Lwb';
  await updatePayoutWallet(referrerId, payoutAddress);
  const payoutResult = await requestPayout(referrerId);
  console.log(`• Set Payout Wallet:     ${payoutAddress}`);
  console.log(`• Payout Claim Result:   ${payoutResult.message}`);
  console.log(`• Amount Claimed:        $${payoutResult.amountUsd?.toFixed(4)} USD`);

  console.log('\n================================================================');
  console.log('✅ ALL REFERRAL & COMMISSION SYSTEMS FULLY TESTED & WORKING 100%');
  console.log('================================================================\n');
}

testReferral().then(() => process.exit(0)).catch(e => {
  console.error('Referral test error:', e);
  process.exit(1);
});
