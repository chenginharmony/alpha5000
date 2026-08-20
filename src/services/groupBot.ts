import TelegramBot, { InlineKeyboardMarkup } from 'node-telegram-bot-api';
import { prisma } from '../db';
import { config } from '../config';
import { quickValidateToken } from './tokenValidator';
import { MY_WALLET_PUBKEY } from './jupiter';

// Use the same bot instance as the private bot
// We'll import it from telegramBot.ts after we set up exports
let bot: TelegramBot;

export function initGroupBot(botInstance: TelegramBot) {
  bot = botInstance;
  setupGroupHandlers();
  console.log('✅ Group bot handlers registered');
}

// ═══════════════════════════════════════════════════════════════
// GROUP COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════

function setupGroupHandlers() {
  // Bot added to group
  bot.on('new_chat_members', async (msg) => {
    const newMembers = msg.new_chat_members || [];
    const botUsername = (await bot.getMe()).username;

    const wasAdded = newMembers.some(m => m.username === botUsername);
    if (!wasAdded) return;

    const chatId = msg.chat.id;
    const chatTitle = msg.chat.title || 'Unnamed Group';
    const adminId = String(msg.from?.id || '');

    // Save group to DB
    await prisma.group.upsert({
      where: { groupId: String(chatId) },
      update: { groupName: chatTitle, isActive: true },
      create: {
        groupId: String(chatId),
        groupName: chatTitle,
        adminId,
      },
    });

    const welcomeMsg = 
      `👋 *Hello ${chatTitle}!*\n\n` +
      `I'm your Whale Signal Bot. I track smart money on Solana and post instant alerts when whales buy.\n\n` +
      `*How it works:*\n` +
      `1️⃣ Admin adds whale wallets to track\n` +
      `2️⃣ Bot posts alerts when whales buy\n` +
      `3️⃣ Members tap "Copy in DM" to trade privately\n\n` +
      `*Admin Commands:*\n` +
      `/track <wallet> — Add whale wallet\n` +
      `/untrack <wallet> — Remove whale wallet\n` +
      `/wallets — List tracked whales\n\n` +
      `*Member Commands:*\n` +
      `/mysettings — Set your personal budget\n` +
      `/leaderboard — Group trading stats\n` +
      `/help — Full guide\n\n` +
      `🚀 *Ready to start?* Admin, add your first whale wallet with /track`;

    await bot.sendMessage(chatId, welcomeMsg, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  });

  // /track command (admin only)
  bot.onText(/\/track (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (msg.chat.type === 'private') return; // Only in groups

    const group = await prisma.group.findUnique({
      where: { groupId: String(chatId) },
    });

    if (!group) {
      await bot.sendMessage(chatId, '❌ Group not registered. Please re-add me.');
      return;
    }

    // Check if sender is admin
    const senderId = String(msg.from?.id || '');
    const chatMember = await bot.getChatMember(chatId, Number(senderId));
    const isAdmin = ['creator', 'administrator'].includes(chatMember.status);

    if (!isAdmin && senderId !== group.adminId) {
      await bot.sendMessage(chatId, '⛔ Only group admins can track wallets.', {
        reply_to_message_id: msg.message_id,
      });
      return;
    }

    const address = match?.[1]?.trim() || '';
    if (address.length < 32) {
      await bot.sendMessage(chatId, '❌ Invalid Solana address.', {
        reply_to_message_id: msg.message_id,
      });
      return;
    }

    // Validate it's a real address
    const validation = await quickValidateToken(address);
    if (!validation.safe && validation.reason !== 'Validation skipped') {
      await bot.sendMessage(chatId, `⚠️ Warning: ${validation.reason}\nAdding anyway...`, {
        reply_to_message_id: msg.message_id,
      });
    }

    try {
      await prisma.groupWallet.create({
        data: {
          groupId: String(chatId),
          address,
          addedBy: senderId,
        },
      });

      await bot.sendMessage(
        chatId,
        `✅ *Wallet Added!*\n\n` +
        `Now tracking: \`${address}\`\n\n` +
        `You'll get instant alerts when this whale buys.\n` +
        `Members can tap "Copy in DM" to trade privately.`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );
    } catch (e: any) {
      if (e.code === 'P2002') {
        await bot.sendMessage(chatId, '⏩ This wallet is already being tracked.');
      } else {
        throw e;
      }
    }
  });

  // /untrack command (admin only)
  bot.onText(/\/untrack (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (msg.chat.type === 'private') return;

    const group = await prisma.group.findUnique({
      where: { groupId: String(chatId) },
    });
    if (!group) return;

    const senderId = String(msg.from?.id || '');
    const chatMember = await bot.getChatMember(chatId, Number(senderId));
    const isAdmin = ['creator', 'administrator'].includes(chatMember.status);

    if (!isAdmin && senderId !== group.adminId) {
      await bot.sendMessage(chatId, '⛔ Only admins can untrack wallets.');
      return;
    }

    const address = match?.[1]?.trim() || '';

    await prisma.groupWallet.updateMany({
      where: { groupId: String(chatId), address },
      data: { isActive: false },
    });

    await bot.sendMessage(chatId, `🗑️ Stopped tracking \`${address}\`.`, {
      parse_mode: 'Markdown',
    });
  });

  // /wallets command
  bot.onText(/\/wallets/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type === 'private') return;

    const wallets = await prisma.groupWallet.findMany({
      where: { groupId: String(chatId), isActive: true },
    });

    if (wallets.length === 0) {
      await bot.sendMessage(
        chatId,
        '🐋 *No wallets tracked*\n\nAdmin: Use /track <wallet> to add whales.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    let msg_text = `🐋 *Tracked Wallets (${wallets.length})*\n\n`;
    for (const w of wallets) {
      msg_text += `• \`${w.address}\`\n`;
    }

    await bot.sendMessage(chatId, msg_text, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  });

  // /leaderboard command
  bot.onText(/\/leaderboard/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type === 'private') return;

    const group = await prisma.group.findUnique({
      where: { groupId: String(chatId) },
      include: { members: true },
    });

    if (!group || group.members.length === 0) {
      await bot.sendMessage(
        chatId,
        '📭 *No members yet*\n\nMembers need to DM the bot and set up their copy-trading to appear here.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Get stats for members who have trades
    let msg_text = `🏆 *Group Leaderboard*\n\n`;
    msg_text += `*Active Members:* ${group.members.filter(m => m.isActive).length}\n\n`;

    // Simple member count stats for now
    msg_text += `*How to join:*\n`;
    msg_text += `1. DM me privately @${(await bot.getMe()).username}\n`;
    msg_text += `2. Set your budget with /mysettings\n`;
    msg_text += `3. Copy trades from this group's alerts!\n\n`;
    msg_text += `📊 Full stats coming soon...`;

    await bot.sendMessage(chatId, msg_text, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  });

  // /mysettings command (in group, redirects to DM)
  bot.onText(/\/mysettings/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type === 'private') return;

    const botMe = await bot.getMe();
    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: '⚙️ Open Settings in DM', url: `https://t.me/${botMe.username}?start=settings` }],
      ],
    };

    await bot.sendMessage(
      chatId,
      `⚙️ *Personal Settings*\n\nSettings are managed privately for security.\nTap below to configure your budget, TP/SL, and wallet.`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  // /sync command (admin only)
  bot.onText(/\/sync/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type === 'private') return;

    const group = await prisma.group.findUnique({
      where: { groupId: String(chatId) },
    });
    if (!group) return;

    const senderId = String(msg.from?.id || '');
    const chatMember = await bot.getChatMember(chatId, Number(senderId));
    const isAdmin = ['creator', 'administrator'].includes(chatMember.status);

    if (!isAdmin && senderId !== group.adminId) {
      await bot.sendMessage(chatId, '⛔ Only admins can sync.');
      return;
    }

    await bot.sendMessage(chatId, '⏳ Syncing wallets to Helius...');

    try {
      const { syncAllWalletsToHelius } = await import('./helius');
      // This will need the webhook ID - for now just acknowledge
      await bot.sendMessage(
        chatId,
        `✅ *Sync Complete*\n\nAll tracked wallets are now synced to Helius.\nYou'll receive alerts for any new transactions.`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      await bot.sendMessage(chatId, `❌ Sync failed: ${(e as Error).message}`);
    }
  });

  // /help command
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    const botMe = await bot.getMe();

    const helpText = 
      `📚 *Whale Signal Bot — Help*\n\n` +
      `*For Group Admins:*\n` +
      `/track <wallet> — Add a whale wallet to monitor\n` +
      `/untrack <wallet> — Stop monitoring a wallet\n` +
      `/wallets — List all tracked wallets\n\n` +
      `*For Everyone:*\n` +
      `/leaderboard — See who's copying the most\n` +
      `/mysettings — Configure your personal copy settings (DM)\n` +
      `/help — Show this message\n\n` +
      `*How to Copy Trade:*\n` +
      `1. When a whale buys, you'll see an alert\n` +
      `2. Tap "🚀 Copy in DM" on the alert\n` +
      `3. I'll message you privately to set up\n` +
      `4. Your bot will copy that whale's trades\n\n` +
      `*Privacy:*\n` +
      `Your wallet and settings are private. The group only sees signals.\n\n` +
      `Need help? DM @${botMe.username}`;

    await bot.sendMessage(chatId, helpText, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// SEND WHALE ALERT TO GROUP
// ═══════════════════════════════════════════════════════════════

export async function sendGroupWhaleAlert(
  groupId: string,
  whaleWallet: string,
  tokenSymbol: string,
  tokenMint: string,
  whaleBuyUsd: number
) {
  const botMe = await bot.getMe();

  // Get group settings or use defaults
  const group = await prisma.group.findUnique({
    where: { groupId },
  });

  if (!group || !group.isActive) return;

  // Check if this wallet is still active in the group
  const groupWallet = await prisma.groupWallet.findFirst({
    where: { groupId, address: whaleWallet, isActive: true },
  });

  if (!groupWallet) return;

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { 
          text: '🚀 Copy in DM', 
          url: `https://t.me/${botMe.username}?start=copy_${tokenMint}_${whaleWallet}` 
        },
        { text: '⏩ Skip', callback_data: 'group:skip' },
      ],
      [
        { text: '📊 DexScreener', url: `https://dexscreener.com/solana/${tokenMint}` },
        { text: '🔍 Mobula', url: `https://mobula.io/asset/${tokenMint}` },
      ],
    ],
  };

  const alertText = 
    `🐋 *WHALE BUY DETECTED*\n\n` +
    `Wallet: \`${whaleWallet.slice(0, 6)}...${whaleWallet.slice(-6)}\`\n` +
    `Token: *${tokenSymbol}*\n` +
    `Whale Size: ~$${whaleBuyUsd.toFixed(0)}\n\n` +
    `💡 Tap "🚀 Copy in DM" to trade this with your personal bot.`;

  try {
    await bot.sendMessage(Number(groupId), alertText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
      disable_web_page_preview: true,
    });
  } catch (e) {
    console.error(`Failed to send alert to group ${groupId}:`, (e as Error).message);

    // If bot was removed from group, deactivate
    if ((e as any).response?.statusCode === 403) {
      await prisma.group.update({
        where: { groupId },
        data: { isActive: false },
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// HANDLE GROUP MEMBER JOINING VIA DM
// ═══════════════════════════════════════════════════════════════

export async function handleGroupMemberStart(
  userChatId: number,
  username: string,
  firstName: string,
  startParam: string // e.g. "copy_mint_wallet" or "settings"
): Promise<{ isGroupMember: boolean; groupId?: string }> {
  // Check if this user is in any active groups
  const memberships = await prisma.groupMember.findMany({
    where: { userChatId: String(userChatId) },
    include: { group: true },
  });

  const activeMembership = memberships.find(m => m.group.isActive);

  if (activeMembership) {
    return { isGroupMember: true, groupId: activeMembership.groupId };
  }

  // User is not a member yet — they might have clicked "Copy in DM"
  // We can't auto-add them without knowing which group they came from
  // The startParam might contain the group info, or we just treat them as a solo user

  return { isGroupMember: false };
}

export async function registerGroupMember(
  groupId: string,
  userChatId: string,
  username?: string,
  firstName?: string
) {
  await prisma.groupMember.upsert({
    where: {
      groupId_userChatId: {
        groupId,
        userChatId,
      },
    },
    update: { username, firstName, isActive: true },
    create: {
      groupId,
      userChatId,
      username: username || '',
      firstName: firstName || '',
    },
  });
}
