import TelegramBot, { InlineKeyboardMarkup } from 'node-telegram-bot-api';
import { config } from '../config';
import { runSwarmCouncilAnalysis, SwarmAnalysisResult } from './aiSwarm';

let botInstance: TelegramBot | null = null;

export function setSwarmBotInstance(bot: TelegramBot) {
  botInstance = bot;
}

function getBot(): TelegramBot {
  if (!botInstance) {
    botInstance = new TelegramBot(config.TELEGRAM_BOT_TOKEN);
  }
  return botInstance;
}

/**
 * Display Swarm Council Overview Dashboard
 */
export async function showSwarmDashboard(chatId: number | string): Promise<void> {
  const bot = getBot();

  let msg = `🤖 *ALPHA5000 MULTI-AGENT SWARM COUNCIL*\n\n`;
  msg += `Instead of one bot, run 5 specialized AI agents that debate trades in real-time before you buy:\n\n`;

  msg += `👥 *The 5 Council Agents:*\n`;
  msg += `• 🕵️ *Sniper Agent*: Detects volume surges, liquidity depth, and launch velocity\n`;
  msg += `• 🛡️ *Safety Agent*: Runs RugCheck & bundle analysis (*Holds Veto Power*)\n`;
  msg += `• 📊 *Sentiment Agent*: Tracks Twitter/X hype, community presence, and DEX boosts\n`;
  msg += `• 💰 *Portfolio Agent*: Manages risk sizing and allocation based on your SOL balance\n`;
  msg += `• 🎯 *Execution Agent*: Optimizes routing, slippage, and Jito MEV frontrun defense\n\n`;

  msg += `💡 _Send any Solana contract address or use \`/swarm <address>\` to convene the AI Council!_`;

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: '🔍 Debate a Token with Swarm', callback_data: 'swarm:search' }],
      [
        { text: '🚨 Bundle Detector', callback_data: 'nav:bundles' },
        { text: '🏆 Leaderboard', callback_data: 'nav:leaderboard' },
      ],
      [{ text: '⬅️ Main Menu', callback_data: 'nav:main' }],
    ],
  };

  await bot.sendMessage(chatId, msg, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

/**
 * Run and Render the Multi-Agent Council Debate
 */
export async function showSwarmAnalysis(chatId: number | string, tokenMint: string): Promise<void> {
  const bot = getBot();

  const loadingMsg = await bot.sendMessage(
    chatId,
    `🤖 *Convening AI Swarm Council...*\n\n` +
    `🕵️ Sniper, 🛡️ Safety, 📊 Sentiment, 💰 Portfolio, and 🎯 Execution agents are analyzing \`${tokenMint.slice(0, 8)}...\``,
    { parse_mode: 'Markdown' }
  );

  try {
    const result: SwarmAnalysisResult = await runSwarmCouncilAnalysis(tokenMint, chatId);

    let msg = `🤖 *Agent Council: $${result.tokenSymbol}*\n\n`;

    // Render individual agent quotes and dialogue
    for (const agent of result.agents) {
      const voteBadge = agent.vote === 'BUY' ? '🟢' : agent.vote === 'CAUTION' ? '🟡' : '🔴';
      msg += `${agent.emoji} *${agent.name}* ${voteBadge}:\n`;
      msg += `"${agent.quote}"\n\n`;
    }

    // Consensus Box
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚖️ *SWARM DECISION: ${result.decision} ${result.decisionEmoji}* (Score: *${result.consensusScore}/100*)\n`;
    msg += `💡 *Consensus:* _${result.reasoning}_\n\n`;

    if (result.decision !== 'PASS') {
      msg += `🎯 *Recommended Sizing:* *${result.recommendedSolSize} SOL* (~$${result.recommendedUsdSize.toFixed(2)} USD)\n`;
      msg += `⚡ *Routing:* ${(result.recommendedSlippageBps / 100).toFixed(1)}% Slippage • ${result.jitoProtection ? '🛡️ Jito MEV Tip Enabled' : 'Standard Priority'}\n`;
    }

    const tradeButtonText =
      result.decision === 'BUY'
        ? `⚡ Execute Buy (${result.recommendedSolSize} SOL)`
        : result.decision === 'CAUTION'
        ? `⚡ Quick Buy (Small ${result.recommendedSolSize} SOL)`
        : `⚡ Override & Buy ($6.00)`;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: tradeButtonText, callback_data: `buy:${result.tokenMint}` },
          { text: '🔄 Re-Debate', callback_data: `swarm:analyze:${result.tokenMint}` },
        ],
        [
          { text: '🛡️ RugCheck Scan', url: `https://rugcheck.xyz/tokens/${result.tokenMint}` },
          { text: '📊 DexScreener', url: `https://dexscreener.com/solana/${result.tokenMint}` },
        ],
        [{ text: '⬅️ Back to Swarm', callback_data: 'nav:swarm' }],
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
    await bot.sendMessage(
      chatId,
      `❌ *Swarm Council Error*: ${(e as Error).message}\nPlease verify that the contract address is a valid Solana token.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '⬅️ Back to Swarm', callback_data: 'nav:swarm' }]],
        },
      }
    );
  }
}
