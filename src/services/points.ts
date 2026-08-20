import { prisma } from '../db';

export type PointsAction =
  | 'WELCOME_BONUS'
  | 'DAILY_CLAIM'
  | 'STREAK_BONUS'
  | 'COPY_TRADE'
  | 'MANUAL_TRADE'
  | 'PROFIT_WIN'
  | 'REFERRAL_JOIN'
  | 'REFERRAL_TRADE'
  | 'VOLUME_MILESTONE';

export interface UserPointsSummary {
  chatId: string;
  username?: string | null;
  firstName?: string | null;
  totalPoints: number;
  tier: string;
  tierBadge: string;
  currentStreak: number;
  canClaimDaily: boolean;
  nextClaimHours: number;
  totalTrades: number;
  totalWins: number;
  totalReferrals: number;
  recentLedger: Array<{
    amount: number;
    action: string;
    description: string | null;
    createdAt: Date;
  }>;
}

export function getTierInfo(points: number): { tier: string; badge: string; nextTierPoints: number; nextTierName: string } {
  if (points >= 10000) {
    return { tier: 'Alpha Legend', badge: '👑', nextTierPoints: 10000, nextTierName: 'MAX' };
  } else if (points >= 5000) {
    return { tier: 'Diamond Whale', badge: '💎', nextTierPoints: 10000, nextTierName: 'Alpha Legend' };
  } else if (points >= 2000) {
    return { tier: 'Gold Whale', badge: '🥇', nextTierPoints: 5000, nextTierName: 'Diamond Whale' };
  } else if (points >= 500) {
    return { tier: 'Silver Whale', badge: '🥈', nextTierPoints: 2000, nextTierName: 'Gold Whale' };
  } else {
    return { tier: 'Bronze Trader', badge: '🥉', nextTierPoints: 500, nextTierName: 'Silver Whale' };
  }
}

/**
 * Get or initialize user points profile
 */
export async function getOrCreateUserPoints(
  userChatId: string | number,
  username?: string,
  firstName?: string
) {
  const chatIdStr = String(userChatId);
  let user = await prisma.userPoints.findUnique({
    where: { userChatId: chatIdStr },
  });

  if (!user) {
    user = await prisma.userPoints.create({
      data: {
        userChatId: chatIdStr,
        username: username || null,
        firstName: firstName || null,
        totalPoints: 0,
        currentStreak: 0,
        tier: 'Bronze Trader',
      },
    });

    // Give welcome bonus (+100 AP)
    await awardPoints(chatIdStr, 'WELCOME_BONUS', 100, '🎉 Welcome bonus for joining Alpha5000');
  }

  return user;
}

/**
 * Award points to a user and record in ledger
 */
export async function awardPoints(
  userChatId: string | number,
  action: PointsAction,
  amount: number,
  description?: string,
  metadata?: any
) {
  const chatIdStr = String(userChatId);
  const user = await prisma.userPoints.findUnique({
    where: { userChatId: chatIdStr },
  });

  if (!user) {
    await prisma.userPoints.create({
      data: {
        userChatId: chatIdStr,
        totalPoints: amount,
        tier: getTierInfo(amount).tier,
      },
    });
  } else {
    const newTotal = user.totalPoints + amount;
    const tierInfo = getTierInfo(newTotal);

    await prisma.userPoints.update({
      where: { userChatId: chatIdStr },
      data: {
        totalPoints: newTotal,
        tier: tierInfo.tier,
      },
    });
  }

  // Create ledger entry
  await prisma.pointsLedger.create({
    data: {
      userChatId: chatIdStr,
      amount,
      action,
      description: description || action,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });

  return amount;
}

/**
 * Claim Daily Login Bonus with streak multipliers
 */
export async function claimDailyBonus(
  userChatId: string | number,
  username?: string,
  firstName?: string
): Promise<{ success: boolean; pointsAwarded: number; streak: number; message: string }> {
  const chatIdStr = String(userChatId);
  const user = await getOrCreateUserPoints(chatIdStr, username, firstName);

  const now = new Date();
  const lastClaim = user.lastDailyClaim ? new Date(user.lastDailyClaim) : null;

  if (lastClaim) {
    const hoursSinceLastClaim = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);

    // Can only claim once every 20 hours
    if (hoursSinceLastClaim < 20) {
      const waitHours = Math.ceil(20 - hoursSinceLastClaim);
      return {
        success: false,
        pointsAwarded: 0,
        streak: user.currentStreak,
        message: `⏳ You already claimed your daily AlphaPoints! Come back in ${waitHours}h.`,
      };
    }

    // Check streak: if claimed within 48 hours, increase streak; else reset to 1
    let newStreak = 1;
    if (hoursSinceLastClaim <= 48) {
      newStreak = (user.currentStreak % 7) + 1; // 1 to 7 cycle
    }

    // Base: 50 AP + (streak - 1) * 10 AP
    const bonus = 50 + (newStreak - 1) * 10;
    const newTotal = user.totalPoints + bonus;
    const tierInfo = getTierInfo(newTotal);

    await prisma.userPoints.update({
      where: { userChatId: chatIdStr },
      data: {
        totalPoints: newTotal,
        currentStreak: newStreak,
        lastDailyClaim: now,
        tier: tierInfo.tier,
      },
    });

    await prisma.pointsLedger.create({
      data: {
        userChatId: chatIdStr,
        amount: bonus,
        action: 'DAILY_CLAIM',
        description: `🎁 Day ${newStreak} Daily Check-in (+${bonus} AP)`,
      },
    });

    return {
      success: true,
      pointsAwarded: bonus,
      streak: newStreak,
      message: `🎉 *Daily Reward Claimed!*\n\n+*${bonus} AlphaPoints*\n🔥 *Day ${newStreak} Streak* (${newStreak}/7)`,
    };
  } else {
    // First daily claim ever
    const newStreak = 1;
    const bonus = 50;
    const newTotal = user.totalPoints + bonus;
    const tierInfo = getTierInfo(newTotal);

    await prisma.userPoints.update({
      where: { userChatId: chatIdStr },
      data: {
        totalPoints: newTotal,
        currentStreak: newStreak,
        lastDailyClaim: now,
        tier: tierInfo.tier,
      },
    });

    await prisma.pointsLedger.create({
      data: {
        userChatId: chatIdStr,
        amount: bonus,
        action: 'DAILY_CLAIM',
        description: `🎁 Day 1 Daily Check-in (+50 AP)`,
      },
    });

    return {
      success: true,
      pointsAwarded: bonus,
      streak: newStreak,
      message: `🎉 *Daily Reward Claimed!*\n\n+*${bonus} AlphaPoints*\n🔥 *Day 1 Streak* (1/7)`,
    };
  }
}

/**
 * Get comprehensive user points summary
 */
export async function getUserPointsSummary(
  userChatId: string | number,
  username?: string,
  firstName?: string
): Promise<UserPointsSummary> {
  const chatIdStr = String(userChatId);
  const user = await getOrCreateUserPoints(chatIdStr, username, firstName);

  const now = new Date();
  const lastClaim = user.lastDailyClaim ? new Date(user.lastDailyClaim) : null;
  let canClaimDaily = true;
  let nextClaimHours = 0;

  if (lastClaim) {
    const hoursSince = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
    if (hoursSince < 20) {
      canClaimDaily = false;
      nextClaimHours = Math.ceil(20 - hoursSince);
    }
  }

  const tierInfo = getTierInfo(user.totalPoints);

  const recentLedger = await prisma.pointsLedger.findMany({
    where: { userChatId: chatIdStr },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  return {
    chatId: chatIdStr,
    username: user.username,
    firstName: user.firstName,
    totalPoints: user.totalPoints,
    tier: tierInfo.tier,
    tierBadge: tierInfo.badge,
    currentStreak: user.currentStreak,
    canClaimDaily,
    nextClaimHours,
    totalTrades: user.totalTrades,
    totalWins: user.totalWins,
    totalReferrals: user.totalReferrals,
    recentLedger: recentLedger.map((l) => ({
      amount: l.amount,
      action: l.action,
      description: l.description,
      createdAt: l.createdAt,
    })),
  };
}

/**
 * Get Points Leaderboard with full rankings and caller position
 */
export async function getPointsLeaderboard(limit: number = 10, currentChatId?: string | number) {
  const topUsers = await prisma.userPoints.findMany({
    orderBy: { totalPoints: 'desc' },
    take: limit,
  });

  const leaders = topUsers.map((u, i) => {
    const tierInfo = getTierInfo(u.totalPoints);
    return {
      rank: i + 1,
      chatId: u.userChatId,
      username: u.username ? `@${u.username}` : (u.firstName || `Trader_${u.userChatId.slice(-4)}`),
      totalPoints: u.totalPoints,
      tier: tierInfo.tier,
      badge: tierInfo.badge,
      streak: u.currentStreak,
      totalTrades: u.totalTrades,
      totalReferrals: u.totalReferrals,
    };
  });

  let userRankInfo: { rank: number; totalPoints: number; tier: string; badge: string; streak: number } | null = null;
  if (currentChatId) {
    const chatIdStr = String(currentChatId);
    const user = await prisma.userPoints.findUnique({ where: { userChatId: chatIdStr } });
    if (user) {
      const higherCount = await prisma.userPoints.count({
        where: { totalPoints: { gt: user.totalPoints } },
      });
      const tierInfo = getTierInfo(user.totalPoints);
      userRankInfo = {
        rank: higherCount + 1,
        totalPoints: user.totalPoints,
        tier: tierInfo.tier,
        badge: tierInfo.badge,
        streak: user.currentStreak,
      };
    }
  }

  return { leaders, userRankInfo };
}
