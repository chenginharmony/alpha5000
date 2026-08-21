import TelegramBot, { InlineKeyboardMarkup } from 'node-telegram-bot-api';
import { prisma } from '../db';
import { config } from '../config';
import { getLatestBundledTokens, analyzeTokenBundle, BundleAnalysisResult } from './bundleDetection';

let botInstance: TelegramBot | null = null;

export function setBundleBotInstance(bot: TelegramBot) {
  botInstance = bot;
}

function getBot(): TelegramBot {
  if (!botInstance) {
    botInstance = new TelegramBot(config.TELEGRAM_BOT_TOKEN);
  }
  return botInstance;
}

/**
 * Display the Top 5 Latest Bundled Tokens Dashboard
 */
export async function showBundlesDashboard(chatId: number | string): Promise<void> {
  const bot = getBot();
  const bundles = await getLatestBundledTokens(5);

  let msg = `🚨 *BUNDLE DETECTOR — Latest Bundled Launches*\n\n`;
  msg += `Identifies coordinated insider sniper bundles & Jito clusters on Solana launches:\n\n`;

  if (bundles.length === 0) {
    msg += `_No high-risk bundles detected in the last scan._\n`;
    msg += `Tap *[🔍 Check Token Bundle]* below to analyze any contract address.\n\n`;
  } else {
    for (let i = 0; i < bundles.length; i++) {
      const b = bundles[i];
      const riskBadge = b.riskScore >= 80 ? '🟥 EXTREME' : b.riskScore >= 60 ? '🟧 HIGH' : b.riskScore >= 35 ? '🟨 MEDIUM' : '🟢 LOW';
      const timeAgo = Math.max(1, Math.round((Date.now() - b.createdAt.getTime()) / (60 * 1000)));

      msg += `${i + 1}. *${b.riskEmoji} $${b.tokenSymbol}* (\`${b.tokenMint.slice(0, 4)}...${b.tokenMint.slice(-4)}\`)\n`;
      msg += `   ├─ 📦 Bundle Size: *${b.walletCount} wallets* | *${b.totalSolSpent.toFixed(1)} SOL*`;
      if (b.totalUsdSpent) msg += ` (~$${b.totalUsdSpent.toLocaleString(undefined, { maximumFractionDigits: 0 })})`;
      msg += `\n`;
      msg += `   ├─ 📊 Supply Grabbed: *${b.pctSupplyBought.toFixed(1)}%*\n`;
      msg += `   ├─ 🔗 Funder: ${b.commonFunder ? `\`${b.commonFunder.slice(0, 4)}...${b.commonFunder.slice(-4)}\` (Same Funder)` : 'Mixed Funders'}\n`;
      msg += `   └─ ⚠️ Risk: *${b.riskScore}/100* (${riskBadge}) • _${timeAgo}m ago_\n\n`;
    }
  }

  msg += `💡 _Bundled tokens have high insider dump risk. Always check before buying._`;

  const tokenButtons: any[] = [];
  bundles.slice(0, 3).forEach((b, i) => {
    tokenButtons.push({
      text: `🔍 #${i + 1} $${b.tokenSymbol}`,
      callback_data: `bundle:view:${b.tokenMint}`,
    });
  });

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      tokenButtons.length > 0 ? tokenButtons : [],
      [
        { text: '🔍 Check Token Bundle', callback_data: 'bundle:search' },
        { text: '🔄 Refresh', callback_data: 'nav:bundles' },
      ],
      [
        { text: '🔔 Alert Settings', callback_data: 'bundle:settings' },
        { text: '⬅️ Main Menu', callback_data: 'nav:main' },
      ],
    ].filter(row => row.length > 0),
  };

  await bot.sendMessage(chatId, msg, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
    disable_web_page_preview: true,
  });
}

/**
 * Display Deep Bundle Analysis for a specific token
 */
export async function showBundleDetails(chatId: number | string, tokenMint: string): Promise<void> {
  const bot = getBot();

  const loadingMsg = await bot.sendMessage(chatId, `⏳ *Analyzing token launch for insider bundles...*\n\`${tokenMint}\``, {
    parse_mode: 'Markdown',
  });

  try {
    const b = await analyzeTokenBundle(tokenMint);

    let msg = `🔍 *Bundle Analysis Report*\n\n`;
    msg += `🪙 Token: *$${b.tokenSymbol}* (${b.tokenName || 'Solana Token'})\n`;
    msg += `📍 Contract: \`${b.tokenMint}\`\n\n`;

    const isBundled = b.walletCount >= 2 && (b.riskScore >= 40 || b.pctSupplyBought >= 10);
    msg += `📦 *Bundle Detected:* ${isBundled ? '🚨 **YES**' : '✅ **NO**'}\n`;
    msg += `├─ 👥 Wallets in Bundle: *${b.walletCount}*\n`;
    msg += `├─ 💰 Total SOL Spent: *${b.totalSolSpent.toFixed(2)} SOL*`;
    if (b.totalUsdSpent) msg += ` (~$${b.totalUsdSpent.toLocaleString(undefined, { maximumFractionDigits: 0 })} USD)`;
    msg += `\n`;
    msg += `├─ 📊 % of Supply Grabbed: *${b.pctSupplyBought.toFixed(1)}%*\n`;
    msg += `├─ ⚡ Bundle Type: *${b.bundleType}*\n`;
    if (b.commonFunder) {
      msg += `├─ 🔗 Common Funder: \`${b.commonFunder}\`\n`;
    }
    if (b.devWallet) {
      msg += `├─ 👤 Dev Creator: \`${b.devWallet.slice(0, 6)}...${b.devWallet.slice(-6)}\`\n`;
    }
    if (b.launchSlot) {
      msg += `└─ ⏱️ Launch Slot: \`${b.launchSlot}\`\n`;
    }

    msg += `\n🎯 *RISK SCORE: ${b.riskScore}/100 (${b.riskEmoji} ${b.riskLevel})*\n`;
    msg += `_${b.recommendation}_\n\n`;

    if (b.reasons.length > 0) {
      msg += `*Key Risk Signals:*\n`;
      b.reasons.forEach(r => {
        msg += `• ${r}\n`;
      });
      msg += `\n`;
    }

    if (b.wallets.length > 0) {
      msg += `*Top Bundle Buyers:*\n`;
      for (let i = 0; i < Math.min(b.wallets.length, 4); i++) {
        const w = b.wallets[i];
        msg += `${i + 1}. \`${w.walletAddress.slice(0, 4)}...${w.walletAddress.slice(-4)}\` • *${w.solSpent.toFixed(2)} SOL*`;
        if (w.isBurner) msg += ` 🔥 Burner`;
        if (w.fundingSource) msg += ` (Funder: \`${w.fundingSource.slice(0, 4)}...\`)`;
        msg += `\n`;
      }
      msg += `\n`;
    }

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: `⚡ Quick Buy $6`, callback_data: `buy:${b.tokenMint}` },
          { text: '🛡️ RugCheck Scan', url: `https://rugcheck.xyz/tokens/${b.tokenMint}` },
        ],
        [
          { text: '📊 DexScreener', url: `https://dexscreener.com/solana/${b.tokenMint}` },
          { text: '⬅️ Back to Bundles', callback_data: 'nav:bundles' },
        ],
      ],
    };

    if (loadingMsg?.message_id) {
      await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    }

    await bot.sendMessage(chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
      disable_web_page_preview: true,
    });
  } catch (e) {
    if (loadingMsg?.message_id) {
      await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    }
    await bot.sendMessage(chatId, `❌ *Analysis Failed*: ${(e as Error).message}\nPlease check that the Solana contract address is valid.`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'nav:bundles' }]],
      },
    });
  }
}

/**
 * Broadcast live bundle alert to all users, active groups, and subscribers
 */
export async function broadcastBundleAlert(b: BundleAnalysisResult): Promise<void> {
  const bot = getBot();

  let msg = `🚨 *NEW BUNDLE DETECTED*\n\n`;
  msg += `🪙 *$${b.tokenSymbol}* (\`${b.tokenMint}\`)\n\n`;
  msg += `📦 Bundle Size: *${b.walletCount} wallets*\n`;
  msg += `💰 SOL Spent: *${b.totalSolSpent.toFixed(1)} SOL*`;
  if (b.totalUsdSpent) msg += ` (~$${b.totalUsdSpent.toLocaleString(undefined, { maximumFractionDigits: 0 })} USD)`;
  msg += `\n`;
  msg += `📊 Supply Grabbed: *${b.pctSupplyBought.toFixed(1)}%*\n`;
  msg += `🔗 Bundle Type: *${b.bundleType}*\n`;
  if (b.commonFunder) {
    msg += `🎯 Same Funder: \`${b.commonFunder.slice(0, 6)}...${b.commonFunder.slice(-6)}\`\n`;
  }

  msg += `\n${b.riskEmoji} *Risk Score: ${b.riskScore}/100 (${b.riskLevel})*\n`;
  msg += `⚠️ _${b.recommendation}_\n\n`;
  msg += `🤖 *Agentic Tip:* Tap *[🤖 AI Swarm Council]* to audit this launch before buying.`;

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: `🔍 Full Analysis`, callback_data: `bundle:view:${b.tokenMint}` },
        { text: `🤖 AI Swarm Council`, callback_data: `swarm:analyze:${b.tokenMint}` },
      ],
      [
        { text: '🛡️ RugCheck', url: `https://rugcheck.xyz/tokens/${b.tokenMint}` },
        { text: '📊 Chart', url: `https://dexscreener.com/solana/${b.tokenMint}` },
      ],
      [
        { text: '🚨 All Bundles', callback_data: 'nav:bundles' },
        { text: '💳 Fund Wallet (Coinbase)', callback_data: 'wallet:deposit' },
      ],
    ],
  };

  // Broadcast to all users and groups
  const [users, groups] = await Promise.all([
    prisma.userPoints.findMany({ select: { userChatId: true } }),
    prisma.group.findMany({ where: { isActive: true }, select: { groupId: true } }),
  ]);

  const targetChats = new Set<string>();
  if (config.TELEGRAM_CHAT_ID) targetChats.add(String(config.TELEGRAM_CHAT_ID));
  users.forEach(u => targetChats.add(u.userChatId));
  groups.forEach(g => targetChats.add(g.groupId));

  for (const chatId of targetChats) {
    bot.sendMessage(chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
      disable_web_page_preview: true,
    }).catch(() => {});
  }
}

/**
 * Broadcast Auto-Ranked Bundle Radar Alert (Top 3-5 latest bundled launches)
 */
export async function broadcastBundleRadarAlert(): Promise<void> {
  const bot = getBot();
  const bundles = await prisma.bundleDetection.findMany({
    orderBy: [{ riskScore: 'desc' }, { createdAt: 'desc' }],
    take: 3,
  });

  if (bundles.length === 0) return;

  let msg = `🚨 *LIVE BUNDLE RADAR — Top Ranked Bundled Launches*\n\n`;
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

  msg += `🤖 *AGENTIC RECOMMENDATION:*\n`;
  msg += `💡 _Do not ape blindly! Use the 5-Agent AI Swarm Council (/agent) to audit honeypot risks, sentiment, and liquidity before trading._`;

  const tokenButtons: any[] = [];
  bundles.slice(0, 3).forEach((b, i) => {
    tokenButtons.push({
      text: `🔍 #${i + 1} $${b.tokenSymbol}`,
      callback_data: `bundle:view:${b.tokenMint}`,
    });
  });

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      tokenButtons.length > 0 ? tokenButtons : [],
      [
        { text: '🤖 AI Swarm Council', callback_data: 'swarm:search' },
        { text: '💳 Fund via Coinbase', callback_data: 'wallet:deposit' },
      ],
      [
        { text: '🚨 View All Bundles', callback_data: 'nav:bundles' },
        { text: '🐋 Whale Tracker', callback_data: 'nav:wallets' },
      ],
    ].filter(row => row.length > 0),
  };

  // Broadcast to all active users and groups
  const [users, groups] = await Promise.all([
    prisma.userPoints.findMany({ select: { userChatId: true } }),
    prisma.group.findMany({ where: { isActive: true }, select: { groupId: true } }),
  ]);

  const targetChats = new Set<string>();
  if (config.TELEGRAM_CHAT_ID) targetChats.add(String(config.TELEGRAM_CHAT_ID));
  users.forEach(u => targetChats.add(u.userChatId));
  groups.forEach(g => targetChats.add(g.groupId));

  for (const chatId of targetChats) {
    bot.sendMessage(chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
      disable_web_page_preview: true,
    }).catch(() => {});
  }
}

/**
 * Show Bundle Alert Subscription Settings
 */
export async function showBundleSettings(chatId: number | string): Promise<void> {
  const bot = getBot();
  const sub = await prisma.bundleAlertSubscription.findUnique({
    where: { userChatId: String(chatId) },
  });

  const isActive = sub ? sub.isActive : true;
  const minScore = sub ? sub.minRiskScore : 60;

  let msg = `🔔 *Bundle Alert Notification Settings*\n\n`;
  msg += `Status: ${isActive ? '🟢 **ACTIVE**' : '🔴 **DISABLED**'}\n`;
  msg += `Risk Threshold: *${minScore}/100* (Alerts sent when Risk $\\ge$ ${minScore})\n\n`;
  msg += `Select sensitivity to configure when you receive instant bundle alerts:`;

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: minScore === 40 ? '✅ Medium (40+)' : 'Medium (40+)', callback_data: 'bundle:set_thresh:40' },
        { text: minScore === 60 ? '✅ High (60+)' : 'High (60+)', callback_data: 'bundle:set_thresh:60' },
        { text: minScore === 80 ? '✅ Extreme (80+)' : 'Extreme (80+)', callback_data: 'bundle:set_thresh:80' },
      ],
      [
        { text: isActive ? '🔕 Mute Alerts' : '🔔 Enable Alerts', callback_data: `bundle:toggle_sub:${isActive ? 'off' : 'on'}` },
      ],
      [{ text: '⬅️ Back to Bundles', callback_data: 'nav:bundles' }],
    ],
  };

  await bot.sendMessage(chatId, msg, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}
