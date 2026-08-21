import fetch from 'cross-fetch';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from '../config';
import { prisma } from '../db';
import { BundleRiskScorer, BundleScoreResult } from './bundleRiskScorer';

const connection = new Connection(config.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');

export interface BundleWalletDetail {
  walletAddress: string;
  solSpent: number;
  tokensReceived?: number;
  pctSupply?: number;
  fundingSource?: string;
  walletAgeHours?: number;
  isBurner: boolean;
  txHash?: string;
  slot?: string;
}

export interface BundleAnalysisResult {
  tokenMint: string;
  tokenSymbol: string;
  tokenName: string;
  launchSlot?: string;
  bundleType: 'JITO' | 'SAME_FUNDER' | 'COORDINATED';
  walletCount: number;
  totalSolSpent: number;
  totalUsdSpent?: number;
  pctSupplyBought: number;
  commonFunder?: string;
  devWallet?: string;
  devInBundle: boolean;
  riskScore: number;
  riskLevel: 'EXTREME' | 'HIGH' | 'MEDIUM' | 'LOW';
  riskEmoji: string;
  recommendation: string;
  factors: any[];
  reasons: string[];
  wallets: BundleWalletDetail[];
  createdAt: Date;
}

/**
 * Helper to fetch token metadata from DexScreener
 */
async function fetchTokenMetadata(tokenMint: string): Promise<{ symbol: string; name: string; priceUsd: number; fdv: number }> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    if (res.ok) {
      const data = await res.json();
      const pair = data.pairs?.[0];
      if (pair?.baseToken) {
        return {
          symbol: pair.baseToken.symbol || 'UNKNOWN',
          name: pair.baseToken.name || '',
          priceUsd: Number(pair.priceUsd || 0),
          fdv: Number(pair.fdv || pair.marketCap || 0),
        };
      }
    }
  } catch (e) {
    console.error('DexScreener metadata error:', (e as Error).message);
  }
  return { symbol: 'SOL', name: 'Solana Token', priceUsd: 0, fdv: 0 };
}

/**
 * Traces the earliest funding transfer for a wallet to detect common funder
 */
async function traceFundingSource(walletAddress: string): Promise<{ funder?: string; timestamp?: number }> {
  if (!config.HELIUS_API_KEY) return {};
  try {
    const url = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${config.HELIUS_API_KEY}&limit=8`;
    const res = await fetch(url);
    if (!res.ok) return {};

    const txs: any[] = await res.json();
    if (!Array.isArray(txs) || txs.length === 0) return {};

    // Sort earliest first
    txs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    for (const tx of txs) {
      if (tx.nativeTransfers) {
        for (const t of tx.nativeTransfers) {
          if (t.toUserAccount === walletAddress && t.fromUserAccount !== walletAddress) {
            return {
              funder: t.fromUserAccount,
              timestamp: tx.timestamp,
            };
          }
        }
      }
    }
  } catch {}
  return {};
}

/**
 * Core function to analyze token launch for insider bundles
 */
export async function analyzeTokenBundle(tokenMint: string): Promise<BundleAnalysisResult> {
  const meta = await fetchTokenMetadata(tokenMint);

  // 1. Fetch earliest transactions via Helius Enhanced API
  let txs: any[] = [];
  if (config.HELIUS_API_KEY) {
    try {
      const url = `https://api.helius.xyz/v0/addresses/${tokenMint}/transactions?api-key=${config.HELIUS_API_KEY}&limit=50`;
      const res = await fetch(url);
      if (res.ok) {
        txs = await res.json();
      }
    } catch (e) {
      console.error('Helius tx fetch error:', (e as Error).message);
    }
  }

  // If Helius returned no txs, check if we have an existing record in DB
  if (txs.length === 0) {
    const existing = await prisma.bundleDetection.findUnique({
      where: { tokenMint },
      include: { wallets: true },
    });

    if (existing) {
      const scorerRes = BundleRiskScorer.calculateScore({
        pctSupplyBought: Number(existing.pctSupplyBought),
        walletCount: existing.walletCount,
        burnerCount: existing.wallets.filter(w => w.isBurner).length,
        totalSolSpent: Number(existing.totalSolSpent),
        hasCommonFunder: Boolean(existing.commonFunder),
        devInBundle: existing.devInBundle,
        devFundedBundle: false,
        isJitoBundle: existing.bundleType === 'JITO',
        slotsElapsed: 5,
      });

      return {
        tokenMint: existing.tokenMint,
        tokenSymbol: existing.tokenSymbol || meta.symbol,
        tokenName: existing.tokenName || meta.name,
        launchSlot: existing.launchSlot || undefined,
        bundleType: existing.bundleType as any,
        walletCount: existing.walletCount,
        totalSolSpent: Number(existing.totalSolSpent),
        totalUsdSpent: existing.totalUsdSpent ? Number(existing.totalUsdSpent) : undefined,
        pctSupplyBought: Number(existing.pctSupplyBought),
        commonFunder: existing.commonFunder || undefined,
        devWallet: existing.devWallet || undefined,
        devInBundle: existing.devInBundle,
        riskScore: existing.riskScore,
        riskLevel: existing.riskLevel as any,
        riskEmoji: scorerRes.riskEmoji,
        recommendation: scorerRes.recommendation,
        factors: scorerRes.factors,
        reasons: scorerRes.reasons,
        wallets: existing.wallets.map(w => ({
          walletAddress: w.walletAddress,
          solSpent: Number(w.solSpent),
          tokensReceived: w.tokensReceived ? Number(w.tokensReceived) : undefined,
          pctSupply: w.pctSupply ? Number(w.pctSupply) : undefined,
          fundingSource: w.fundingSource || undefined,
          walletAgeHours: w.walletAgeHours ? Number(w.walletAgeHours) : undefined,
          isBurner: w.isBurner,
          txHash: w.txHash || undefined,
          slot: w.slot || undefined,
        })),
        createdAt: existing.createdAt,
      };
    }
  }

  // Sort transactions chronological
  txs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const creationTx = txs[0] || {};
  const devWallet = creationTx.feePayer || null;
  const launchSlot = creationTx.slot ? String(creationTx.slot) : '0';
  const creationSlotNum = creationTx.slot || 0;

  // Look for buyer transactions in first 15 slots
  const earlyTxs = txs.filter(t => t.slot <= creationSlotNum + 15);

  const walletMap = new Map<string, BundleWalletDetail>();
  const funderCounts = new Map<string, number>();
  let totalSolSpent = 0;
  let devInBundle = false;
  let isJitoBundle = false;

  // Check if multiple txs share exact same slot
  const slotGroups = new Map<number, number>();
  earlyTxs.forEach(t => {
    if (t.slot) slotGroups.set(t.slot, (slotGroups.get(t.slot) || 0) + 1);
  });
  for (const count of slotGroups.values()) {
    if (count >= 3) isJitoBundle = true;
  }

  for (const tx of earlyTxs) {
    const signer = tx.feePayer;
    if (!signer) continue;

    if (signer === devWallet && earlyTxs.length > 1) {
      devInBundle = true;
    }

    let solSpent = 0;
    if (tx.nativeTransfers) {
      for (const t of tx.nativeTransfers) {
        if (t.fromUserAccount === signer) {
          solSpent += (t.amount || 0) / 1e9;
        }
      }
    }

    if (!walletMap.has(signer)) {
      walletMap.set(signer, {
        walletAddress: signer,
        solSpent,
        isBurner: false,
        txHash: tx.signature,
        slot: tx.slot ? String(tx.slot) : undefined,
      });
    } else {
      const existing = walletMap.get(signer)!;
      existing.solSpent += solSpent;
    }

    totalSolSpent += solSpent;
  }

  // Trace funding sources for the top early buyers (up to 8 buyers)
  const wallets = Array.from(walletMap.values());
  let burnerCount = 0;
  let devFundedBundle = false;

  for (let i = 0; i < Math.min(wallets.length, 8); i++) {
    const w = wallets[i];
    const funding = await traceFundingSource(w.walletAddress);

    if (funding.funder) {
      w.fundingSource = funding.funder;
      funderCounts.set(funding.funder, (funderCounts.get(funding.funder) || 0) + 1);

      if (devWallet && funding.funder === devWallet) {
        devFundedBundle = true;
      }
    }

    if (funding.timestamp) {
      const ageHours = (Date.now() - (funding.timestamp * 1000)) / (1000 * 3600);
      w.walletAgeHours = Math.round(ageHours * 10) / 10;
      if (ageHours < 24) {
        w.isBurner = true;
        burnerCount++;
      }
    }
  }

  // Find common funder
  let commonFunder: string | undefined = undefined;
  let maxFunderCount = 0;
  for (const [funder, count] of funderCounts.entries()) {
    if (count >= 2 && count > maxFunderCount) {
      maxFunderCount = count;
      commonFunder = funder;
    }
  }

  // Estimate % of supply bought
  // Pump.fun typical launch: 1 SOL buys ~3-5% of initial bonding curve supply
  let pctSupplyBought = Math.min(85, Math.max(0, (totalSolSpent / 30) * 100));
  if (wallets.length >= 6 && totalSolSpent >= 5) {
    pctSupplyBought = Math.max(pctSupplyBought, 25.0);
  }
  pctSupplyBought = Math.round(pctSupplyBought * 10) / 10;

  // Determine Bundle Type
  let bundleType: 'JITO' | 'SAME_FUNDER' | 'COORDINATED' = 'COORDINATED';
  if (isJitoBundle) bundleType = 'JITO';
  else if (commonFunder || devFundedBundle) bundleType = 'SAME_FUNDER';

  // Run 6-Factor Risk Scorer
  const scoreResult = BundleRiskScorer.calculateScore({
    pctSupplyBought,
    walletCount: wallets.length,
    burnerCount,
    totalSolSpent,
    hasCommonFunder: Boolean(commonFunder),
    commonFunderCount: maxFunderCount,
    devInBundle,
    devFundedBundle,
    isJitoBundle,
    slotsElapsed: Math.max(1, earlyTxs.length > 0 ? (earlyTxs[earlyTxs.length - 1].slot - creationSlotNum) : 5),
  });

  const totalUsdSpent = totalSolSpent * 185;

  // Save or update in Database
  try {
    const saved = await prisma.bundleDetection.upsert({
      where: { tokenMint },
      update: {
        tokenSymbol: meta.symbol,
        tokenName: meta.name,
        launchSlot,
        bundleType,
        walletCount: wallets.length,
        totalSolSpent,
        totalUsdSpent,
        pctSupplyBought,
        commonFunder: commonFunder || null,
        devWallet: devWallet || null,
        devInBundle,
        riskScore: scoreResult.riskScore,
        riskLevel: scoreResult.riskLevel,
        riskSummary: scoreResult.recommendation,
        rawData: JSON.parse(JSON.stringify({ reasons: scoreResult.reasons, factors: scoreResult.factors })),
      },
      create: {
        tokenMint,
        tokenSymbol: meta.symbol,
        tokenName: meta.name,
        launchSlot,
        bundleType,
        walletCount: wallets.length,
        totalSolSpent,
        totalUsdSpent,
        pctSupplyBought,
        commonFunder: commonFunder || null,
        devWallet: devWallet || null,
        devInBundle,
        riskScore: scoreResult.riskScore,
        riskLevel: scoreResult.riskLevel,
        riskSummary: scoreResult.recommendation,
        rawData: JSON.parse(JSON.stringify({ reasons: scoreResult.reasons, factors: scoreResult.factors })),
      },
    });

    // Save individual wallet records
    for (const w of wallets) {
      await prisma.bundleWallet.create({
        data: {
          bundleId: saved.id,
          walletAddress: w.walletAddress,
          solSpent: w.solSpent,
          fundingSource: w.fundingSource || null,
          walletAgeHours: w.walletAgeHours || null,
          isBurner: w.isBurner,
          txHash: w.txHash || null,
          slot: w.slot || null,
        },
      }).catch(() => {});
    }
  } catch (e) {
    console.error('Error saving bundle detection to DB:', (e as Error).message);
  }

  return {
    tokenMint,
    tokenSymbol: meta.symbol,
    tokenName: meta.name,
    launchSlot,
    bundleType,
    walletCount: wallets.length,
    totalSolSpent,
    totalUsdSpent,
    pctSupplyBought,
    commonFunder,
    devWallet: devWallet || undefined,
    devInBundle,
    riskScore: scoreResult.riskScore,
    riskLevel: scoreResult.riskLevel,
    riskEmoji: scoreResult.riskEmoji,
    recommendation: scoreResult.recommendation,
    factors: scoreResult.factors,
    reasons: scoreResult.reasons,
    wallets,
    createdAt: new Date(),
  };
}

/**
 * Fetch top latest bundled tokens
 */
export async function getLatestBundledTokens(limit: number = 5): Promise<BundleAnalysisResult[]> {
  const bundles = await prisma.bundleDetection.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { wallets: true },
  });

  return bundles.map(b => {
    const scorerRes = BundleRiskScorer.calculateScore({
      pctSupplyBought: Number(b.pctSupplyBought),
      walletCount: b.walletCount,
      burnerCount: b.wallets.filter(w => w.isBurner).length,
      totalSolSpent: Number(b.totalSolSpent),
      hasCommonFunder: Boolean(b.commonFunder),
      devInBundle: b.devInBundle,
      devFundedBundle: false,
      isJitoBundle: b.bundleType === 'JITO',
      slotsElapsed: 5,
    });

    return {
      tokenMint: b.tokenMint,
      tokenSymbol: b.tokenSymbol || 'SOL',
      tokenName: b.tokenName || '',
      launchSlot: b.launchSlot || undefined,
      bundleType: b.bundleType as any,
      walletCount: b.walletCount,
      totalSolSpent: Number(b.totalSolSpent),
      totalUsdSpent: b.totalUsdSpent ? Number(b.totalUsdSpent) : undefined,
      pctSupplyBought: Number(b.pctSupplyBought),
      commonFunder: b.commonFunder || undefined,
      devWallet: b.devWallet || undefined,
      devInBundle: b.devInBundle,
      riskScore: b.riskScore,
      riskLevel: b.riskLevel as any,
      riskEmoji: scorerRes.riskEmoji,
      recommendation: scorerRes.recommendation,
      factors: scorerRes.factors,
      reasons: scorerRes.reasons,
      wallets: b.wallets.map(w => ({
        walletAddress: w.walletAddress,
        solSpent: Number(w.solSpent),
        tokensReceived: w.tokensReceived ? Number(w.tokensReceived) : undefined,
        pctSupply: w.pctSupply ? Number(w.pctSupply) : undefined,
        fundingSource: w.fundingSource || undefined,
        walletAgeHours: w.walletAgeHours ? Number(w.walletAgeHours) : undefined,
        isBurner: w.isBurner,
        txHash: w.txHash || undefined,
        slot: w.slot || undefined,
      })),
      createdAt: b.createdAt,
    };
  });
}

/**
 * Background scanner: Scans recent new token launches on Solana and broadcasts high-risk bundles
 */
export async function scanRecentLaunchesForBundles(): Promise<number> {
  console.log('🔍 Scanning recent Solana launches for sniper bundles...');
  try {
    // 1. Pull latest token profiles from DexScreener
    const res = await fetch('https://api.dexscreener.com/token-profiles/latest/v1', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return 0;

    const data = await res.json();
    const solTokens = (data || [])
      .filter((t: any) => t.chainId === 'solana')
      .slice(0, 10);

    let detectedCount = 0;

    for (const t of solTokens) {
      const mint = t.tokenAddress;
      if (!mint) continue;

      // Check if already analyzed recently
      const existing = await prisma.bundleDetection.findUnique({ where: { tokenMint: mint } });
      if (existing) continue;

      const analysis = await analyzeTokenBundle(mint);

      if (analysis.walletCount >= 3 || analysis.riskScore >= 40) {
        detectedCount++;
        // If high risk (>= 60), broadcast alert
        if (analysis.riskScore >= 60) {
          const { broadcastBundleAlert } = await import('./telegramBotBundle');
          await broadcastBundleAlert(analysis);
        }
      }
    }

    console.log(`✅ Bundle scan complete: ${detectedCount} bundled launches analyzed.`);
    return detectedCount;
  } catch (e) {
    console.error('Bundle scanner error:', (e as Error).message);
    return 0;
  }
}

import cron from 'node-cron';

export function startBundleScannerJobs(): void {
  // Trigger initial scan 10s after startup
  setTimeout(async () => {
    try {
      await scanRecentLaunchesForBundles();
    } catch (e) {
      console.error('Initial bundle scan failed:', (e as Error).message);
    }
  }, 10000);

  // Run bundle scan every 7 minutes
  cron.schedule('*/7 * * * *', async () => {
    try {
      await scanRecentLaunchesForBundles();
    } catch (e) {
      console.error('Scheduled bundle scan failed:', (e as Error).message);
    }
  });

  // Broadcast Auto-Ranked Bundle Radar Alert every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { broadcastBundleRadarAlert } = await import('./telegramBotBundle');
      await broadcastBundleRadarAlert();
    } catch (e) {
      console.error('Scheduled bundle radar alert failed:', (e as Error).message);
    }
  });

  console.log('✅ Bundle detection scanner started (scan: every 7min, radar alert: every 15min)');
}
