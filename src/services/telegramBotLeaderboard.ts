import { bot, CHAT_ID, MAIN_MENU, BACK_MENU, inlineBackButton } from './telegramBot';
import { prisma } from '../db';
import {
  getWalletLeaderboard,
  getTrendingTokensList,
  discoverWalletsFromTrending,
  syncTrackedWalletAnalytics,
} from './walletDiscovery';
import { InlineKeyboardMarkup } from 'node-telegram-bot-api';

// ═══════════════════════════════════════════════════════════════
// LEADERBOARD & DISCOVERY UI
// ═══════════════════════════════════════════════════════════════

export async function showLeaderboard(chatId: number) {
  const { tracked, discovered } = await getWalletLeaderboard(15);

  // Tracked Wallets Section
  let msg = `🏆 *Wallet Leaderboard*\n\n`;
  msg += `*Your Tracked Wallets (${tracked.length})*\n`;

  if (tracked.length === 0) {
    msg += `_No analytics yet. Add wallets and let the bot track them._\n\n`;
  } else {
    for (let i = 0; i < Math.min(tracked.length, 10); i++) {
      const w = tracked[i];
      const rank = w.rank || i + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
      const pnlEmoji = Number(w.totalPnlPercent) >= 0 ? '🟢' : '🔴';
      const tags = w.walletTags.length > 0 ? ` [${w.walletTags.slice(0, 2).join(', ')}]` : '';

      msg += `${medal} \`${w.walletAddress.slice(0, 6)}...${w.walletAddress.slice(-6)}\`${tags}\n`;
      msg += `   Score: ${Number(w.score).toFixed(1)}/100 | Win Rate: ${Number(w.winRate).toFixed(0)}%\n`;
      msg += `   Trades: ${w.totalTrades} | P&L: ${pnlEmoji} ${Number(w.totalPnlPercent).toFixed(1)}%\n`;
      if (w.netWorthSol) {
        msg += `   💰 Net Worth: ${Number(w.netWorthSol).toFixed(2)} SOL\n`;
      }
      msg += `\n`;
    }
  }

  // Discovered Wallets Section
  msg += `*🔥 Hot Wallets to Track (${discovered.length})*\n`;
  msg += `_From trending tokens & top traders_\n\n`;

  if (discovered.length === 0) {
    msg += `_No discoveries yet. Run discovery or check back later._\n`;
  } else {
    for (let i = 0; i < Math.min(discovered.length, 5); i++) {
      const d = discovered[i];
      const tags = d.walletTags.length > 0 ? ` [${d.walletTags.slice(0, 2).join(', ')}]` : '';
      const pnlEmoji = Number(d.pnl24h || 0) >= 0 ? '🟢' : '🔴';

      msg += `${i + 1}. \`${d.address.slice(0, 6)}...${d.address.slice(-6)}\`${tags}\n`;
      msg += `   P&L 24h: ${pnlEmoji} $${Number(d.pnl24h || 0).toFixed(0)}`;
      if (d.tokenSymbol) msg += ` | Via ${d.tokenSymbol}`;
      msg += `\n`;
      if (d.netWorthSol) {
        msg += `   💰 Worth: ${Number(d.netWorthSol).toFixed(2)} SOL\n`;
      }
      msg += `\n`;
    }
  }

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: '🔍 Discover New Wallets', callback_data: 'discovery:run' }],
      [{ text: '📈 Trending Tokens', callback_data: 'discovery:trending' }],
      [{ text: '🔄 Sync Analytics', callback_data: 'discovery:sync' }],
      [{ text: '⬅️ Back', callback_data: 'nav:main' }],
    ],
  };

  await bot.sendMessage(chatId, msg, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
    disable_web_page_preview: true,
  });
}

export async function showTrendingTokens(chatId: number) {
  const tokens = await getTrendingTokensList(10);

  if (tokens.length === 0) {
    await bot.sendMessage(chatId, '📭 *No trending tokens found*\n\nTry running discovery first.', {
      parse_mode: 'Markdown',
      reply_markup: inlineBackButton('leaderboard'),
    });
    return;
  }

  let msg = `📈 *Trending Tokens (${tokens.length})*\n\n`;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const changeEmoji = Number(t.priceChange24h || 0) >= 0 ? '🟢' : '🔴';

    msg += `${i + 1}. *${t.tokenSymbol}* ${t.tokenName ? `(${t.tokenName})` : ''}\n`;
    msg += `   Price: $${Number(t.priceUsd || 0).toExponential(4)}\n`;
    msg += `   24h Change: ${changeEmoji} ${Number(t.priceChange24h || 0).toFixed(2)}%\n`;
    msg += `   Volume: $${Number(t.volume24h || 0).toFixed(0)} | MCap: $${Number(t.marketCap || 0).toFixed(0)}\n`;
    msg += `   [DexScreener](https://dexscreener.com/solana/${t.tokenMint})\n\n`;
  }

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: '🔍 Find Top Traders for #1', callback_data: `discovery:traders:${tokens[0].tokenMint}` }],
      [{ text: '⬅️ Back', callback_data: 'nav:leaderboard' }],
    ],
  };

  await bot.sendMessage(chatId, msg, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
    disable_web_page_preview: true,
  });
}

export async function showDiscoveredWallets(chatId: number) {
  const discovered = await prisma.discoveredWallet.findMany({
    where: { isAdded: false },
    orderBy: { pnl24h: 'desc' },
    take: 15,
  });

  if (discovered.length === 0) {
    await bot.sendMessage(chatId, '🔍 *No discovered wallets*\n\nRun discovery to find hot wallets.', {
      parse_mode: 'Markdown',
      reply_markup: inlineBackButton('leaderboard'),
    });
    return;
  }

  for (let i = 0; i < discovered.length; i++) {
    const d = discovered[i];
    const tags = d.walletTags.length > 0 ? `\n🏷️ Tags: ${d.walletTags.join(', ')}` : '';
    const pnlEmoji = Number(d.pnl24h || 0) >= 0 ? '🟢' : '🔴';

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: '➕ Track This Wallet', callback_data: `discovery:add:${d.id}` }],
        [{ text: '📊 View on Solscan', url: `https://solscan.io/account/${d.address}` }],
      ],
    };

    await bot.sendMessage(
      chatId,
      `${i + 1}. \`${d.address}\`\n` +
      `💰 P&L 24h: ${pnlEmoji} $${Number(d.pnl24h || 0).toFixed(0)}\n` +
      `📊 Volume: $${Number(d.volume24h || 0).toFixed(0)} | Trades: ${d.tradeCount24h || 0}` +
      `${tags}\n` +
      `${d.tokenSymbol ? `🔥 From: ${d.tokenSymbol}` : ''}`,
      { parse_mode: 'Markdown', reply_markup: keyboard, disable_web_page_preview: true }
    );
  }

  await bot.sendMessage(chatId, `Found ${discovered.length} wallets. Tap ➕ to track any.`, {
    reply_markup: inlineBackButton('leaderboard'),
  });
}

// ═══════════════════════════════════════════════════════════════
// CALLBACK HANDLERS FOR DISCOVERY
// ═══════════════════════════════════════════════════════════════

export async function handleDiscoveryCallback(data: string, chatId: number, msgId?: number): Promise<boolean> {
  if (!data.startsWith('discovery:')) return false;

  const action = data.split(':')[1];

  if (action === 'run') {
    await bot.editMessageText('⏳ *Scanning trending tokens & top traders...*\nThis may take 30-60s.', {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'Markdown',
    });

    try {
      const count = await discoverWalletsFromTrending();
      const topWallets = await prisma.discoveredWallet.findMany({
        where: { isAdded: false },
        orderBy: { pnl24h: 'desc' },
        take: 5,
      });

      let msg = `✅ *Discovery Complete*\n\nFound *${count}* new high-performing wallets from trending tokens.\n\n*Top Discovered Wallets:*\n`;
      for (let i = 0; i < Math.min(topWallets.length, 5); i++) {
        const w = topWallets[i];
        const tags = w.walletTags && w.walletTags.length > 0 ? ` [${w.walletTags.slice(0, 2).join(', ')}]` : '';
        const pnlEmoji = Number(w.pnl24h || 0) >= 0 ? '🟢' : '🔴';
        msg += `\n${i + 1}. \`${w.address.slice(0, 6)}...${w.address.slice(-6)}\`${tags}\n`;
        msg += `   💰 24h P&L: ${pnlEmoji} $${Number(w.pnl24h || 0).toFixed(0)}`;
        if (w.tokenSymbol) msg += ` | Via *${w.tokenSymbol}*`;
        msg += `\n`;
      }

      msg += `\nTap below to view full details and track these wallets:`;

      await bot.editMessageText(
        msg,
        {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🏆 Open Leaderboard', callback_data: 'nav:leaderboard' }],
              [{ text: '🔥 View Discovered Wallets', callback_data: 'discovery:view' }],
              [{ text: '⬅️ Back', callback_data: 'nav:main' }],
            ],
          },
        }
      );
    } catch (e) {
      await bot.editMessageText(
        `❌ *Discovery Failed*\n\n${(e as Error).message}\n\nMake sure MOBULA_API_KEY is set.`,
        {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: 'Markdown',
          reply_markup: inlineBackButton('leaderboard'),
        }
      );
    }
    return true;
  }

  if (action === 'sync') {
    await bot.editMessageText('⏳ *Syncing wallet analytics...*', {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'Markdown',
    });

    try {
      await syncTrackedWalletAnalytics();
      await bot.editMessageText('✅ *Analytics Synced!*\nWallet scores updated.', {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: inlineBackButton('leaderboard'),
      });
    } catch (e) {
      await bot.editMessageText(`❌ Sync failed: ${(e as Error).message}`, {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: inlineBackButton('leaderboard'),
      });
    }
    return true;
  }

  if (action === 'trending') {
    if (msgId) await bot.deleteMessage(chatId, msgId).catch(() => {});
    await showTrendingTokens(chatId);
    return true;
  }

  if (action === 'view') {
    if (msgId) await bot.deleteMessage(chatId, msgId).catch(() => {});
    await showDiscoveredWallets(chatId);
    return true;
  }

  if (action === 'add') {
    const walletId = data.split(':')[2];
    const disc = await prisma.discoveredWallet.findUnique({ where: { id: walletId } });
    if (!disc) {
      await bot.sendMessage(chatId, '❌ Wallet not found.', { reply_markup: MAIN_MENU });
      return true;
    }

    await prisma.watchedWallet.upsert({
      where: { address: disc.address },
      update: { isActive: true },
      create: { address: disc.address, label: `Discovered: ${disc.tokenSymbol || 'Unknown'}` },
    });

    await prisma.discoveredWallet.update({
      where: { id: walletId },
      data: { isAdded: true, addedAt: new Date() },
    });

    await bot.sendMessage(
      chatId,
      `✅ *Wallet Added!*\n\nNow tracking: \`${disc.address}\`\nSource: ${disc.tokenSymbol || 'Discovery'}`,
      { parse_mode: 'Markdown', reply_markup: MAIN_MENU }
    );
    return true;
  }

  if (action === 'traders') {
    const tokenMint = data.split(':')[2];
    if (!tokenMint) return true;

    await bot.editMessageText('⏳ *Fetching top traders...*', {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'Markdown',
    });

    try {
      const { fetchTopTradersForToken } = await import('./walletDiscovery');
      const traders = await fetchTopTradersForToken(tokenMint, '24h', 10);

      if (traders.length === 0) {
        await bot.editMessageText('📭 No top traders found for this token.', {
          chat_id: chatId,
          message_id: msgId,
          reply_markup: inlineBackButton('leaderboard'),
        });
        return true;
      }

      let msg = `🔥 *Top Traders for Token*\n\n`;
      for (let i = 0; i < Math.min(traders.length, 5); i++) {
        const t = traders[i];
        const tags = t.tags.length > 0 ? ` [${t.tags.slice(0, 2).join(', ')}]` : '';
        msg += `${i + 1}. \`${t.owner.slice(0, 6)}...${t.owner.slice(-6)}\`${tags}\n`;
        msg += `   P&L: $${t.totalPnl.toFixed(0)} | Vol: $${t.volumeUsd.toFixed(0)} | Trades: ${t.trade}\n`;
        msg += `   💰 Worth: ${(t.solBalance || t.netWorth || 0).toFixed(2)} SOL\n\n`;
      }

      await bot.editMessageText(msg, {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Back', callback_data: 'discovery:trending' }],
          ],
        },
      });
    } catch (e) {
      await bot.editMessageText(`❌ Failed: ${(e as Error).message}`, {
        chat_id: chatId,
        message_id: msgId,
        reply_markup: inlineBackButton('leaderboard'),
      });
    }
    return true;
  }

  return false;
}
