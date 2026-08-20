import cron from 'node-cron';
import { prisma } from '../db';
import { executeSell } from './jupiter';
import { sendSellAlert, sendSellFailAlert } from './telegramBot';
import fetch from 'cross-fetch';

// Cache token prices for 20 seconds
const priceCache = new Map<string, { price: number; ts: number }>();

async function getTokenPriceInSol(mint: string): Promise<number | null> {
  const now = Date.now();
  const cached = priceCache.get(mint);
  if (cached && now - cached.ts < 20000) {
    return cached.price;
  }

  try {
    const res = await fetch(
      `https://api.jup.ag/price/v2?ids=${mint}&vsToken=So11111111111111111111111111111111111111112`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const price = data.data?.[mint]?.price;
    if (price) {
      priceCache.set(mint, { price: Number(price), ts: now });
      return Number(price);
    }
  } catch (e) {
    console.warn(`Price fetch failed for ${mint}:`, (e as Error).message);
  }
  return null;
}

async function getSolPriceUsd(): Promise<number> {
  try {
    const res = await fetch(
      'https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112',
      { signal: AbortSignal.timeout(2000) }
    );
    const data = await res.json();
    return Number(data.data?.['So11111111111111111111111111111111111111112']?.price || 150);
  } catch {
    return 150;
  }
}

export function startProfitMonitor(): void {
  // Run every 30 seconds
  cron.schedule('*/30 * * * * *', async () => {
    const settings = await prisma.settings.findFirst();
    if (!settings?.isRunning) return;

    const holdings = await prisma.trade.findMany({
      where: { status: 'HOLDING' },
    });

    if (holdings.length === 0) return;

    const solPriceUsd = await getSolPriceUsd();
    const takeProfit = Number(settings.takeProfit);
    const stopLoss = Number(settings.stopLoss);

    for (const trade of holdings) {
      try {
        const currentPriceSol = await getTokenPriceInSol(trade.tokenMint);
        if (!currentPriceSol) continue;

        const currentPriceUsd = currentPriceSol * solPriceUsd;
        const buyPriceUsd = Number(trade.buyAmountUsd) / Number(trade.buyAmountTokens);

        const entryPrice = buyPriceUsd > 0 ? buyPriceUsd : currentPriceUsd;
        const pnlPercent = ((currentPriceUsd - entryPrice) / entryPrice) * 100;

        console.log(
          `📊 ${trade.tokenSymbol}: Entry $${entryPrice.toFixed(8)}, ` +
          `Current $${currentPriceUsd.toFixed(8)}, P&L: ${pnlPercent.toFixed(2)}%`
        );

        if (pnlPercent >= takeProfit) {
          console.log(`🎯 TAKE PROFIT: ${trade.tokenSymbol} ${pnlPercent.toFixed(2)}%`);
          await sellPosition(trade, pnlPercent, 'PROFIT');
        } else if (pnlPercent <= stopLoss) {
          console.log(`🔴 STOP LOSS: ${trade.tokenSymbol} ${pnlPercent.toFixed(2)}%`);
          await sellPosition(trade, pnlPercent, 'STOP_LOSS');
        }
      } catch (e) {
        console.error(`Monitor error for ${trade.tokenSymbol}:`, (e as Error).message);
      }
    }
  });

  console.log('✅ Profit monitor started (30s interval)');
}

async function sellPosition(
  trade: any,
  pnlPercent: number,
  reason: 'PROFIT' | 'STOP_LOSS'
): Promise<void> {
  const result = await executeSell(
    trade.tokenMint,
    Number(trade.buyAmountTokens),
    trade.tokenDecimals
  );

  if (result.success && result.txid) {
    await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: 'SOLD',
        sellTx: result.txid,
        sellPriceUsd: 0,
        sellAmountUsd: result.solReceived ? result.solReceived * 150 : 0,
        pnlPercent,
        sellReason: reason,
        sellTime: new Date(),
      },
    });

    await sendSellAlert(trade.tokenSymbol, pnlPercent, reason, result.txid);
  } else {
    await sendSellFailAlert(trade.tokenSymbol, result.error || 'Unknown');
  }
}
