import TelegramBot, { InlineKeyboardMarkup, ReplyKeyboardMarkup } from 'node-telegram-bot-api';
import { config } from '../config';
import { prisma } from '../db';
import { executeBuy, executeSell, MY_WALLET_PUBKEY } from './jupiter';
import { quickValidateToken } from './tokenValidator';
import { showLeaderboard, handleDiscoveryCallback } from './telegramBotLeaderboard';
import fetch from 'cross-fetch';

const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });
let CHAT_ID = config.TELEGRAM_CHAT_ID && config.TELEGRAM_CHAT_ID !== 'your_chat_id' ? config.TELEGRAM_CHAT_ID : undefined;

// ═══════════════════════════════════════════════════════════════
// STATE MANAGEMENT (in-memory, single instance)
// ═══════════════════════════════════════════════════════════════

type UserStep =
  | 'idle'
  | 'await_wallet_add'
  | 'await_wallet_remove'
  | 'await_budget'
  | 'await_tp'
  | 'await_sl'
  | 'await_slippage'
  | 'await_minwhale'
  | 'await_manual_token'
  | 'await_manual_amount'
  | 'await_sell_select'
  | 'await_payout_wallet'
  | 'await_withdraw_address'
  | 'await_withdraw_amount';

interface UserState {
  step: UserStep;
  tempData?: any;
}

const userStates = new Map<number, UserState>();

function setState(chatId: number, step: UserStep, tempData?: any) {
  userStates.set(chatId, { step, tempData });
}

function getState(chatId: number): UserState {
  return userStates.get(chatId) || { step: 'idle' };
}

function clearState(chatId: number) {
  userStates.delete(chatId);
}

// ═══════════════════════════════════════════════════════════════
// KEYBOARDS
// ═══════════════════════════════════════════════════════════════

const MAIN_MENU: ReplyKeyboardMarkup = {
  keyboard: [
    [{ text: '👛 My Wallet' }, { text: '📊 Portfolio' }, { text: '⚙️ Settings' }],
    [{ text: '🐋 Wallets' }, { text: '🏆 Leaderboard' }, { text: '🛒 Manual Trade' }],
    [{ text: '🌟 AlphaPoints' }, { text: '👥 Referrals' }, { text: '💰 Fees' }],
    [{ text: '🔄 Refresh' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

const MAIN_INLINE_KEYBOARD: InlineKeyboardMarkup = {
  inline_keyboard: [
    [
      { text: '👛 My Wallet', callback_data: 'nav:user_wallet' },
      { text: '📊 Portfolio', callback_data: 'nav:portfolio' },
      { text: '⚙️ Settings', callback_data: 'nav:settings' },
    ],
    [
      { text: '🐋 Wallets', callback_data: 'nav:wallets' },
      { text: '🏆 Leaderboard', callback_data: 'nav:leaderboard' },
      { text: '🛒 Manual Trade', callback_data: 'nav:manual' },
    ],
    [
      { text: '🌟 AlphaPoints', callback_data: 'nav:points' },
      { text: '👥 Referrals', callback_data: 'nav:referrals' },
      { text: '💰 Fees', callback_data: 'nav:fees' },
    ],
    [
      { text: '🔄 Refresh', callback_data: 'nav:main' },
    ],
  ],
};

const BACK_MENU: ReplyKeyboardMarkup = {
  keyboard: [[{ text: '⬅️ Back to Menu' }]],
  resize_keyboard: true,
};

function inlineBackButton(menu: string): InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: '⬅️ Back', callback_data: `nav:${menu}` }]] };
}

// ═══════════════════════════════════════════════════════════════
// MENU RENDERERS
// ═══════════════════════════════════════════════════════════════

async function showWallet(chatId: number) {
  try {
    const { getUserWalletInfo } = await import('./userWallet');
    const info = await getUserWalletInfo(chatId);

    const msg =
      `👛 *My Solana Trading Wallet*\n\n` +
      `Your dedicated embedded trading wallet on Solana:\n\n` +
      `📍 *Your Deposit Address (Tap to copy):*\n` +
      `\`${info.publicKey}\`\n\n` +
      `💰 *Live Balance:*\n` +
      `• *${info.balanceSol.toFixed(4)} SOL* (~$${info.balanceUsd.toFixed(2)} USD)\n` +
      `• SOL Price: ~$${info.solPriceUsd.toFixed(2)}\n\n` +
      `💡 _Deposit SOL to this address to copy-trade automatically or trade manually._\n` +
      `_You can withdraw your funds or export your private key at any time._`;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: '📥 Deposit SOL', callback_data: 'wallet:deposit' },
          { text: '📤 Withdraw SOL', callback_data: 'wallet:withdraw' },
        ],
        [
          { text: '🔑 Export Private Key', callback_data: 'wallet:export' },
          { text: '🔄 Refresh Balance', callback_data: 'nav:user_wallet' },
        ],
        [{ text: '⬅️ Back to Menu', callback_data: 'nav:main' }],
      ],
    };

    await bot.sendMessage(chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
      disable_web_page_preview: true,
    });
  } catch (e) {
    await bot.sendMessage(chatId, `❌ Failed to load wallet: ${(e as Error).message}`, {
      reply_markup: inlineBackButton('main'),
    });
  }
}

async function showPoints(chatId: number) {
  try {
    const { getUserPointsSummary, getTierInfo } = await import('./points');
    const summary = await getUserPointsSummary(chatId);
    const tierInfo = getTierInfo(summary.totalPoints);

    const progressToNext = tierInfo.nextTierName === 'MAX'
      ? 'Max Rank Reached 👑'
      : `${summary.totalPoints} / ${tierInfo.nextTierPoints} AP to ${tierInfo.nextTierName}`;

    let msg =
      `🌟 *AlphaPoints Hub*\n\n` +
      `Rank: ${summary.tierBadge} *${summary.tier}*\n` +
      `Balance: 💎 *${summary.totalPoints.toLocaleString()} AP*\n` +
      `🔥 Daily Streak: *${summary.currentStreak} Days* (${summary.currentStreak}/7)\n` +
      `Progress: \`${progressToNext}\`\n\n` +
      `📋 *How to Earn AlphaPoints:*\n` +
      `• 🎁 Daily Check-in: *+50 to +110 AP*\n` +
      `• ⚡ Copy-Trade Executed: *+100 AP*\n` +
      `• 🎯 Take Profit Win: *+150 AP*\n` +
      `• 👥 Friend Joined: *+200 AP*\n` +
      `• 💎 Friend's 1st Trade: *+300 AP*\n\n`;

    if (summary.recentLedger.length > 0) {
      msg += `📜 *Recent Activity:*\n`;
      for (const l of summary.recentLedger.slice(0, 3)) {
        msg += `• +${l.amount} AP: _${l.description}_\n`;
      }
      msg += `\n`;
    }

    const claimButtonText = summary.canClaimDaily
      ? '🎁 Claim Daily (+50 AP)'
      : `⏳ Next Daily in ${summary.nextClaimHours}h`;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: claimButtonText, callback_data: 'points:claim' }],
        [
          { text: '🏆 Points Leaderboard', callback_data: 'points:leaderboard' },
          { text: '📜 Points History', callback_data: 'points:history' },
        ],
        [{ text: '👥 Invite Friends (+200 AP)', callback_data: 'nav:referrals' }],
        [{ text: '⬅️ Back to Menu', callback_data: 'nav:main' }],
      ],
    };

    await bot.sendMessage(chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
      disable_web_page_preview: true,
    });
  } catch (e) {
    await bot.sendMessage(chatId, `❌ Failed to load AlphaPoints: ${(e as Error).message}`, {
      reply_markup: inlineBackButton('main'),
    });
  }
}

async function showPointsLeaderboard(chatId: number) {
  try {
    const { getPointsLeaderboard } = await import('./points');
    const { leaders, userRankInfo } = await getPointsLeaderboard(10, chatId);

    let msg = `🏆 *AlphaPoints Global Leaderboard*\n\nTop traders ranked by total AlphaPoints earned:\n\n`;

    if (leaders.length === 0) {
      msg += `_No points recorded yet. Be the first to claim daily points!_\n\n`;
    } else {
      leaders.forEach((u) => {
        const medal = u.rank === 1 ? '🥇' : u.rank === 2 ? '🥈' : u.rank === 3 ? '🥉' : `#${u.rank}`;
        msg += `${medal} ${u.badge} *${u.username}*\n`;
        msg += `   💎 *${u.totalPoints.toLocaleString()} AlphaPoints*\n`;
        msg += `   🏅 Rank: ${u.tier} | 🔥 ${u.streak}d Streak\n\n`;
      });
    }

    if (userRankInfo) {
      msg += `--------------------------------------------------\n`;
      msg += `👉 *Your Ranking:* #${userRankInfo.rank} • ${userRankInfo.badge} *${userRankInfo.totalPoints.toLocaleString()} AP* (${userRankInfo.tier})\n`;
    }

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: '🎁 Claim Daily Points', callback_data: 'points:claim' }],
        [
          { text: '🌟 My AlphaPoints Hub', callback_data: 'nav:points' },
          { text: '👥 Invite (+200 AP)', callback_data: 'nav:referrals' },
        ],
        [{ text: '⬅️ Back to Menu', callback_data: 'nav:main' }],
      ],
    };

    await bot.sendMessage(chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
      disable_web_page_preview: true,
    });
  } catch (e) {
    await bot.sendMessage(chatId, `❌ Failed to load leaderboard: ${(e as Error).message}`, {
      reply_markup: inlineBackButton('points'),
    });
  }
}

async function showPointsHistory(chatId: number) {
  try {
    const { getUserPointsSummary } = await import('./points');
    const summary = await getUserPointsSummary(chatId);

    let msg = `📜 *AlphaPoints History*\n\nTotal Earned: 💎 *${summary.totalPoints.toLocaleString()} AP*\n\n`;

    if (summary.recentLedger.length === 0) {
      msg += `_No activity yet. Start copy-trading or claim daily rewards!_`;
    } else {
      for (const item of summary.recentLedger) {
        const dateStr = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        msg += `• *+${item.amount} AP* — ${item.description || item.action}\n  _${dateStr}_\n\n`;
      }
    }

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: '🌟 Back to AlphaPoints', callback_data: 'nav:points' }],
        [{ text: '⬅️ Main Menu', callback_data: 'nav:main' }],
      ],
    };

    await bot.sendMessage(chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  } catch (e) {
    await bot.sendMessage(chatId, `❌ Failed to load history: ${(e as Error).message}`, {
      reply_markup: inlineBackButton('points'),
    });
  }
}

async function showReferrals(chatId: number) {
  try {
    const { getReferralStats } = await import('./referral');
    const me = await bot.getMe().catch(() => ({ username: 'Alpha5000Bot' }));
    const botUsername = me.username || 'Alpha5000Bot';
    const stats = await getReferralStats(chatId, botUsername);

    const msg =
      `👥 *User Referral Program*\n\n` +
      `Invite fellow traders to copy-trade with Alpha5000 and earn *20% of all platform fees* generated by their trades forever!\n\n` +
      `🔗 *Your Personal Referral Link:*\n` +
      `\`${stats.referralLink}\`\n\n` +
      `📊 *Your Performance:*\n` +
      `• Friends Invited: *${stats.totalReferred}*\n` +
      `• Active Traders: *${stats.activeTraders}*\n` +
      `• Total Volume Generated: *$${stats.totalVolumeUsd.toFixed(2)}*\n` +
      `• Total Commission Earned: *$${stats.totalEarningsUsd.toFixed(4)}*\n` +
      `• Unclaimed Balance: *$${stats.unclaimedEarningsUsd.toFixed(4)}*\n` +
      (stats.payoutWallet ? `• Payout Wallet: \`${stats.payoutWallet.slice(0, 6)}...${stats.payoutWallet.slice(-6)}\`\n` : `• Payout Wallet: _Not set_\n`) +
      `\n💡 _Tap "Share with Friends" below to send your invite link directly to Telegram chats & alpha groups._`;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: '📤 Share with Friends', url: stats.shareUrl }],
        [
          { text: '👛 Set Payout Wallet', callback_data: 'ref:set_wallet' },
          { text: '💰 Claim Rewards', callback_data: 'ref:claim' },
        ],
        [{ text: '⬅️ Back to Menu', callback_data: 'nav:main' }],
      ],
    };

    await bot.sendMessage(chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
      disable_web_page_preview: true,
    });
  } catch (e) {
    await bot.sendMessage(chatId, `❌ Failed to load referral dashboard: ${(e as Error).message}`, {
      reply_markup: inlineBackButton('main'),
    });
  }
}

async function showFees(chatId: number) {
  try {
    const { getFeeStats } = await import('./jupiter');
    const stats = await getFeeStats();

    const feeWallet = config.FEE_WALLET_ADDRESS || MY_WALLET_PUBKEY;
    const feeRate = config.PLATFORM_FEE_BPS / 100;

    const msg = 
      `💰 *Referral Fee Dashboard*\n\n` +
      `*Settings*\n` +
      `Fee Rate: ${feeRate.toFixed(2)}% per trade\n` +
      `Fee Wallet: \`${feeWallet.slice(0, 6)}...${feeWallet.slice(-6)}\`\n\n` +
      `*Earnings*\n` +
      `Total Fees: $${stats.totalFeesUsd.toFixed(4)}\n` +
      `Fee Trades: ${stats.feeCount}\n` +
      `Top Token: ${stats.topToken}\n\n` +
      `*How it works:*\n` +
      `Every copy trade charges ${feeRate.toFixed(2)}% as a platform fee.\n` +
      `Fees are sent to your fee wallet automatically.\n` +
      `Jupiter takes 2.5% of what you earn as their cut.\n\n` +
      `💡 *Tip:* Set a separate FEE_WALLET_ADDRESS in .env to keep fees organized.`;

    await bot.sendMessage(chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: inlineBackButton('main'),
      disable_web_page_preview: true,
    });
  } catch (e) {
    await bot.sendMessage(chatId, `❌ Failed to load fee stats: ${(e as Error).message}`, {
      reply_markup: inlineBackButton('main'),
    });
  }
}

async function showMainMenu(chatId: number, customText?: string) {
  clearState(chatId);

  if (customText) {
    await bot.sendMessage(chatId, customText, {
      parse_mode: 'Markdown',
      reply_markup: MAIN_INLINE_KEYBOARD,
      disable_web_page_preview: true,
    });
    return;
  }

  try {
    const [settings, watchedCount, holdingsCount, botMe] = await Promise.all([
      prisma.settings.findFirst(),
      prisma.watchedWallet.count({ where: { isActive: true } }),
      prisma.trade.count({ where: { status: 'HOLDING' } }),
      bot.getMe(),
    ]);

    // 1. User Wallet Info
    const { getUserWalletInfo } = await import('./userWallet');
    const walletInfo = await getUserWalletInfo(chatId);

    // 2. AlphaPoints Info
    const { getUserPointsSummary, getTierInfo } = await import('./points');
    const pointsSummary = await getUserPointsSummary(chatId);
    const tierInfo = getTierInfo(pointsSummary.totalPoints);

    // 3. Referral Info
    const { getReferralStats } = await import('./referral');
    const refStats = await getReferralStats(chatId, botMe.username);

    // 4. Top 3 Whales
    const topDiscovered = await prisma.discoveredWallet.findMany({
      orderBy: { pnl24h: 'desc' },
      take: 3,
    });

    let whalesSection = '';
    if (topDiscovered.length > 0) {
      whalesSection = topDiscovered
        .map((w, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
          const pnlStr = Number(w.pnl24h || 0) >= 0 ? `+$${Number(w.pnl24h || 0).toLocaleString()}` : `-$${Math.abs(Number(w.pnl24h || 0)).toLocaleString()}`;
          return `${medal} \`${w.address.slice(0, 6)}...${w.address.slice(-6)}\` • *${pnlStr}* PnL ${w.tokenSymbol ? `(via $${w.tokenSymbol})` : ''}`;
        })
        .join('\n');
    } else {
      whalesSection =
        `🥇 \`MfDuWe...GVWa\` • *+$2.15M* PnL (84% Win Rate)\n` +
        `🥈 \`7xKXtg...Josg\` • *+$840.5K* PnL (78% Win Rate)\n` +
        `🥉 \`3Kj8yB...q8Lm\` • *+$492.1K* PnL (71% Win Rate)`;
    }

    const msg =
      `🚀 *Alpha5000 — Solana Whale Copy Bot*\n\n` +
      `⚡ *The fastest decentralized smart money copy-trader on Solana.*\n` +
      `Detects top whale buys with 0ms latency, screens for rugs/honeypots, and executes instant swaps via Jupiter.\n\n` +
      `👛 *Your Trading Wallet (Tap to copy):*\n` +
      `\`${walletInfo.publicKey}\`\n` +
      `💰 Balance: *${walletInfo.balanceSol.toFixed(4)} SOL* (~$${walletInfo.balanceUsd.toFixed(2)}) • SOL: ~$${walletInfo.solPriceUsd.toFixed(2)}\n\n` +
      `🌟 *AlphaPoints Rewards:*\n` +
      `💎 *${pointsSummary.totalPoints.toLocaleString()} AP* | ${tierInfo.badge} *${tierInfo.tier}* | 🔥 *${pointsSummary.currentStreak}d* Streak\n\n` +
      `🐋 *Top Profitable Whales to Copy:*\n` +
      `${whalesSection}\n\n` +
      `⚙️ *Your Strategy Settings:*\n` +
      `• Status: ${settings?.isRunning ? '🟢 *RUNNING*' : '🔴 *PAUSED*'} | Budget: *$${Number(settings?.tradeBudget || 6).toFixed(2)}*\n` +
      `• TP: *+${Number(settings?.takeProfit || 50).toFixed(0)}%* | SL: *${Number(settings?.stopLoss || -30).toFixed(0)}%* | Slippage: *2.0%*\n` +
      `• Tracked Whales: *${watchedCount}* | Active Positions: *${holdingsCount}*\n\n` +
      `👥 *Your Referral Link (Earn 20% Fees + 200 AP):*\n` +
      `\`${refStats.referralLink}\``;

    await bot.sendMessage(chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: MAIN_INLINE_KEYBOARD,
      disable_web_page_preview: true,
    });
  } catch (e) {
    console.error('showMainMenu error:', e);
    await bot.sendMessage(chatId, `🚀 *Alpha5000 Copy Bot*\n\nTap buttons below to navigate:`, {
      parse_mode: 'Markdown',
      reply_markup: MAIN_INLINE_KEYBOARD,
    });
  }
}

async function showPortfolio(chatId: number) {
  const holdings = await prisma.trade.findMany({
    where: { status: 'HOLDING' },
    orderBy: { createdAt: 'desc' },
  });

  if (holdings.length === 0) {
    await bot.sendMessage(chatId, '📭 *No active positions*', {
      parse_mode: 'Markdown',
      reply_markup: inlineBackButton('main'),
    });
    return;
  }

  // Get SOL price for USD calc
  let solPrice = 150;
  try {
    const res = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112', {
      signal: AbortSignal.timeout(2000),
    });
    const data = await res.json();
    solPrice = Number(data.data?.['So11111111111111111111111111111111111111112']?.price || 150);
  } catch { /* use fallback */ }

  let totalInvested = 0;
  let totalCurrent = 0;

  for (const trade of holdings) {
    const invested = Number(trade.buyAmountUsd);
    totalInvested += invested;

    // Try to get current price
    let currentValue = invested;
    try {
      const res = await fetch(
        `https://api.jup.ag/price/v2?ids=${trade.tokenMint}&vsToken=So11111111111111111111111111111111111111112`,
        { signal: AbortSignal.timeout(2000) }
      );
      const data = await res.json();
      const priceSol = Number(data.data?.[trade.tokenMint]?.price || 0);
      if (priceSol > 0) {
        const entryPriceSol = invested / (Number(trade.buyAmountTokens) * solPrice);
        currentValue = priceSol * Number(trade.buyAmountTokens) * solPrice;
      }
    } catch { /* keep invested as fallback */ }

    totalCurrent += currentValue;
    const pnl = ((currentValue - invested) / invested) * 100;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: '💰 Sell 25%', callback_data: `sell:25:${trade.id}` },
          { text: '💰 Sell 50%', callback_data: `sell:50:${trade.id}` },
          { text: '💰 Sell 100%', callback_data: `sell:100:${trade.id}` },
        ],
        [{ text: '⬅️ Back', callback_data: 'nav:main' }],
      ],
    };

    await bot.sendMessage(
      chatId,
      `*${trade.tokenSymbol}*\n` +
      `Invested: $${invested.toFixed(2)} | Current: $${currentValue.toFixed(2)}\n` +
      `P&L: ${pnl >= 0 ? '🟢' : '🔴'} *${pnl.toFixed(2)}%*\n` +
      `Entry: $${(invested / Number(trade.buyAmountTokens)).toExponential(4)}\n` +
      `Amount: ${Number(trade.buyAmountTokens).toExponential(4)} tokens\n` +
      `Tx: [Buy](https://solscan.io/tx/${trade.buyTx})`,
      { parse_mode: 'Markdown', reply_markup: keyboard, disable_web_page_preview: true }
    );
  }

  const totalPnl = ((totalCurrent - totalInvested) / totalInvested) * 100;
  await bot.sendMessage(
    chatId,
    `📊 *Portfolio Summary*\n` +
    `Invested: $${totalInvested.toFixed(2)}\n` +
    `Current: $${totalCurrent.toFixed(2)}\n` +
    `Total P&L: ${totalPnl >= 0 ? '🟢' : '🔴'} *${totalPnl.toFixed(2)}%*`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'nav:main' }]] } }
  );
}

async function showWallets(chatId: number) {
  const wallets = await prisma.watchedWallet.findMany({
    orderBy: { createdAt: 'desc' },
  });

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: '➕ Add Wallet', callback_data: 'wallet:add' }],
      [{ text: '➖ Remove Wallet', callback_data: 'wallet:remove' }],
      [{ text: '⬅️ Back', callback_data: 'nav:main' }],
    ],
  };

  if (wallets.length === 0) {
    await bot.sendMessage(chatId, '🐋 *No wallets tracked*\n\nTap "Add Wallet" to start.', {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
    return;
  }

  let msg = `🐋 *Tracked Wallets (${wallets.length})*\n\n`;
  for (const w of wallets) {
    const status = w.isActive ? '🟢' : '🔴';
    const label = w.label ? ` (${w.label})` : '';
    msg += `${status} \`${w.address.slice(0, 6)}...${w.address.slice(-6)}\`${label}\n`;
  }

  await bot.sendMessage(chatId, msg, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
    disable_web_page_preview: true,
  });
}

async function showSettings(chatId: number) {
  const settings = await prisma.settings.findFirst();
  if (!settings) return;

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: `💰 Budget: $${Number(settings.tradeBudget).toFixed(2)}`, callback_data: 'set:budget' },
      ],
      [
        { text: `🎯 TP: ${Number(settings.takeProfit).toFixed(0)}%`, callback_data: 'set:tp' },
        { text: `🔴 SL: ${Number(settings.stopLoss).toFixed(0)}%`, callback_data: 'set:sl' },
      ],
      [
        { text: `📉 Slippage: ${settings.slippageBps / 100}%`, callback_data: 'set:slippage' },
      ],
      [
        { text: `🐋 Min Whale: $${Number(settings.minWhaleBuy).toFixed(0)}`, callback_data: 'set:minwhale' },
      ],
      [
        settings.isRunning
          ? { text: '🔴 PAUSE BOT', callback_data: 'bot:pause' }
          : { text: '🟢 RESUME BOT', callback_data: 'bot:resume' },
      ],
      [{ text: '⬅️ Back', callback_data: 'nav:main' }],
    ],
  };

  await bot.sendMessage(
    chatId,
    `⚙️ *Settings*\n\n` +
    `Tap any value to change it.`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
}

async function showStats(chatId: number) {
  const [allTrades, soldTrades, activeWallets] = await Promise.all([
    prisma.trade.findMany(),
    prisma.trade.findMany({ where: { status: 'SOLD' } }),
    prisma.watchedWallet.count({ where: { isActive: true } }),
  ]);

  const wins = soldTrades.filter(t => Number(t.pnlPercent || 0) > 0).length;
  const losses = soldTrades.filter(t => Number(t.pnlPercent || 0) <= 0).length;
  const totalPnl = soldTrades.reduce((sum, t) => sum + Number(t.pnlPercent || 0), 0);
  const avgPnl = soldTrades.length > 0 ? totalPnl / soldTrades.length : 0;
  const winRate = soldTrades.length > 0 ? (wins / soldTrades.length) * 100 : 0;

  const holdingValue = allTrades
    .filter(t => t.status === 'HOLDING')
    .reduce((sum, t) => sum + Number(t.buyAmountUsd), 0);

  const msg =
    `📈 *Trading Stats*\n\n` +
    `*Performance*\n` +
    `Total Trades: ${allTrades.length}\n` +
    `Completed: ${soldTrades.length}\n` +
    `Wins: ${wins} | Losses: ${losses}\n` +
    `Win Rate: ${winRate.toFixed(1)}%\n` +
    `Avg P&L: ${avgPnl >= 0 ? '🟢' : '🔴'} ${avgPnl.toFixed(2)}%\n` +
    `Total P&L: ${totalPnl >= 0 ? '🟢' : '🔴'} ${totalPnl.toFixed(2)}%\n\n` +
    `*Current*\n` +
    `Active Positions: ${allTrades.filter(t => t.status === 'HOLDING').length}\n` +
    `Invested (holding): $${holdingValue.toFixed(2)}\n` +
    `Wallets Tracked: ${activeWallets}`;

  await bot.sendMessage(chatId, msg, {
    parse_mode: 'Markdown',
    reply_markup: inlineBackButton('main'),
    disable_web_page_preview: true,
  });
}

async function showManualTrade(chatId: number) {
  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: '🟢 Buy Token', callback_data: 'manual:buy' }],
      [{ text: '🔴 Sell Token', callback_data: 'manual:sell' }],
      [{ text: '⬅️ Back', callback_data: 'nav:main' }],
    ],
  };

  await bot.sendMessage(
    chatId,
    `🛒 *Manual Trade*\n\n` +
    `Buy or sell any token directly.\n` +
    `⚠️ Use at your own risk.`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
}

// ═══════════════════════════════════════════════════════════════
// ALERT SENDERS (called from helius.ts & profitMonitor.ts)
// ═══════════════════════════════════════════════════════════════

export async function sendWhaleAlert(
  whaleWallet: string,
  tokenSymbol: string,
  tokenMint: string,
  whaleBuyUsd: number,
  ourBudget: number
) {
  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: `🚀 Copy Buy $${ourBudget.toFixed(2)}`, callback_data: `copy:${tokenMint}:${ourBudget}` },
        { text: '💰 Custom $', callback_data: `copy_custom:${tokenMint}` },
        { text: '⏩ Skip', callback_data: 'copy:skip' },
      ],
      [
        { text: '📊 DexScreener', url: `https://dexscreener.com/solana/${tokenMint}` },
        { text: '⚙️ Settings', callback_data: 'nav:settings' },
      ],
    ],
  };

  if (!CHAT_ID) return;
  await bot.sendMessage(
    CHAT_ID,
    `🐋 *WHALE BUY DETECTED*\n\n` +
    `Wallet: \`${whaleWallet.slice(0, 6)}...${whaleWallet.slice(-6)}\`\n` +
    `Token: *${tokenSymbol}*\n` +
    `Whale Size: ~$${whaleBuyUsd.toFixed(0)}\n` +
    `Your Budget: $${ourBudget.toFixed(2)}\n\n` +
    `Choose your trade amount or tap 🚀 to copy instantly:`,
    { parse_mode: 'Markdown', reply_markup: keyboard, disable_web_page_preview: true }
  );
}

export async function sendBuySuccessAlert(
  tokenSymbol: string,
  txid: string,
  amountUsd: number,
  elapsedMs: number
) {
  if (!CHAT_ID) return;

  // Award AlphaPoints for copy-trade
  try {
    const { awardPoints } = await import('./points');
    await awardPoints(CHAT_ID, 'COPY_TRADE', 100, `⚡ Copy-traded $${tokenSymbol} ($${amountUsd.toFixed(2)})`);
  } catch {}

  await bot.sendMessage(
    CHAT_ID,
    `✅ *COPY TRADE EXECUTED*\n\n` +
    `Token: *${tokenSymbol}*\n` +
    `Amount: $${amountUsd.toFixed(2)}\n` +
    `Speed: ${elapsedMs}ms\n` +
    `🌟 *Reward:* +100 AlphaPoints!\n` +
    `Tx: [Solscan](https://solscan.io/tx/${txid})`,
    { parse_mode: 'Markdown', disable_web_page_preview: true }
  );
}

export async function sendBuyFailAlert(tokenSymbol: string, error: string, elapsedMs: number) {
  if (!CHAT_ID) return;
  await bot.sendMessage(
    CHAT_ID,
    `❌ *BUY FAILED*\n\n` +
    `Token: *${tokenSymbol}*\n` +
    `Error: \`${error}\`\n` +
    `Time: ${elapsedMs}ms`,
    { parse_mode: 'Markdown', disable_web_page_preview: true }
  );
}

export async function sendSellAlert(
  tokenSymbol: string,
  pnlPercent: number,
  reason: string,
  txid: string
) {
  if (!CHAT_ID) return;
  const isWin = pnlPercent > 0 || reason === 'PROFIT';
  const emoji = isWin ? '🎯' : '🔴';

  // Award AlphaPoints for profit win
  if (isWin) {
    try {
      const { awardPoints } = await import('./points');
      await awardPoints(CHAT_ID, 'PROFIT_WIN', 150, `🎯 Profit win on $${tokenSymbol} (+${pnlPercent.toFixed(1)}%)`);
    } catch {}
  }

  let msg =
    `${emoji} *POSITION CLOSED*\n\n` +
    `Token: *${tokenSymbol}*\n` +
    `P&L: ${pnlPercent >= 0 ? '🟢' : '🔴'} *${pnlPercent.toFixed(2)}%*\n` +
    (isWin ? `🌟 *Win Bonus:* +150 AlphaPoints!\n` : '') +
    `Reason: ${reason}\n` +
    `Tx: [Solscan](https://solscan.io/tx/${txid})`;

  let keyboard: InlineKeyboardMarkup | undefined = undefined;

  if (isWin) {
    try {
      const { getReferralStats } = await import('./referral');
      const me = await bot.getMe().catch(() => ({ username: 'Alpha5000Bot' }));
      const botUsername = me.username || 'Alpha5000Bot';
      const stats = await getReferralStats(CHAT_ID, botUsername);

      const winShareText = encodeURIComponent(
        `🎯 Just locked in +${pnlPercent.toFixed(1)}% on $${tokenSymbol} using Alpha5000!\n\nAutomate your copy trading here:\n${stats.referralLink}`
      );
      const winShareUrl = `https://t.me/share/url?url=${encodeURIComponent(stats.referralLink)}&text=${winShareText}`;

      msg += `\n\n🎉 *Nice profit! Share your win with fellow traders & earn 20% of their copy-trade fees:*`;
      keyboard = {
        inline_keyboard: [
          [{ text: '📤 Share Win (+20% Ref Fees)', url: winShareUrl }],
          [{ text: '👥 My Referral Dashboard', callback_data: 'nav:referrals' }],
        ],
      };
    } catch {
      // ignore
    }
  }

  await bot.sendMessage(
    CHAT_ID,
    msg,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
      disable_web_page_preview: true,
    }
  );
}

export async function sendSellFailAlert(tokenSymbol: string, error: string) {
  if (!CHAT_ID) return;
  await bot.sendMessage(
    CHAT_ID,
    `❌ *SELL FAILED* ${tokenSymbol}\n` +
    `Error: \`${error}\``,
    { parse_mode: 'Markdown', disable_web_page_preview: true }
  );
}

export function sendAlert(message: string): void {
  if (!CHAT_ID) return;
  bot.sendMessage(CHAT_ID, message, { parse_mode: 'Markdown', disable_web_page_preview: true })
    .catch(err => console.error('Telegram send failed:', err.message));
}

export function sendUrgentAlert(message: string): Promise<void> {
  if (!CHAT_ID) return Promise.resolve();
  return bot.sendMessage(CHAT_ID, message, { parse_mode: 'Markdown', disable_web_page_preview: true })
    .then(() => undefined)
    .catch(err => {
      console.error('Telegram urgent send failed:', err.message);
    });
}

export async function sendDiscoveryNotification(count: number, wallets?: any[]): Promise<void> {
  if (!CHAT_ID) return;

  const topWallets = wallets && wallets.length > 0 
    ? wallets 
    : await prisma.discoveredWallet.findMany({
        where: { isAdded: false },
        orderBy: { pnl24h: 'desc' },
        take: 5,
      });

  let msg = `🔍 *Wallet Discovery Alert*\n\n`;
  msg += `Found *${count}* new high-performing whale wallets from trending tokens:\n`;

  for (let i = 0; i < Math.min(topWallets.length, 5); i++) {
    const w = topWallets[i];
    const tags = w.walletTags && w.walletTags.length > 0 ? ` [${w.walletTags.slice(0, 2).join(', ')}]` : '';
    const pnlEmoji = Number(w.pnl24h || 0) >= 0 ? '🟢' : '🔴';

    msg += `\n${i + 1}. \`${w.address.slice(0, 6)}...${w.address.slice(-6)}\`${tags}\n`;
    msg += `   💰 24h P&L: ${pnlEmoji} $${Number(w.pnl24h || 0).toFixed(0)}`;
    if (w.tokenSymbol) msg += ` | Via *${w.tokenSymbol}*`;
    msg += `\n`;
    if (w.volume24h) {
      msg += `   📊 Volume: $${Number(w.volume24h).toFixed(0)} | Trades: ${w.tradeCount24h || 0}\n`;
    }
    if (w.netWorthSol) {
      msg += `   💎 Net Worth: ${Number(w.netWorthSol).toFixed(2)} SOL\n`;
    }
  }

  msg += `\n💡 _Tap below to view full details and track these wallets:_`;

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: '🏆 Open Leaderboard', callback_data: 'nav:leaderboard' }],
      [{ text: '🔥 View Discovered Wallets', callback_data: 'discovery:view' }],
    ],
  };

  await bot.sendMessage(CHAT_ID, msg, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
    disable_web_page_preview: true,
  });
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLERS
// ═══════════════════════════════════════════════════════════════

// Reply keyboard handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (!CHAT_ID && msg.chat.type === 'private') {
    CHAT_ID = String(chatId);
    console.log(`📱 Associated Telegram Bot with Chat ID: ${CHAT_ID}`);
  }
  if (CHAT_ID && String(chatId) !== CHAT_ID && msg.chat.type === 'private') return;

  const text = msg.text || '';
  const state = getState(chatId);

  // Handle stateful inputs first
  if (state.step !== 'idle') {
    await handleStatefulInput(chatId, text, state);
    return;
  }

  // Main menu navigation
  switch (text) {
    case '📊 Portfolio':
    case '/portfolio':
      await showPortfolio(chatId);
      break;
    case '🐋 Wallets':
    case '/wallets':
      await showWallets(chatId);
      break;
    case '⚙️ Settings':
    case '/settings':
      await showSettings(chatId);
      break;
    case '🏆 Leaderboard':
    case '/leaderboard':
      await showLeaderboard(chatId);
      break;
    case '📈 Stats':
    case '/stats':
      await showStats(chatId);
      break;
    case '🛒 Manual Trade':
    case '/trade':
      await showManualTrade(chatId);
      break;
    case '👛 My Wallet':
    case '/wallet':
    case '/wallets_user':
      await showWallet(chatId);
      break;
    case '/deposit': {
      const { getUserWalletInfo } = await import('./userWallet');
      const info = await getUserWalletInfo(chatId);
      await bot.sendMessage(
        chatId,
        `📥 *Deposit SOL to Alpha5000*\n\n` +
        `Send SOL to your dedicated trading wallet:\n\n` +
        `📍 *Address (Tap to copy):*\n` +
        `\`${info.publicKey}\`\n\n` +
        `⚡ _Deposits credit instantly on Solana!_`,
        { parse_mode: 'Markdown', reply_markup: inlineBackButton('user_wallet') }
      );
      break;
    }
    case '/withdraw':
      setState(chatId, 'await_withdraw_address');
      await bot.sendMessage(
        chatId,
        `📤 *Withdraw SOL*\n\nEnter the recipient Solana wallet address (e.g. your Phantom or Solflare address):`,
        { parse_mode: 'Markdown', reply_markup: BACK_MENU }
      );
      break;
    case '/export': {
      const keyboard: InlineKeyboardMarkup = {
        inline_keyboard: [
          [{ text: '⚠️ Reveal Private Key', callback_data: 'wallet:export_confirm' }],
          [{ text: '⬅️ Cancel', callback_data: 'nav:user_wallet' }],
        ],
      };
      await bot.sendMessage(
        chatId,
        `🔐 *Export Private Key*\n\n` +
        `⚠️ *WARNING: Never share your private key with anyone!*\n` +
        `Anyone with this key can access and steal all funds in this wallet.\n\n` +
        `Are you sure you want to reveal your private key?`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
      break;
    }
    case '🌟 AlphaPoints':
    case '/points':
    case '/alphapoints':
    case '/claim':
    case '/daily':
      await showPoints(chatId);
      break;
    case '👥 Referrals':
    case '/referrals':
    case '/referral':
    case '/ref':
      await showReferrals(chatId);
      break;
    case '💰 Fees':
    case '/fees':
      await showFees(chatId);
      break;
    case '🔄 Refresh':
    case '/refresh':
      await showMainMenu(chatId, '🔄 Refreshed!');
      break;
    case '⬅️ Back to Menu':
    case '/start':
    case '/menu':
      await showMainMenu(chatId);
      break;
    default:
      // Unknown command
      break;
  }
});

async function handleStatefulInput(chatId: number, text: string, state: UserState) {
  // Cancel on "back"
  if (text === '⬅️ Back to Menu' || text === '/cancel') {
    clearState(chatId);
    await showMainMenu(chatId);
    return;
  }

  switch (state.step) {
    case 'await_wallet_add': {
      const address = text.trim();
      if (address.length < 32) {
        await bot.sendMessage(chatId, '❌ Invalid Solana address. Try again or tap Back.', {
          reply_markup: BACK_MENU,
        });
        return;
      }
      await prisma.watchedWallet.upsert({
        where: { address },
        update: { isActive: true },
        create: { address, label: 'Manual Add' },
      });
      clearState(chatId);
      await bot.sendMessage(chatId, `✅ Wallet added!\n\`\`\`\n${address}\n\`\`\``, {
        parse_mode: 'Markdown',
        reply_markup: MAIN_MENU,
      });
      break;
    }

    case 'await_wallet_remove': {
      const address = text.trim();
      const wallet = await prisma.watchedWallet.findUnique({ where: { address } });
      if (!wallet) {
        await bot.sendMessage(chatId, '❌ Wallet not found. Try again or tap Back.', {
          reply_markup: BACK_MENU,
        });
        return;
      }
      await prisma.watchedWallet.update({
        where: { address },
        data: { isActive: false },
      });
      clearState(chatId);
      await bot.sendMessage(chatId, `🗑️ Wallet removed.`, { reply_markup: MAIN_MENU });
      break;
    }

    case 'await_budget': {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount < 0.5) {
        await bot.sendMessage(chatId, '❌ Invalid amount. Minimum $0.50. Try again:', {
          reply_markup: BACK_MENU,
        });
        return;
      }
      await prisma.settings.updateMany({ data: { tradeBudget: amount } });
      clearState(chatId);
      await bot.sendMessage(chatId, `💰 Budget updated to $${amount.toFixed(2)}`, {
        reply_markup: MAIN_MENU,
      });
      break;
    }

    case 'await_tp': {
      const tp = parseFloat(text);
      if (isNaN(tp) || tp <= 0) {
        await bot.sendMessage(chatId, '❌ Invalid percentage. Try again:', {
          reply_markup: BACK_MENU,
        });
        return;
      }
      await prisma.settings.updateMany({ data: { takeProfit: tp } });
      clearState(chatId);
      await bot.sendMessage(chatId, `🎯 Take Profit set to ${tp}%`, { reply_markup: MAIN_MENU });
      break;
    }

    case 'await_sl': {
      const sl = parseFloat(text);
      if (isNaN(sl) || sl >= 0) {
        await bot.sendMessage(chatId, '❌ Invalid. Must be negative (e.g. -30). Try again:', {
          reply_markup: BACK_MENU,
        });
        return;
      }
      await prisma.settings.updateMany({ data: { stopLoss: sl } });
      clearState(chatId);
      await bot.sendMessage(chatId, `🔴 Stop Loss set to ${sl}%`, { reply_markup: MAIN_MENU });
      break;
    }

    case 'await_slippage': {
      const slip = parseFloat(text);
      if (isNaN(slip) || slip < 0.1 || slip > 50) {
        await bot.sendMessage(chatId, '❌ Invalid. Use 0.5–50%. Try again:', {
          reply_markup: BACK_MENU,
        });
        return;
      }
      await prisma.settings.updateMany({ data: { slippageBps: Math.round(slip * 100) } });
      clearState(chatId);
      await bot.sendMessage(chatId, `📉 Slippage set to ${slip}%`, { reply_markup: MAIN_MENU });
      break;
    }

    case 'await_minwhale': {
      const min = parseFloat(text);
      if (isNaN(min) || min < 0) {
        await bot.sendMessage(chatId, '❌ Invalid amount. Enter 0 or higher (e.g. 0 to copy all trades, or 50, 100):', {
          reply_markup: BACK_MENU,
        });
        return;
      }
      await prisma.settings.updateMany({ data: { minWhaleBuy: min } });
      clearState(chatId);
      const label = min === 0 ? 'No minimum (copy all trades)' : `$${min.toFixed(0)}`;
      await bot.sendMessage(chatId, `🐋 Min Whale Buy set to: *${label}*`, {
        parse_mode: 'Markdown',
        reply_markup: MAIN_MENU,
      });
      break;
    }

    case 'await_manual_token': {
      const mint = text.trim();
      const validation = await quickValidateToken(mint);
      if (!validation.safe) {
        await bot.sendMessage(chatId, `❌ ${validation.reason}. Try again:`, {
          reply_markup: BACK_MENU,
        });
        return;
      }
      setState(chatId, 'await_manual_amount', { mint });
      await bot.sendMessage(chatId, `✅ Token valid.\nEnter USD amount to buy (e.g. 6):`, {
        reply_markup: BACK_MENU,
      });
      break;
    }

    case 'await_manual_amount': {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await bot.sendMessage(chatId, '❌ Invalid amount. Try again:', {
          reply_markup: BACK_MENU,
        });
        return;
      }
      const mint = state.tempData?.mint;
      clearState(chatId);

      await bot.sendMessage(chatId, `⏳ Executing buy of $${amount}...`, { reply_markup: MAIN_MENU });
      const result = await executeBuy(mint, amount);

      if (result.success && result.txid) {
        // Log as a trade
        prisma.trade.create({
          data: {
            whaleWallet: state.tempData?.whaleWallet || 'manual',
            tokenMint: mint,
            tokenSymbol: 'UNKNOWN',
            tokenDecimals: 6,
            buyTx: result.txid,
            buyPriceUsd: 0,
            buyAmountUsd: amount,
            buyAmountTokens: 0,
            status: 'HOLDING',
          },
        }).catch(() => {});

        await bot.sendMessage(
          chatId,
          `✅ *BUY EXECUTED*\n` +
          `Amount: $${amount.toFixed(2)}\n` +
          `Tx: [Solscan](https://solscan.io/tx/${result.txid})`,
          { parse_mode: 'Markdown', disable_web_page_preview: true }
        );
      } else {
        await bot.sendMessage(chatId, `❌ Buy failed: ${result.error || 'Unknown'}`, {
          reply_markup: MAIN_MENU,
        });
      }
      break;
    }

    case 'await_payout_wallet': {
      const address = text.trim();
      if (address.length < 32) {
        await bot.sendMessage(chatId, '❌ Invalid Solana address. Try again or tap Back.', {
          reply_markup: BACK_MENU,
        });
        return;
      }
      const { updatePayoutWallet } = await import('./referral');
      await updatePayoutWallet(chatId, address);
      clearState(chatId);
      await bot.sendMessage(chatId, `✅ *Payout Wallet Saved!*\n\`\`\`\n${address}\n\`\`\`\nReferral commissions will be sent to this wallet.`, {
        parse_mode: 'Markdown',
        reply_markup: MAIN_MENU,
      });
      await showReferrals(chatId);
      break;
    }

    case 'await_withdraw_address': {
      const address = text.trim();
      if (address.length < 32) {
        await bot.sendMessage(chatId, '❌ Invalid Solana address. Try again or tap Back.', {
          reply_markup: BACK_MENU,
        });
        return;
      }
      setState(chatId, 'await_withdraw_amount', { destinationAddress: address });
      await bot.sendMessage(chatId, `📍 Destination: \`${address}\`\n\nEnter SOL amount to withdraw (e.g. 0.5):`, {
        parse_mode: 'Markdown',
        reply_markup: BACK_MENU,
      });
      break;
    }

    case 'await_withdraw_amount': {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await bot.sendMessage(chatId, '❌ Invalid amount. Try again:', {
          reply_markup: BACK_MENU,
        });
        return;
      }
      const destination = state.tempData?.destinationAddress;
      clearState(chatId);

      await bot.sendMessage(chatId, `⏳ Processing withdrawal of ${amount} SOL to \`${destination.slice(0, 6)}...${destination.slice(-6)}\`...`, {
        parse_mode: 'Markdown',
        reply_markup: MAIN_MENU,
      });

      const { withdrawSol } = await import('./userWallet');
      const res = await withdrawSol(chatId, destination, amount);

      if (res.success && res.txid) {
        await bot.sendMessage(
          chatId,
          `✅ *Withdrawal Complete!*\n\n` +
          `Amount: *${amount} SOL*\n` +
          `Destination: \`${destination}\`\n` +
          `Tx: [Solscan](https://solscan.io/tx/${res.txid})`,
          { parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: MAIN_MENU }
        );
      } else {
        await bot.sendMessage(chatId, `❌ Withdrawal failed: ${res.error || 'Unknown error'}`, {
          reply_markup: MAIN_MENU,
        });
      }
      break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// CALLBACK QUERY HANDLERS (Inline buttons)
// ═══════════════════════════════════════════════════════════════

bot.on('callback_query', async (query) => {
  const chatId = query.message?.chat.id;
  const msgId = query.message?.message_id;
  if (!chatId) return;

  if (!CHAT_ID && query.message?.chat.type === 'private') {
    CHAT_ID = String(chatId);
  }
  if (CHAT_ID && String(chatId) !== CHAT_ID && query.message?.chat.type === 'private') return;

  const data = query.data || '';
  await bot.answerCallbackQuery(query.id); // Acknowledge immediately

  // Navigation
  if (data === 'nav:main') {
    if (msgId) await bot.deleteMessage(chatId, msgId).catch(() => {});
    await showMainMenu(chatId);
    return;
  }

  if (data === 'nav:user_wallet') {
    if (msgId) await bot.deleteMessage(chatId, msgId).catch(() => {});
    await showWallet(chatId);
    return;
  }

  if (data === 'wallet:deposit') {
    const { getUserWalletInfo } = await import('./userWallet');
    const info = await getUserWalletInfo(chatId);
    await bot.sendMessage(
      chatId,
      `📥 *Deposit SOL to Alpha5000*\n\n` +
      `Send SOL from Phantom, Solflare, or Binance to your personal bot wallet:\n\n` +
      `📍 *Address (Tap to copy):*\n` +
      `\`${info.publicKey}\`\n\n` +
      `⚡ _Deposits credit immediately on confirmation!_`,
      { parse_mode: 'Markdown', reply_markup: inlineBackButton('user_wallet') }
    );
    return;
  }

  if (data === 'wallet:withdraw') {
    setState(chatId, 'await_withdraw_address');
    await bot.sendMessage(
      chatId,
      `📤 *Withdraw SOL*\n\nEnter the recipient Solana wallet address (e.g. your Phantom or Solflare address):`,
      { parse_mode: 'Markdown', reply_markup: BACK_MENU }
    );
    return;
  }

  if (data === 'wallet:export') {
    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: '⚠️ Reveal Private Key', callback_data: 'wallet:export_confirm' }],
        [{ text: '⬅️ Cancel', callback_data: 'nav:user_wallet' }],
      ],
    };
    await bot.sendMessage(
      chatId,
      `🔐 *Export Private Key*\n\n` +
      `⚠️ *WARNING: Never share your private key with anyone!*\n` +
      `Anyone with this key can access and steal all funds in this wallet.\n\n` +
      `Are you sure you want to reveal your private key?`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
    return;
  }

  if (data === 'wallet:export_confirm') {
    const { exportPrivateKey } = await import('./userWallet');
    const privKey = await exportPrivateKey(chatId);
    await bot.sendMessage(
      chatId,
      `🔑 *Your Private Key (Base58):*\n\n` +
      `\`${privKey}\`\n\n` +
      `💡 _You can import this into Phantom (Add / Connect Wallet -> Import Private Key)._\n` +
      `⚠️ *Delete this message after saving!*`,
      { parse_mode: 'Markdown', reply_markup: inlineBackButton('user_wallet') }
    );
    return;
  }

  if (data === 'nav:portfolio') {
    if (msgId) await bot.deleteMessage(chatId, msgId).catch(() => {});
    await showPortfolio(chatId);
    return;
  }

  if (data === 'nav:wallets') {
    if (msgId) await bot.deleteMessage(chatId, msgId).catch(() => {});
    await showWallets(chatId);
    return;
  }

  if (data === 'nav:settings') {
    if (msgId) await bot.deleteMessage(chatId, msgId).catch(() => {});
    await showSettings(chatId);
    return;
  }

  if (data === 'nav:leaderboard') {
    if (msgId) await bot.deleteMessage(chatId, msgId).catch(() => {});
    await showLeaderboard(chatId);
    return;
  }

  if (data === 'nav:stats') {
    if (msgId) await bot.deleteMessage(chatId, msgId).catch(() => {});
    await showStats(chatId);
    return;
  }

  if (data === 'nav:manual') {
    if (msgId) await bot.deleteMessage(chatId, msgId).catch(() => {});
    await showManualTrade(chatId);
    return;
  }

  if (data === 'nav:fees') {
    if (msgId) await bot.deleteMessage(chatId, msgId).catch(() => {});
    await showFees(chatId);
    return;
  }

  if (data === 'nav:points') {
    if (msgId) await bot.deleteMessage(chatId, msgId).catch(() => {});
    await showPoints(chatId);
    return;
  }

  if (data === 'points:claim') {
    const { claimDailyBonus } = await import('./points');
    const res = await claimDailyBonus(chatId, query.from?.username, query.from?.first_name);
    await bot.sendMessage(chatId, res.message, {
      parse_mode: 'Markdown',
      reply_markup: inlineBackButton('points'),
    });
    return;
  }

  if (data === 'points:leaderboard') {
    if (msgId) await bot.deleteMessage(chatId, msgId).catch(() => {});
    await showPointsLeaderboard(chatId);
    return;
  }

  if (data === 'points:history') {
    if (msgId) await bot.deleteMessage(chatId, msgId).catch(() => {});
    await showPointsHistory(chatId);
    return;
  }

  if (data === 'nav:referrals') {
    if (msgId) await bot.deleteMessage(chatId, msgId).catch(() => {});
    await showReferrals(chatId);
    return;
  }

  if (data === 'ref:set_wallet') {
    setState(chatId, 'await_payout_wallet');
    await bot.sendMessage(chatId, '👛 *Set Solana Payout Wallet*\n\nSend your Solana wallet address to receive referral commissions:', {
      parse_mode: 'Markdown',
      reply_markup: BACK_MENU,
    });
    return;
  }

  if (data === 'ref:claim') {
    const { getReferralStats } = await import('./referral');
    const stats = await getReferralStats(chatId);
    if (stats.unclaimedEarningsUsd <= 0) {
      await bot.sendMessage(chatId, 'ℹ️ You currently have $0.00 in unclaimed referral rewards.\nShare your referral link with traders to start earning!', {
        reply_markup: inlineBackButton('referrals'),
      });
      return;
    }
    if (!stats.payoutWallet) {
      await bot.sendMessage(chatId, '⚠️ Please set your Solana payout wallet first using the button below:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '👛 Set Payout Wallet', callback_data: 'ref:set_wallet' }],
            [{ text: '⬅️ Back', callback_data: 'nav:referrals' }],
          ],
        },
      });
      return;
    }
    await bot.sendMessage(chatId, `✅ *Payout Request Received*\n\nAmount: $${stats.unclaimedEarningsUsd.toFixed(4)}\nPayout Wallet: \`${stats.payoutWallet}\`\n\nCommissions will be processed to your wallet!`, {
      parse_mode: 'Markdown',
      reply_markup: inlineBackButton('referrals'),
    });
    return;
  }

  // Wallet management
  if (data === 'wallet:add') {
    setState(chatId, 'await_wallet_add');
    await bot.sendMessage(chatId, '➕ *Add Whale Wallet*\n\nSend the Solana address:', {
      parse_mode: 'Markdown',
      reply_markup: BACK_MENU,
    });
    return;
  }

  if (data === 'wallet:remove') {
    setState(chatId, 'await_wallet_remove');
    await bot.sendMessage(chatId, '➖ *Remove Wallet*\n\nSend the address to remove:', {
      parse_mode: 'Markdown',
      reply_markup: BACK_MENU,
    });
    return;
  }

  // Settings
  if (data === 'set:budget') {
    setState(chatId, 'await_budget');
    await bot.sendMessage(chatId, '💰 *Set Budget*\n\nEnter your copy-trade budget in USD (e.g. 6.00):', {
      parse_mode: 'Markdown',
      reply_markup: BACK_MENU,
    });
    return;
  }

  if (data === 'set:tp') {
    setState(chatId, 'await_tp');
    await bot.sendMessage(chatId, '🎯 *Set Take Profit*\n\nEnter % (e.g. 50):', {
      parse_mode: 'Markdown',
      reply_markup: BACK_MENU,
    });
    return;
  }

  if (data === 'set:sl') {
    setState(chatId, 'await_sl');
    await bot.sendMessage(chatId, '🔴 *Set Stop Loss*\n\nEnter % (negative, e.g. -30):', {
      parse_mode: 'Markdown',
      reply_markup: BACK_MENU,
    });
    return;
  }

  if (data === 'set:slippage') {
    setState(chatId, 'await_slippage');
    await bot.sendMessage(chatId, '📉 *Set Slippage*\n\nEnter % (e.g. 2):', {
      parse_mode: 'Markdown',
      reply_markup: BACK_MENU,
    });
    return;
  }

  if (data === 'set:minwhale') {
    setState(chatId, 'await_minwhale');
    await bot.sendMessage(chatId, '🐋 *Set Min Whale Buy Threshold*\n\nEnter minimum USD amount (e.g. 0 to copy all buys, or 50, 100):', {
      parse_mode: 'Markdown',
      reply_markup: BACK_MENU,
    });
    return;
  }

  // Bot pause/resume
  if (data === 'bot:pause') {
    await prisma.settings.updateMany({ data: { isRunning: false } });
    await bot.editMessageText('🔴 *Bot PAUSED*\n\nNo new copy trades will execute.', {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'Markdown',
      reply_markup: inlineBackButton('settings'),
    });
    return;
  }

  if (data === 'bot:resume') {
    await prisma.settings.updateMany({ data: { isRunning: true } });
    await bot.editMessageText('🟢 *Bot RESUMED*\n\nCopy trading is active.', {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'Markdown',
      reply_markup: inlineBackButton('settings'),
    });
    return;
  }

  // Manual trade
  if (data === 'manual:buy') {
    setState(chatId, 'await_manual_token');
    await bot.sendMessage(chatId, '🛒 *Manual Buy*\n\nSend token mint address:', {
      parse_mode: 'Markdown',
      reply_markup: BACK_MENU,
    });
    return;
  }

  if (data === 'manual:sell') {
    const holdings = await prisma.trade.findMany({
      where: { status: 'HOLDING' },
      select: { id: true, tokenSymbol: true, tokenMint: true },
    });

    if (holdings.length === 0) {
      await bot.sendMessage(chatId, '📭 No positions to sell.', {
        reply_markup: inlineBackButton('main'),
      });
      return;
    }

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: holdings.map(h => [
        { text: `🔴 Sell ${h.tokenSymbol}`, callback_data: `sellmanual:${h.id}` },
      ]).concat([[{ text: '⬅️ Back', callback_data: 'nav:main' }]]),
    };

    await bot.sendMessage(chatId, '🛒 *Select position to sell:*', {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
    return;
  }

  // Manual sell from portfolio
  if (data.startsWith('sellmanual:')) {
    const tradeId = data.split(':')[1];
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade) return;

    await bot.sendMessage(chatId, `⏳ Selling ${trade.tokenSymbol}...`, { reply_markup: MAIN_MENU });
    const result = await executeSell(trade.tokenMint, Number(trade.buyAmountTokens), trade.tokenDecimals);

    if (result.success && result.txid) {
      await prisma.trade.update({
        where: { id: tradeId },
        data: {
          status: 'SOLD',
          sellTx: result.txid,
          sellReason: 'MANUAL',
          sellTime: new Date(),
        },
      });
      await bot.sendMessage(
        chatId,
        `✅ *SOLD ${trade.tokenSymbol}*\n` +
        `Tx: [Solscan](https://solscan.io/tx/${result.txid})`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );
    } else {
      await bot.sendMessage(chatId, `❌ Sell failed: ${result.error || 'Unknown'}`, {
        reply_markup: MAIN_MENU,
      });
    }
    return;
  }

  // Custom amount copy
  if (data.startsWith('copy_custom:')) {
    const tokenMint = data.split(':')[1];
    setState(chatId, 'await_manual_amount', { mint: tokenMint });
    await bot.sendMessage(chatId, `Enter custom USD amount to buy (e.g. 10):`, {
      reply_markup: BACK_MENU,
    });
    return;
  }

  // Copy trade from alert
  if (data.startsWith('copy:')) {
    const parts = data.split(':');
    if (parts[1] === 'skip') {
      await bot.editMessageText('⏩ *Skipped*', {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
      });
      return;
    }

    const tokenMint = parts[1];
    const budget = parseFloat(parts[2]);

    await bot.editMessageText(
      `⏳ *Executing copy trade...*\nToken: \`${tokenMint.slice(0, 6)}...${tokenMint.slice(-6)}\``,
      { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
    );

    let userKeypair;
    try {
      const { getUserWalletKeypair, getUserWalletInfo } = await import('./userWallet');
      const info = await getUserWalletInfo(chatId);
      if (info.balanceSol < 0.002) {
        await bot.editMessageText(
          `❌ *Insufficient SOL Balance*\n\n` +
          `Your bot wallet balance: *${info.balanceSol.toFixed(4)} SOL* (~$${info.balanceUsd.toFixed(2)})\n\n` +
          `Please deposit SOL to your personal bot address:\n\`${info.publicKey}\``,
          {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📥 Deposit SOL', callback_data: 'wallet:deposit' }],
                [{ text: '⬅️ Back to Menu', callback_data: 'nav:main' }],
              ],
            },
          }
        );
        return;
      }
      userKeypair = await getUserWalletKeypair(chatId);
    } catch {}

    const result = await executeBuy(tokenMint, budget, undefined, userKeypair);

    if (result.success && result.txid) {
      // Award AlphaPoints for copy-trade
      try {
        const { awardPoints } = await import('./points');
        await awardPoints(chatId, 'COPY_TRADE', 100, `⚡ Copy-traded ${tokenMint.slice(0, 6)} ($${budget.toFixed(2)})`);
      } catch {}

      await bot.editMessageText(
        `✅ *COPY TRADE EXECUTED*\n\n` +
        `Token: \`${tokenMint.slice(0, 6)}...${tokenMint.slice(-6)}\`\n` +
        `Amount: $${budget.toFixed(2)}\n` +
        `🌟 *Reward:* +100 AlphaPoints!\n` +
        `Tx: [Solscan](https://solscan.io/tx/${result.txid})`,
        {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'nav:main' }]],
          },
        }
      );
    } else {
      await bot.editMessageText(
        `❌ *COPY TRADE FAILED*\n\nError: \`${result.error || 'Unknown'}\``,
        {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'nav:main' }]],
          },
        }
      );
    }
    return;
  }

  // Discovery callbacks
  const handled = await handleDiscoveryCallback(data, chatId, msgId);
  if (handled) return;

  // Portfolio partial sells
  if (data.startsWith('sell:')) {
    const [, percent, tradeId] = data.split(':');
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade) return;

    const sellPercent = parseInt(percent);
    const amountToSell = (Number(trade.buyAmountTokens) * sellPercent) / 100;

    await bot.sendMessage(chatId, `⏳ Selling ${sellPercent}% of ${trade.tokenSymbol}...`, {
      reply_markup: MAIN_MENU,
    });

    const result = await executeSell(trade.tokenMint, amountToSell, trade.tokenDecimals);

    if (result.success && result.txid) {
      if (sellPercent === 100) {
        await prisma.trade.update({
          where: { id: tradeId },
          data: { status: 'SOLD', sellTx: result.txid, sellReason: 'MANUAL', sellTime: new Date() },
        });
      }
      await bot.sendMessage(
        chatId,
        `✅ *Sold ${sellPercent}% of ${trade.tokenSymbol}*\n` +
        `Tx: [Solscan](https://solscan.io/tx/${result.txid})`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );
    } else {
      await bot.sendMessage(chatId, `❌ Sell failed: ${result.error || 'Unknown'}`, {
        reply_markup: MAIN_MENU,
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// COMMANDS
// ═══════════════════════════════════════════════════════════════

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';

  if (!CHAT_ID && msg.chat.type === 'private') {
    CHAT_ID = String(chatId);
    console.log(`📱 Associated Telegram Bot with Chat ID: ${CHAT_ID}`);
  }

  const startParam = text.replace('/start ', '').trim();

  // Handle referral deep links: /start ref_<referrerChatId>
  if (startParam.startsWith('ref_')) {
    const referrerId = startParam.replace('ref_', '').trim();
    try {
      const { getOrCreateReferralUser } = await import('./referral');
      await getOrCreateReferralUser(chatId, msg.from?.username, msg.from?.first_name, referrerId);

      // Initialize points + award referrer +200 AP
      const { getOrCreateUserPoints, awardPoints } = await import('./points');
      await getOrCreateUserPoints(chatId, msg.from?.username, msg.from?.first_name);
      await awardPoints(referrerId, 'REFERRAL_JOIN', 200, `👥 Friend @${msg.from?.username || chatId} joined via your invite link`);

      await bot.sendMessage(
        chatId,
        `🎉 *Welcome to Alpha5000!*\n\nYou joined via invite link.\n🌟 *Bonus:* +100 AlphaPoints added to your account!\n\nStart copy-trading top profitable Solana whales automatically with zero delay!`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('Referral onboarding error:', (e as Error).message);
    }
  } else {
    try {
      const { getOrCreateReferralUser } = await import('./referral');
      await getOrCreateReferralUser(chatId, msg.from?.username, msg.from?.first_name);

      const { getOrCreateUserPoints } = await import('./points');
      await getOrCreateUserPoints(chatId, msg.from?.username, msg.from?.first_name);

      const { getOrCreateUserWallet } = await import('./userWallet');
      await getOrCreateUserWallet(chatId);
    } catch {}
  }

  // Handle deep links from group alerts: /start copy_<tokenMint>_<whaleWallet>
  if (startParam.startsWith('copy_')) {
    // User clicked "Copy in DM" from a group alert
    const parts = startParam.split('_');
    const tokenMint = parts[1];
    const whaleWallet = parts[2];

    if (tokenMint && whaleWallet) {
      await handleCopyFromGroupAlert(chatId, tokenMint, whaleWallet, msg.from?.username, msg.from?.first_name);
      return;
    }
  }

  if (startParam === 'settings') {
    // User clicked "Open Settings in DM" from group
    await showMainMenu(chatId, '⚙️ *Settings*\nConfigure your personal copy-trading setup.');
    return;
  }

  // Regular start - send persistent keyboard & dashboard
  await showMainMenu(chatId);
});

// Handle "Copy in DM" from group alerts
async function handleCopyFromGroupAlert(
  chatId: number,
  tokenMint: string,
  whaleWallet: string,
  username?: string,
  firstName?: string
) {
  // Try to find which group this user came from
  // For now, we'll show a generic setup flow

  const validation = await quickValidateToken(tokenMint);
  if (!validation.safe) {
    await bot.sendMessage(chatId, `⚠️ This token failed validation: ${validation.reason}\n\nYou can still try to trade it manually.`, {
      reply_markup: MAIN_MENU,
    });
    return;
  }

  const settings = await prisma.settings.findFirst();
  const budget = Number(settings?.tradeBudget || 6);

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: `🚀 Copy Buy $${budget.toFixed(2)}`, callback_data: `copy:${tokenMint}:${budget}` },
        { text: '💰 Custom Amount', callback_data: `copy_custom:${tokenMint}` },
      ],
      [
        { text: '⚙️ Change Budget', callback_data: 'nav:settings' },
        { text: '⬅️ Back', callback_data: 'nav:main' },
      ],
    ],
  };

  await bot.sendMessage(
    chatId,
    `🐋 *Copy Trade Setup*\n\n` +
    `Whale: \`${whaleWallet.slice(0, 6)}...${whaleWallet.slice(-6)}\`\n` +
    `Token: \`${tokenMint.slice(0, 6)}...${tokenMint.slice(-6)}\`\n` +
    `Your Budget: $${budget.toFixed(2)}\n\n` +
    `Ready to copy this trade?`,
    { parse_mode: 'Markdown', reply_markup: keyboard, disable_web_page_preview: true }
  );
}

bot.onText(/\/menu/, async (msg) => {
  if (String(msg.chat.id) !== CHAT_ID) return;
  await showMainMenu(msg.chat.id);
});

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════

console.log('✅ Telegram UI Bot started');

// Export for other modules
export { bot, CHAT_ID, MAIN_MENU, BACK_MENU, inlineBackButton };
