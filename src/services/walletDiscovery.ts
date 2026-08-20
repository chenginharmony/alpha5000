import fetch from 'cross-fetch';
import { prisma } from '../db';
import { sendAlert, sendDiscoveryNotification } from './telegramBot';

const MOBULA_API_KEY = process.env.MOBULA_API_KEY;
const MOBULA_BASE = 'https://api.mobula.io';

// ═══════════════════════════════════════════════════════════════
// MOBULA API CALLS
// ═══════════════════════════════════════════════════════════════

async function mobulaFetch(path: string, params?: Record<string, string>) {
  const url = new URL(path, MOBULA_BASE);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, v);
      }
    });
  }

  const res = await fetch(url.toString(), {
    headers: {
      'accept': 'application/json',
      ...(MOBULA_API_KEY
        ? {
            'Authorization': MOBULA_API_KEY,
            'x-api-key': MOBULA_API_KEY,
          }
        : {}),
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mobula ${path} failed: ${res.status} ${text}`);
  }

  return res.json();
}

// ═══════════════════════════════════════════════════════════════
// 1. FETCH TOP TRADERS FOR A TOKEN
// ═══════════════════════════════════════════════════════════════

export interface MobulaTopTrader {
  owner: string;
  tags: string[];
  trade: number;
  tradeBuy?: number;
  tradeSell?: number;
  volumeUsd: number;
  totalPnl: number;
  realizedPnl?: number;
  unrealizedPnl?: number;
  holdVolumeUsd?: number;
  netWorth?: number;
  solBalance?: number;
  firstTradeUnixTime?: number;
  lastTradeUnixTime?: number;
}

export async function fetchTopTradersForToken(
  tokenMint: string,
  timeFrame: string = '24h',
  limit: number = 20
): Promise<MobulaTopTrader[]> {
  try {
    // Try Mobula token top-traders endpoint
    const data = await mobulaFetch('/api/1/token/top-traders', {
      address: tokenMint,
      asset: tokenMint,
      blockchain: 'solana',
      time_frame: timeFrame,
      limit: String(limit),
    });

    const items = data?.data || data?.items || (Array.isArray(data) ? data : []);
    return items.map((t: any) => {
      const owner = t.address || t.wallet || t.owner || t.user || '';
      const tags: string[] = Array.isArray(t.labels)
        ? t.labels
        : Array.isArray(t.tags)
        ? t.tags
        : [];

      return {
        owner,
        tags,
        trade: t.trades_count ?? t.trades ?? t.trade ?? 0,
        tradeBuy: t.buy_count ?? t.tradeBuy ?? 0,
        tradeSell: t.sell_count ?? t.tradeSell ?? 0,
        volumeUsd: t.volume_usd ?? t.volumeUsd ?? t.volume ?? 0,
        totalPnl: t.total_pnl ?? t.totalPnl ?? t.pnl_usd ?? t.realized_pnl ?? 0,
        realizedPnl: t.realized_pnl ?? t.realizedPnl ?? 0,
        unrealizedPnl: t.unrealized_pnl ?? t.unrealizedPnl ?? 0,
        holdVolumeUsd: t.hold_volume_usd ?? t.holdVolumeUsd ?? 0,
        netWorth: t.net_worth ?? t.netWorth ?? 0,
        solBalance: t.sol_balance ?? t.solBalance ?? 0,
        firstTradeUnixTime: t.first_trade_time ?? t.firstTradeUnixTime ?? 0,
        lastTradeUnixTime: t.last_trade_time ?? t.lastTradeUnixTime ?? 0,
      };
    }).filter((t: MobulaTopTrader) => Boolean(t.owner));
  } catch (e) {
    console.error('fetchTopTraders failed:', (e as Error).message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. FETCH WALLET LABELS & TRADING ANALYSIS
// ═══════════════════════════════════════════════════════════════

export async function fetchWalletLabels(walletAddress: string): Promise<string[]> {
  try {
    const data = await mobulaFetch('/api/1/wallet/labels', {
      wallet: walletAddress,
      address: walletAddress,
      blockchain: 'solana',
    });

    const labels = data?.data?.labels || data?.labels || (Array.isArray(data?.data) ? data.data : []);
    return Array.isArray(labels) ? labels : [];
  } catch (e) {
    return [];
  }
}

export async function fetchWalletTradingAnalysis(walletAddress: string): Promise<{
  totalPnl?: number;
  pnl24h?: number;
  pnl7d?: number;
  pnl30d?: number;
  volume24h?: number;
  tradeCount24h?: number;
  winRate?: number;
  netWorthSol?: number;
  tags?: string[];
} | null> {
  try {
    const data = await mobulaFetch('/api/1/wallet/trading-analysis', {
      wallet: walletAddress,
      address: walletAddress,
      blockchain: 'solana',
    });

    const res = data?.data || data;
    if (!res) return null;

    return {
      totalPnl: res.total_pnl ?? res.totalPnl ?? res.realized_pnl ?? res.pnl,
      pnl24h: res.pnl_24h ?? res.pnl24h ?? res.total_pnl_24h,
      pnl7d: res.pnl_7d ?? res.pnl7d,
      pnl30d: res.pnl_30d ?? res.pnl30d,
      volume24h: res.volume_24h ?? res.volume24h ?? res.volume,
      tradeCount24h: res.trades_count_24h ?? res.tradeCount24h ?? res.total_trades,
      winRate: res.win_rate ?? res.winRate,
      netWorthSol: res.net_worth_sol ?? res.netWorthSol ?? res.sol_balance,
      tags: Array.isArray(res.labels) ? res.labels : Array.isArray(res.tags) ? res.tags : undefined,
    };
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. FETCH TRENDING TOKENS
// ═══════════════════════════════════════════════════════════════

export interface MobulaTrendingToken {
  address: string;
  symbol: string;
  name: string;
  volume24hUSD: number;
  liquidity: number;
  price: number;
  priceChange24hPercent: number;
  marketCap: number;
}

export async function fetchTrendingTokens(limit: number = 20): Promise<MobulaTrendingToken[]> {
  try {
    // Try Mobula pulse / trending
    const data = await mobulaFetch('/api/2/pulse', {
      blockchain: 'solana',
      limit: String(limit),
    });

    const items = data?.data?.items || data?.data || data?.items || (Array.isArray(data) ? data : []);
    if (items.length > 0) {
      return items.map((t: any) => ({
        address: t.address || t.tokenAddress || t.mint || '',
        symbol: t.symbol || 'UNKNOWN',
        name: t.name || '',
        volume24hUSD: t.volume_24h ?? t.volume24hUSD ?? t.volume ?? 0,
        liquidity: t.liquidity ?? 0,
        price: t.price ?? t.priceUSD ?? 0,
        priceChange24hPercent: t.price_change_24h ?? t.priceChange24hPercent ?? 0,
        marketCap: t.market_cap ?? t.marketCap ?? 0,
      })).filter((t: MobulaTrendingToken) => Boolean(t.address));
    }
  } catch (e) {
    console.error('Mobula fetchTrendingTokens failed, falling back to DexScreener:', (e as Error).message);
  }

  // Fallback to DexScreener if Mobula fails or returns empty
  return fetchDexScreenerTrending();
}

// Fallback: DexScreener trending
export async function fetchDexScreenerTrending(): Promise<MobulaTrendingToken[]> {
  try {
    const res = await fetch('https://api.dexscreener.com/token-profiles/latest/v1', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const data = await res.json();
    return (data || [])
      .filter((t: any) => t.chainId === 'solana')
      .slice(0, 20)
      .map((t: any) => ({
        address: t.tokenAddress,
        symbol: t.symbol || 'UNKNOWN',
        name: t.name || '',
        volume24hUSD: 0,
        liquidity: 0,
        price: 0,
        priceChange24hPercent: 0,
        marketCap: 0,
      }));
  } catch (e) {
    console.error('DexScreener trending failed:', (e as Error).message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. WALLET SCORING ALGORITHM
// ═══════════════════════════════════════════════════════════════

export function calculateWalletScore(
  pnl24h: number,
  pnl7d: number,
  winRate: number,
  tradeCount: number,
  volume: number,
  tags: string[]
): number {
  let score = 0;

  // P&L weight (40%)
  score += Math.min(pnl24h * 2, 100) * 0.25;
  score += Math.min(pnl7d * 0.5, 100) * 0.15;

  // Win rate weight (25%)
  score += (winRate / 100) * 75;

  // Activity weight (20%)
  score += Math.min(tradeCount / 10, 1) * 20;

  // Volume weight (10%)
  score += Math.min(volume / 10000, 1) * 10;

  // Tag bonus (5%) - Supports Mobula tags (smartTrader, proTrader, sniper, bundler, insider, dev)
  const goodTags = ['smartTrader', 'proTrader', 'sniper', 'smart_trader', 'whale'];
  const badTags = ['dev', 'bundler', 'insider'];
  const hasGoodTag = tags.some(t => goodTags.includes(t));
  const hasBadTag = tags.some(t => badTags.includes(t));

  if (hasGoodTag) score += 5;
  if (hasBadTag) score -= 10;

  return Math.max(0, Math.min(100, score));
}

// ═══════════════════════════════════════════════════════════════
// 5. DISCOVER WALLETS FROM TRENDING TOKENS
// ═══════════════════════════════════════════════════════════════

export async function discoverWalletsFromTrending(): Promise<number> {
  console.log('🔍 Starting wallet discovery from trending tokens (Mobula)...');

  let trending = await fetchTrendingTokens(15);
  if (trending.length === 0) {
    trending = await fetchDexScreenerTrending();
  }

  if (trending.length === 0) {
    console.log('⚠️ No trending tokens found');
    return 0;
  }

  console.log(`📈 Found ${trending.length} trending tokens`);

  // Save trending tokens
  for (const token of trending) {
    await prisma.trendingToken.upsert({
      where: { tokenMint: token.address },
      update: {
        tokenSymbol: token.symbol,
        tokenName: token.name,
        volume24h: token.volume24hUSD,
        marketCap: token.marketCap,
        liquidity: token.liquidity,
        priceUsd: token.price,
        priceChange24h: token.priceChange24hPercent,
        discoverySource: 'mobula_trending',
      },
      create: {
        tokenMint: token.address,
        tokenSymbol: token.symbol,
        tokenName: token.name,
        volume24h: token.volume24hUSD,
        marketCap: token.marketCap,
        liquidity: token.liquidity,
        priceUsd: token.price,
        priceChange24h: token.priceChange24hPercent,
        discoverySource: 'mobula_trending',
      },
    });
  }

  // Get top traders for each trending token
  let discoveredCount = 0;
  const processedWallets = new Set<string>();

  for (const token of trending.slice(0, 5)) { // Top 5 tokens only
    console.log(`🔎 Analyzing top traders for ${token.symbol}...`);

    const traders = await fetchTopTradersForToken(token.address, '24h', 10);

    for (const trader of traders) {
      if (processedWallets.has(trader.owner)) continue;
      processedWallets.add(trader.owner);

      // Skip if already tracked
      const existing = await prisma.watchedWallet.findUnique({
        where: { address: trader.owner },
      });
      if (existing) continue;

      // Skip if already discovered
      const existingDisc = await prisma.discoveredWallet.findFirst({
        where: { address: trader.owner, source: 'mobula_top_traders' },
      });
      if (existingDisc) {
        // Update metrics
        await prisma.discoveredWallet.update({
          where: { id: existingDisc.id },
          data: {
            pnl24h: trader.totalPnl,
            volume24h: trader.volumeUsd,
            tradeCount24h: trader.trade,
            walletTags: trader.tags,
            netWorthSol: trader.solBalance || trader.netWorth,
            tokenMint: token.address,
            tokenSymbol: token.symbol,
          },
        });
        continue;
      }

      // Save new discovery
      await prisma.discoveredWallet.create({
        data: {
          address: trader.owner,
          source: 'mobula_top_traders',
          tokenMint: token.address,
          tokenSymbol: token.symbol,
          pnl24h: trader.totalPnl,
          volume24h: trader.volumeUsd,
          tradeCount24h: trader.trade,
          walletTags: trader.tags,
          netWorthSol: trader.solBalance || trader.netWorth,
        },
      });

      discoveredCount++;
    }
  }

  console.log(`✅ Discovered ${discoveredCount} new wallets`);
  return discoveredCount;
}

// ═══════════════════════════════════════════════════════════════
// 6. SYNC ANALYTICS FOR TRACKED WALLETS
// ═══════════════════════════════════════════════════════════════

export async function syncTrackedWalletAnalytics(): Promise<void> {
  const wallets = await prisma.watchedWallet.findMany({
    where: { isActive: true },
    include: { trades: true },
  });

  for (const wallet of wallets) {
    const soldTrades = wallet.trades.filter(t => t.status === 'SOLD');
    const wins = soldTrades.filter(t => Number(t.pnlPercent || 0) > 0).length;
    const losses = soldTrades.filter(t => Number(t.pnlPercent || 0) <= 0).length;
    const totalPnl = soldTrades.reduce((sum, t) => sum + Number(t.pnlPercent || 0), 0);
    const avgPnl = soldTrades.length > 0 ? totalPnl / soldTrades.length : 0;
    const winRate = soldTrades.length > 0 ? (wins / soldTrades.length) * 100 : 0;

    // Try to get Mobula data for this wallet
    let externalPnl24h: number | null = null;
    let externalPnl7d: number | null = null;
    let externalPnl30d: number | null = null;
    let externalVolume24h: number | null = null;
    let externalTradeCount: number | null = null;
    let tags: string[] = [];
    let netWorth: number | null = null;

    if (MOBULA_API_KEY) {
      try {
        const [analysis, labels] = await Promise.all([
          fetchWalletTradingAnalysis(wallet.address),
          fetchWalletLabels(wallet.address),
        ]);

        if (analysis) {
          externalPnl24h = analysis.pnl24h ?? analysis.totalPnl ?? null;
          externalPnl7d = analysis.pnl7d ?? null;
          externalPnl30d = analysis.pnl30d ?? null;
          externalVolume24h = analysis.volume24h ?? null;
          externalTradeCount = analysis.tradeCount24h ?? null;
          netWorth = analysis.netWorthSol ?? null;
          if (analysis.tags && analysis.tags.length > 0) {
            tags = analysis.tags;
          }
        }

        if (labels && labels.length > 0) {
          tags = Array.from(new Set([...tags, ...labels]));
        }

        // Fallback: check recent token top traders
        if (externalPnl24h === null && wallet.trades.length > 0) {
          const recentToken = wallet.trades[wallet.trades.length - 1]?.tokenMint;
          if (recentToken) {
            const traders = await fetchTopTradersForToken(recentToken, '24h', 50);
            const match = traders.find(t => t.owner === wallet.address);
            if (match) {
              externalPnl24h = match.totalPnl;
              externalVolume24h = match.volumeUsd;
              externalTradeCount = match.trade;
              tags = Array.from(new Set([...tags, ...match.tags]));
              netWorth = match.solBalance || match.netWorth || netWorth;
            }
          }
        }
      } catch (e) {
        // Ignore Mobula errors for analytics
      }
    }

    // Calculate composite score
    const score = calculateWalletScore(
      externalPnl24h || avgPnl,
      externalPnl7d || totalPnl,
      winRate,
      wallet.trades.length,
      externalVolume24h || 0,
      tags
    );

    await prisma.walletAnalytics.upsert({
      where: { walletAddress: wallet.address },
      update: {
        totalTrades: wallet.trades.length,
        wins,
        losses,
        winRate,
        avgPnlPercent: avgPnl,
        totalPnlPercent: totalPnl,
        externalPnl24h: externalPnl24h ?? undefined,
        externalPnl7d: externalPnl7d ?? undefined,
        externalPnl30d: externalPnl30d ?? undefined,
        externalVolume24h: externalVolume24h ?? undefined,
        externalTradeCount24h: externalTradeCount ?? undefined,
        walletTags: tags,
        netWorthSol: netWorth ?? undefined,
        score,
        lastSyncedAt: new Date(),
      },
      create: {
        walletAddress: wallet.address,
        totalTrades: wallet.trades.length,
        wins,
        losses,
        winRate,
        avgPnlPercent: avgPnl,
        totalPnlPercent: totalPnl,
        externalPnl24h: externalPnl24h ?? undefined,
        externalPnl7d: externalPnl7d ?? undefined,
        externalPnl30d: externalPnl30d ?? undefined,
        externalVolume24h: externalVolume24h ?? undefined,
        externalTradeCount24h: externalTradeCount ?? undefined,
        walletTags: tags,
        netWorthSol: netWorth ?? undefined,
        score,
      },
    });
  }

  // Update ranks
  const allAnalytics = await prisma.walletAnalytics.findMany({
    orderBy: { score: 'desc' },
  });

  for (let i = 0; i < allAnalytics.length; i++) {
    await prisma.walletAnalytics.update({
      where: { id: allAnalytics[i].id },
      data: { rank: i + 1 },
    });
  }

  console.log(`✅ Synced analytics for ${wallets.length} wallets`);
}

// ═══════════════════════════════════════════════════════════════
// 7. GET LEADERBOARD DATA
// ═══════════════════════════════════════════════════════════════

export async function getWalletLeaderboard(limit: number = 20) {
  const [tracked, discovered] = await Promise.all([
    prisma.walletAnalytics.findMany({
      orderBy: { score: 'desc' },
      take: limit,
      include: { wallet: true },
    }),
    prisma.discoveredWallet.findMany({
      where: { isAdded: false },
      orderBy: { pnl24h: 'desc' },
      take: limit,
    }),
  ]);

  return { tracked, discovered };
}

export async function getTrendingTokensList(limit: number = 10) {
  return prisma.trendingToken.findMany({
    orderBy: { volume24h: 'desc' },
    take: limit,
  });
}

// ═══════════════════════════════════════════════════════════════
// 8. CRON JOB SETUP
// ═══════════════════════════════════════════════════════════════

import cron from 'node-cron';

export function startDiscoveryJobs(): void {
  // Discover new wallets every 2 hours
  cron.schedule('0 */2 * * *', async () => {
    console.log('⏰ Running scheduled wallet discovery...');
    try {
      const count = await discoverWalletsFromTrending();
      if (count > 0) {
        await sendDiscoveryNotification(count);
      }
    } catch (e) {
      console.error('Discovery cron failed:', (e as Error).message);
    }
  });

  // Sync analytics every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log('⏰ Running scheduled analytics sync...');
    try {
      await syncTrackedWalletAnalytics();
    } catch (e) {
      console.error('Analytics sync failed:', (e as Error).message);
    }
  });

  console.log('✅ Discovery jobs started (discovery: every 2h, analytics: every 30min)');
}
