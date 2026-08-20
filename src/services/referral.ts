import { prisma } from '../db';
import { config } from '../config';

const REFERRAL_REWARD_PERCENT = 20.0; // 20% of the platform fee goes to the referrer

export interface ReferralStats {
  referralLink: string;
  shareUrl: string;
  totalReferred: number;
  activeTraders: number;
  totalVolumeUsd: number;
  totalEarningsUsd: number;
  unclaimedEarningsUsd: number;
  payoutWallet: string | null;
}

/**
 * Register or fetch a user in the referral system.
 * Connects the referrer if user joined via /start ref_<referrerChatId>.
 */
export async function getOrCreateReferralUser(
  userChatId: string | number,
  username?: string,
  firstName?: string,
  referrerChatId?: string | number
) {
  const chatIdStr = String(userChatId);
  const referrerStr = referrerChatId ? String(referrerChatId) : undefined;

  let user = await prisma.referralUser.findUnique({
    where: { userChatId: chatIdStr },
  });

  if (!user) {
    let validReferrer: string | undefined = undefined;
    if (referrerStr && referrerStr !== chatIdStr) {
      const refExists = await prisma.referralUser.findUnique({
        where: { userChatId: referrerStr },
      });
      if (refExists) {
        validReferrer = referrerStr;
      }
    }

    try {
      user = await prisma.referralUser.create({
        data: {
          userChatId: chatIdStr,
          username: username || null,
          firstName: firstName || null,
          referredBy: validReferrer || null,
        },
      });
    } catch {
      user = await prisma.referralUser.findUnique({
        where: { userChatId: chatIdStr },
      });
    }
  } else if ((username && user.username !== username) || (firstName && user.firstName !== firstName)) {
    try {
      user = await prisma.referralUser.update({
        where: { userChatId: chatIdStr },
        data: {
          username: username || user.username,
          firstName: firstName || user.firstName,
        },
      });
    } catch {}
  }

  if (!user) {
    user = await prisma.referralUser.findUniqueOrThrow({
      where: { userChatId: chatIdStr },
    });
  }

  return user;
}

/**
 * Get comprehensive referral statistics for a user.
 */
export async function getReferralStats(
  userChatId: string | number,
  botUsername: string = 'Alpha5000Bot'
): Promise<ReferralStats> {
  const chatIdStr = String(userChatId);
  const user = await getOrCreateReferralUser(chatIdStr);

  const referredUsers = await prisma.referralUser.findMany({
    where: { referredBy: chatIdStr },
    include: {
      rewardsGenerated: true,
    },
  });

  const totalReferred = referredUsers.length;
  const activeTraders = referredUsers.filter((u) => u.rewardsGenerated.length > 0).length;

  const totalVolume = referredUsers.reduce((sum, u) => sum + Number(u.totalVolumeUsd || 0), 0);

  const referralLink = `https://t.me/${botUsername}?start=ref_${chatIdStr}`;
  const shareText = encodeURIComponent(
    `🚀 Join me on Alpha5000! Automatically copy top whale traders on Solana with zero delay.\n\nStart here: ${referralLink}`
  );
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${shareText}`;

  return {
    referralLink,
    shareUrl,
    totalReferred,
    activeTraders,
    totalVolumeUsd: totalVolume,
    totalEarningsUsd: Number(user.totalEarningsUsd || 0),
    unclaimedEarningsUsd: Number(user.unclaimedEarningsUsd || 0),
    payoutWallet: user.payoutWallet,
  };
}

/**
 * Record a referral reward when a trade is executed.
 * Splits a percentage (20%) of the platform fee to the referrer.
 */
export async function recordTradeReferralReward(
  tradeId: string,
  traderChatId: string | number,
  tradeVolumeUsd: number,
  feeAmountUsd: number
): Promise<{ rewarded: boolean; rewardAmountUsd?: number; referrerChatId?: string }> {
  const traderStr = String(traderChatId);
  const trader = await prisma.referralUser.findUnique({
    where: { userChatId: traderStr },
  });

  if (!trader) return { rewarded: false };

  // Update trader's total volume
  await prisma.referralUser.update({
    where: { userChatId: traderStr },
    data: {
      totalVolumeUsd: { increment: tradeVolumeUsd },
    },
  });

  if (!trader.referredBy) return { rewarded: false };

  const referrer = await prisma.referralUser.findUnique({
    where: { userChatId: trader.referredBy },
  });

  if (!referrer) return { rewarded: false };

  const rewardAmountUsd = (feeAmountUsd * REFERRAL_REWARD_PERCENT) / 100;

  await prisma.$transaction([
    prisma.referralReward.create({
      data: {
        referrerChatId: referrer.userChatId,
        referredChatId: trader.userChatId,
        tradeId,
        tradeVolumeUsd,
        feeAmountUsd,
        rewardAmountUsd,
        rewardPercent: REFERRAL_REWARD_PERCENT,
      },
    }),
    prisma.referralUser.update({
      where: { userChatId: referrer.userChatId },
      data: {
        totalEarningsUsd: { increment: rewardAmountUsd },
        unclaimedEarningsUsd: { increment: rewardAmountUsd },
      },
    }),
  ]);

  return {
    rewarded: true,
    rewardAmountUsd,
    referrerChatId: referrer.userChatId,
  };
}

/**
 * Update payout Solana wallet for referral commissions.
 */
export async function updatePayoutWallet(userChatId: string | number, walletAddress: string) {
  const chatIdStr = String(userChatId);
  return prisma.referralUser.update({
    where: { userChatId: chatIdStr },
    data: { payoutWallet: walletAddress.trim() },
  });
}
