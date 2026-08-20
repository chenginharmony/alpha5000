import fetch from 'cross-fetch';
import { config } from '../config';
import { prisma } from '../db';
import { executeBuy } from './jupiter';
import { quickValidateToken } from './tokenValidator';
import {
  sendBuySuccessAlert,
  sendBuyFailAlert,
} from './telegramBot';
import { sendGroupWhaleAlert } from './groupBot';

interface HeliusWebhookPayload {
  signature: string;
  feePayer: string;
  timestamp: string;
  nativeBalanceChange: number;
  tokenBalanceChanges: TokenBalanceChange[];
  accountData?: AccountData[];
  description?: string;
  type?: string;
  source?: string;
}

interface TokenBalanceChange {
  userAccount: string;
  tokenAccount: string;
  mint: string;
  rawTokenAmount: {
    tokenAmount: string;
    decimals: number;
  };
  tokenBalanceChange: string;
}

interface AccountData {
  account: string;
  nativeBalanceChange?: number;
}

const seenSignatures = new Set<string>();
const MAX_SEEN = 1000;
const tokenMetaCache = new Map<string, { symbol: string; decimals: number; ts: number }>();

async function getTokenMeta(mint: string): Promise<{ symbol: string; decimals: number }> {
  const cached = tokenMetaCache.get(mint);
  if (cached && Date.now() - cached.ts < 300000) {
    return { symbol: cached.symbol, decimals: cached.decimals };
  }

  try {
    const res = await fetch(`https://token.jup.ag/all`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const tokens = await res.json();
      const token = tokens.find((t: any) => t.address === mint);
      if (token) {
        const meta = { symbol: token.symbol || 'UNKNOWN', decimals: token.decimals || 6 };
        tokenMetaCache.set(mint, { ...meta, ts: Date.now() });
        return meta;
      }
    }
  } catch { /* ignore */ }

  const meta = { symbol: mint.slice(0, 4) + '...' + mint.slice(-4), decimals: 6 };
  tokenMetaCache.set(mint, { ...meta, ts: Date.now() });
  return meta;
}

export async function handleHeliusWebhook(payload: HeliusWebhookPayload): Promise<void> {
  const startTime = Date.now();

  // 1. Deduplicate
  if (seenSignatures.has(payload.signature)) {
    return;
  }
  seenSignatures.add(payload.signature);
  if (seenSignatures.size > MAX_SEEN) {
    const iter = seenSignatures.values();
    for (let i = 0; i < seenSignatures.size - MAX_SEEN; i++) {
      const val = iter.next().value;
      if (val) seenSignatures.delete(val);
    }
  }

  const whaleWallet = payload.feePayer;

  // 2. Check if this wallet is tracked anywhere
  const [personalWatched, groupWallets] = await Promise.all([
    prisma.watchedWallet.findUnique({ where: { address: whaleWallet } }),
    prisma.groupWallet.findMany({ where: { address: whaleWallet, isActive: true } }),
  ]);

  const isPersonalTracked = personalWatched?.isActive || false;
  const isGroupTracked = groupWallets.length > 0;

  if (!isPersonalTracked && !isGroupTracked) {
    return;
  }

  // 3. Check personal bot is running
  let settings = await prisma.settings.findFirst();
  const isPersonalRunning = settings?.isRunning || false;

  // 4. Detect BUY
  const solChange = Math.abs(payload.nativeBalanceChange) / 1e9;
  const minBuy = Number(settings?.minWhaleBuy || 100);

  if (solChange < minBuy / 150) {
    return;
  }

  const buys = payload.tokenBalanceChanges.filter(
    (tbc) => tbc.userAccount === whaleWallet && parseFloat(tbc.tokenBalanceChange) > 0
  );

  if (buys.length === 0) {
    return;
  }

  for (const buy of buys) {
    const tokenMint = buy.mint;
    const tokenAmount = parseFloat(buy.rawTokenAmount.tokenAmount) / Math.pow(10, buy.rawTokenAmount.decimals);

    if (tokenMint === 'So11111111111111111111111111111111111111112') continue;

    const existing = await prisma.trade.findFirst({
      where: { buyTx: payload.signature, tokenMint },
    });
    if (existing) continue;

    const meta = await getTokenMeta(tokenMint);
    const solPrice = 150;
    const whaleBuyUsd = solChange * solPrice;

    if (whaleBuyUsd < minBuy) {
      console.log(`⏩ Whale buy too small: $${whaleBuyUsd.toFixed(2)} < $${minBuy}`);
      continue;
    }

    console.log(`🐋 WHALE BUY: ${whaleWallet} -> ${meta.symbol} ($${whaleBuyUsd.toFixed(2)})`);

    // 5. Fast validation
    const validation = await quickValidateToken(tokenMint);
    if (!validation.safe) {
      console.log(`⏩ Skipped ${meta.symbol}: ${validation.reason}`);
      continue;
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. PERSONAL BOT COPY TRADE
    // ═══════════════════════════════════════════════════════════════
    if (isPersonalTracked && isPersonalRunning) {
      const budget = Number(settings?.tradeBudget || 6);
      const result = await executeBuy(tokenMint, budget, settings?.slippageBps || 200);
      const elapsed = Date.now() - startTime;

      if (result.success && result.txid) {
        prisma.trade.create({
          data: {
            whaleWallet,
            tokenMint,
            tokenSymbol: meta.symbol,
            tokenDecimals: meta.decimals,
            buyTx: result.txid,
            buyPriceUsd: 0,
            buyAmountUsd: budget,
            buyAmountTokens: tokenAmount,
            status: 'HOLDING',
          },
        }).catch(err => console.error('DB log failed:', err));

        await sendBuySuccessAlert(meta.symbol, result.txid, budget, elapsed);
      } else {
        await sendBuyFailAlert(meta.symbol, result.error || 'Unknown', elapsed);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 7. GROUP ALERTS
    // ═══════════════════════════════════════════════════════════════
    if (isGroupTracked) {
      for (const gw of groupWallets) {
        await sendGroupWhaleAlert(
          gw.groupId,
          whaleWallet,
          meta.symbol,
          tokenMint,
          whaleBuyUsd
        );
      }
    }
  }
}

export async function setupHeliusWebhook(webhookUrl: string): Promise<void> {
  try {
    const [personalWallets, groupWallets] = await Promise.all([
      prisma.watchedWallet.findMany({ where: { isActive: true }, select: { address: true } }),
      prisma.groupWallet.findMany({ where: { isActive: true }, select: { address: true } }),
    ]);

    const allAddresses = Array.from(new Set([
      ...personalWallets.map(w => w.address),
      ...groupWallets.map(w => w.address),
      'MfDuWeqSHEqTFVYZ7LoexgAK9dxk7cy4DFJWjWMGVWa',
    ]));

    // Check existing webhooks first
    const listRes = await fetch('https://api.helius.xyz/v0/webhooks?api-key=' + config.HELIUS_API_KEY);
    if (listRes.ok) {
      const existingWebhooks = await listRes.json();
      if (Array.isArray(existingWebhooks) && existingWebhooks.length > 0) {
        const match = existingWebhooks.find((w: any) => w.webhookURL === webhookUrl) || existingWebhooks[0];
        console.log('✅ Reusing existing Helius webhook:', match.webhookID);

        await fetch(`https://api.helius.xyz/v0/webhooks/${match.webhookID}?api-key=${config.HELIUS_API_KEY}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            webhookURL: webhookUrl,
            accountAddresses: allAddresses,
            transactionTypes: ['ANY'],
            webhookType: 'enhanced',
            authHeader: config.WEBHOOK_SECRET,
          }),
        });

        console.log(`✅ Synced ${allAddresses.length} wallets to existing Helius webhook`);
        return;
      }
    }

    const res = await fetch('https://api.helius.xyz/v0/webhooks?api-key=' + config.HELIUS_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookURL: webhookUrl,
        accountAddresses: allAddresses,
        transactionTypes: ['ANY'],
        webhookType: 'enhanced',
        authHeader: config.WEBHOOK_SECRET,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Helius webhook setup failed:', text);
      return;
    }

    const data = await res.json();
    console.log('✅ Helius webhook created:', data.webhookID);

    await syncAllWalletsToHelius(data.webhookID);
  } catch (e) {
    console.error('Helius setup error:', (e as Error).message);
  }
}

export async function syncAllWalletsToHelius(webhookId: string): Promise<void> {
  // Get ALL unique wallet addresses from both personal and group tracking
  const [personalWallets, groupWallets] = await Promise.all([
    prisma.watchedWallet.findMany({ where: { isActive: true }, select: { address: true } }),
    prisma.groupWallet.findMany({ where: { isActive: true }, select: { address: true } }),
  ]);

  const allAddresses = new Set([
    ...personalWallets.map(w => w.address),
    ...groupWallets.map(w => w.address),
  ]);

  if (allAddresses.size === 0) return;

  try {
    await fetch(`https://api.helius.xyz/v0/webhooks/${webhookId}?api-key=${config.HELIUS_API_KEY}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookURL: process.env.WEBHOOK_URL,
        accountAddresses: Array.from(allAddresses),
        transactionTypes: ['ANY'],
        webhookType: 'enhanced',
        authHeader: config.WEBHOOK_SECRET,
      }),
    });
    console.log(`🔄 Synced ${allAddresses.size} wallets to Helius webhook`);
  } catch (e) {
    console.error('Webhook sync failed:', (e as Error).message);
  }
}
