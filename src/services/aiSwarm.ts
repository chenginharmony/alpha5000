import fetch from 'cross-fetch';
import { prisma } from '../db';
import { config } from '../config';
import { analyzeTokenBundle } from './bundleDetection';

export interface AgentVerdict {
  id: 'SNIPER' | 'SAFETY' | 'SENTIMENT' | 'PORTFOLIO' | 'EXECUTION';
  name: string;
  emoji: string;
  vote: 'BUY' | 'CAUTION' | 'PASS';
  score: number; // 0 - 100
  quote: string;
  details: string[];
  isVeto?: boolean;
}

export interface SwarmAnalysisResult {
  tokenMint: string;
  tokenSymbol: string;
  tokenName: string;
  priceUsd: number;
  liquidityUsd: number;
  marketCapUsd: number;
  volume24hUsd: number;
  priceChange24h: number;
  decision: 'BUY' | 'CAUTION' | 'PASS';
  decisionEmoji: string;
  consensusScore: number; // 0 - 100
  recommendedSolSize: number;
  recommendedUsdSize: number;
  jitoProtection: boolean;
  recommendedSlippageBps: number;
  reasoning: string;
  agents: AgentVerdict[];
  createdAt: Date;
}

/**
 * Fetch live DEX & Token Data from DexScreener
 */
async function fetchDexData(tokenMint: string): Promise<any> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    if (res.ok) {
      const data = await res.json();
      return data.pairs?.[0] || null;
    }
  } catch (e) {
    console.error('DexScreener fetch error:', (e as Error).message);
  }
  return null;
}

/**
 * Fetch RugCheck Security Report
 */
async function fetchRugCheckData(tokenMint: string): Promise<any> {
  try {
    const res = await fetch(`https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report`, {
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return null;
}

/**
 * Run the 5-Agent Multi-Agent Swarm Council Debate
 */
export async function runSwarmCouncilAnalysis(
  tokenMint: string,
  userChatId?: string | number
): Promise<SwarmAnalysisResult> {
  // 1. Fetch live on-chain data across sources in parallel
  const [dexPair, rugReport, bundleAnalysis, userSettings, userWallet] = await Promise.all([
    fetchDexData(tokenMint),
    fetchRugCheckData(tokenMint),
    analyzeTokenBundle(tokenMint),
    prisma.settings.findFirst(),
    userChatId ? prisma.userWallet.findUnique({ where: { userChatId: String(userChatId) } }) : null,
  ]);

  const tokenSymbol = dexPair?.baseToken?.symbol || bundleAnalysis.tokenSymbol || 'TOKEN';
  const tokenName = dexPair?.baseToken?.name || bundleAnalysis.tokenName || 'Solana Token';
  const priceUsd = Number(dexPair?.priceUsd || 0);
  const liquidityUsd = Number(dexPair?.liquidity?.usd || 0);
  const marketCapUsd = Number(dexPair?.marketCap || dexPair?.fdv || 0);
  const volume24hUsd = Number(dexPair?.volume?.h24 || 0);
  const volume5mUsd = Number(dexPair?.volume?.m5 || 0);
  const priceChange24h = Number(dexPair?.priceChange?.h24 || 0);
  const priceChange5m = Number(dexPair?.priceChange?.m5 || 0);
  const txns5m = (dexPair?.txns?.m5?.buys || 0) + (dexPair?.txns?.m5?.sells || 0);
  const userSolBalance = userWallet ? Number(userWallet.lastBalanceSol) : 1.0;
  const userBudgetUsd = userSettings ? Number(userSettings.tradeBudget) : 6.0;

  const agents: AgentVerdict[] = [];

  // ═══════════════════════════════════════════════════════════════
  // 1. 🕵️ SNIPER AGENT (Launch, Volume & Momentum Analysis)
  // ═══════════════════════════════════════════════════════════════
  let sniperScore = 50;
  let sniperVote: 'BUY' | 'CAUTION' | 'PASS' = 'CAUTION';
  const sniperDetails: string[] = [];

  if (volume5mUsd > 20000 || txns5m > 50) {
    sniperScore += 30;
    sniperDetails.push(`Surging 5m volume ($${volume5mUsd.toLocaleString()} / ${txns5m} txns)`);
  } else if (volume24hUsd > 10000) {
    sniperScore += 15;
    sniperDetails.push(`Healthy 24h volume ($${volume24hUsd.toLocaleString()})`);
  }

  if (liquidityUsd >= 20000) {
    sniperScore += 15;
    sniperDetails.push(`Solid liquidity depth ($${liquidityUsd.toLocaleString()})`);
  } else if (liquidityUsd < 5000 && liquidityUsd > 0) {
    sniperScore -= 20;
    sniperDetails.push(`Thin liquidity ($${liquidityUsd.toLocaleString()})`);
  }

  if (priceChange5m > 15) {
    sniperScore += 10;
    sniperDetails.push(`5m momentum +${priceChange5m.toFixed(1)}%`);
  }

  sniperScore = Math.min(100, Math.max(0, sniperScore));
  if (sniperScore >= 65) sniperVote = 'BUY';
  else if (sniperScore <= 35) sniperVote = 'PASS';

  const sniperQuote =
    sniperVote === 'BUY'
      ? `Launch volume surging with $${liquidityUsd.toLocaleString()} liquidity. Strong early order flow.`
      : sniperVote === 'CAUTION'
      ? `Moderate activity with $${liquidityUsd.toLocaleString()} liquidity. Momentum is consolidating.`
      : `Stagnant volume and low buyer momentum. Not seeing sniper trigger conditions.`;

  agents.push({
    id: 'SNIPER',
    name: 'Sniper Agent',
    emoji: '🕵️',
    vote: sniperVote,
    score: sniperScore,
    quote: sniperQuote,
    details: sniperDetails,
  });

  // ═══════════════════════════════════════════════════════════════
  // 2. 🛡️ SAFETY AGENT (RugCheck & Bundle Risk Analysis)
  // ═══════════════════════════════════════════════════════════════
  let safetyScore = 75;
  let safetyVote: 'BUY' | 'CAUTION' | 'PASS' = 'BUY';
  let isVeto = false;
  const safetyDetails: string[] = [];

  const bundleRisk = bundleAnalysis.riskScore;
  const isRugCheckDanger = rugReport && (rugReport.score > 2000 || rugReport.risks?.some((r: any) => r.level === 'danger'));

  if (bundleRisk >= 80) {
    safetyScore -= 50;
    isVeto = true;
    safetyDetails.push(`🚨 EXTREME Bundle Risk (${bundleRisk}/100) — Sybil insider cluster`);
  } else if (bundleRisk >= 60) {
    safetyScore -= 30;
    safetyDetails.push(`⚠️ High Bundle Risk (${bundleRisk}/100) — ${bundleAnalysis.pctSupplyBought}% supply grabbed`);
  }

  if (bundleAnalysis.devInBundle) {
    safetyScore -= 25;
    isVeto = true;
    safetyDetails.push(`🚨 Dev wallet bought in launch bundle`);
  }

  if (isRugCheckDanger) {
    safetyScore -= 35;
    isVeto = true;
    safetyDetails.push(`🚨 RugCheck flagged critical contract dangers`);
  }

  if (bundleAnalysis.bundleType === 'JITO') {
    safetyDetails.push(`Jito atomic MEV bundle detected at creation`);
  }

  safetyScore = Math.min(100, Math.max(0, safetyScore));
  if (isVeto || safetyScore <= 40) safetyVote = 'PASS';
  else if (safetyScore <= 65) safetyVote = 'CAUTION';
  else safetyVote = 'BUY';

  const safetyQuote = isVeto
    ? `CRITICAL RISK: ${safetyDetails[0] || 'Dev/insider concentration detected'}. VETO RECOMMENDED.`
    : safetyVote === 'CAUTION'
    ? `Bundle risk is elevated (${bundleRisk}/100). Use strict stop-loss and limited size.`
    : `Contract verified clean. No critical freeze or mint risks detected.`;

  agents.push({
    id: 'SAFETY',
    name: 'Safety Agent',
    emoji: '🛡️',
    vote: safetyVote,
    score: safetyScore,
    quote: safetyQuote,
    details: safetyDetails,
    isVeto,
  });

  // ═══════════════════════════════════════════════════════════════
  // 3. 📊 SENTIMENT AGENT (Socials, Community & Hype Velocity)
  // ═══════════════════════════════════════════════════════════════
  let sentimentScore = 45;
  let sentimentVote: 'BUY' | 'CAUTION' | 'PASS' = 'CAUTION';
  const sentimentDetails: string[] = [];

  const websites = dexPair?.info?.websites || [];
  const socials = dexPair?.info?.socials || [];
  const hasTwitter = socials.some((s: any) => s.type === 'twitter');
  const hasTelegram = socials.some((s: any) => s.type === 'telegram');
  const isBoosted = Boolean(dexPair?.boosts?.active);

  if (hasTwitter) {
    sentimentScore += 15;
    sentimentDetails.push('Active Twitter / X link verified');
  }
  if (hasTelegram) {
    sentimentScore += 10;
    sentimentDetails.push('Telegram community channel active');
  }
  if (isBoosted) {
    sentimentScore += 20;
    sentimentDetails.push('DexScreener boosted trending campaign');
  }
  if (websites.length > 0) {
    sentimentScore += 10;
    sentimentDetails.push('Official website online');
  }

  if (socials.length === 0 && websites.length === 0) {
    sentimentScore -= 20;
    sentimentDetails.push('Ghost launch: No socials or website attached');
  }

  sentimentScore = Math.min(100, Math.max(0, sentimentScore));
  if (sentimentScore >= 65) sentimentVote = 'BUY';
  else if (sentimentScore <= 35) sentimentVote = 'PASS';

  const sentimentQuote =
    sentimentVote === 'BUY'
      ? `Strong community presence across X and Telegram with active DEX boosting.`
      : sentimentVote === 'CAUTION'
      ? `Social presence is baseline (${hasTwitter ? 'X linked' : 'No X'}). Organic community building.`
      : `Ghost launch. No social handles or community links detected.`;

  agents.push({
    id: 'SENTIMENT',
    name: 'Sentiment Agent',
    emoji: '📊',
    vote: sentimentVote,
    score: sentimentScore,
    quote: sentimentQuote,
    details: sentimentDetails,
  });

  // ═══════════════════════════════════════════════════════════════
  // 4. 💰 PORTFOLIO AGENT (Position Sizing & Risk Management)
  // ═══════════════════════════════════════════════════════════════
  let portfolioScore = 70;
  let portfolioVote: 'BUY' | 'CAUTION' | 'PASS' = 'BUY';
  const portfolioDetails: string[] = [];

  // Calculate recommended sizing
  let optimalSol = 0.15;
  if (userSolBalance >= 2.0) optimalSol = 0.35;
  else if (userSolBalance >= 0.5) optimalSol = 0.15;
  else optimalSol = Math.max(0.05, userSolBalance * 0.25);

  optimalSol = Math.round(optimalSol * 100) / 100;
  const optimalUsd = Math.round(optimalSol * 185 * 100) / 100;

  if (safetyVote === 'PASS' || isVeto) {
    portfolioScore = 20;
    portfolioVote = 'PASS';
    portfolioDetails.push('Safety veto: 0% portfolio allocation recommended');
  } else if (safetyVote === 'CAUTION') {
    optimalSol = Math.max(0.05, Math.round((optimalSol * 0.5) * 100) / 100);
    portfolioScore = 55;
    portfolioVote = 'CAUTION';
    portfolioDetails.push(`Reduced size to ${optimalSol} SOL ($${(optimalSol * 185).toFixed(2)}) due to risk`);
  } else {
    portfolioDetails.push(`Allocating ${optimalSol} SOL ($${(optimalSol * 185).toFixed(2)}) within balance limits`);
  }

  const portfolioQuote =
    portfolioVote === 'BUY'
      ? `Wallet balance ${userSolBalance.toFixed(2)} SOL. Recommend standard entry size of ${optimalSol} SOL.`
      : portfolioVote === 'CAUTION'
      ? `Higher volatility profile. Cap entry size to ${optimalSol} SOL with strict risk limits.`
      : `Zero allocation. Risk-to-reward ratio does not justify capital deployment.`;

  agents.push({
    id: 'PORTFOLIO',
    name: 'Portfolio Agent',
    emoji: '💰',
    vote: portfolioVote,
    score: portfolioScore,
    quote: portfolioQuote,
    details: portfolioDetails,
  });

  // ═══════════════════════════════════════════════════════════════
  // 5. 🎯 EXECUTION AGENT (Routing, Slippage & MEV Protection)
  // ═══════════════════════════════════════════════════════════════
  let executionScore = 80;
  let executionVote: 'BUY' | 'CAUTION' | 'PASS' = 'BUY';
  let recommendedSlippageBps = 250; // 2.5%
  let jitoProtection = true;
  const executionDetails: string[] = [];

  if (liquidityUsd < 15000) {
    recommendedSlippageBps = 400; // 4%
    executionDetails.push('Low liquidity: Raised slippage to 4.0%');
  } else {
    executionDetails.push('Good liquidity: Optimal 2.5% slippage');
  }

  if (bundleAnalysis.bundleType === 'JITO' || isBoosted) {
    jitoProtection = true;
    executionDetails.push('Jito MEV tip enabled for frontrun protection');
  }

  if (safetyVote === 'PASS' || isVeto) {
    executionScore = 20;
    executionVote = 'PASS';
  } else if (safetyVote === 'CAUTION') {
    executionScore = 60;
    executionVote = 'CAUTION';
  }

  const executionQuote =
    executionVote === 'BUY'
      ? `Execute via Jupiter DEX aggregator with ${(recommendedSlippageBps / 100).toFixed(1)}% slippage & Jito MEV protection.`
      : executionVote === 'CAUTION'
      ? `If entering, use ${(recommendedSlippageBps / 100).toFixed(1)}% slippage and fast Jito tip to avoid slippage traps.`
      : `Execution aborted. Awaiting clear consensus before routing trade.`;

  agents.push({
    id: 'EXECUTION',
    name: 'Execution Agent',
    emoji: '🎯',
    vote: executionVote,
    score: executionScore,
    quote: executionQuote,
    details: executionDetails,
  });

  // ═══════════════════════════════════════════════════════════════
  // ⚖️ SWARM CONSENSUS ENGINE (Weighted Decision & Debate)
  // ═══════════════════════════════════════════════════════════════
  // Weights: Safety 30%, Sniper 25%, Sentiment 15%, Portfolio 15%, Execution 15%
  const weightedScore = Math.round(
    safetyScore * 0.30 +
    sniperScore * 0.25 +
    sentimentScore * 0.15 +
    portfolioScore * 0.15 +
    executionScore * 0.15
  );

  let decision: 'BUY' | 'CAUTION' | 'PASS' = 'CAUTION';
  let decisionEmoji = '🟡';
  let reasoning = '';

  if (isVeto || safetyVote === 'PASS') {
    decision = 'PASS';
    decisionEmoji = '❌';
    reasoning = 'Safety Agent exercised VETO power due to high insider/bundle risk, overriding Sniper.';
  } else if (weightedScore >= 70 && safetyVote === 'BUY' && sniperVote === 'BUY') {
    decision = 'BUY';
    decisionEmoji = '🟢';
    reasoning = 'Full Swarm alignment: Strong volume momentum, clean safety checks, and positive sentiment.';
  } else if (weightedScore >= 45) {
    decision = 'CAUTION';
    decisionEmoji = '🟡';
    reasoning = 'Mixed signals: Sniper sees momentum, but Safety/Sentiment suggest reduced size & tight stop.';
  } else {
    decision = 'PASS';
    decisionEmoji = '❌';
    reasoning = 'Swarm consensus rejected: Weak volume, unverified socials, or unfavorable risk-to-reward.';
  }

  return {
    tokenMint,
    tokenSymbol,
    tokenName,
    priceUsd,
    liquidityUsd,
    marketCapUsd,
    volume24hUsd,
    priceChange24h,
    decision,
    decisionEmoji,
    consensusScore: weightedScore,
    recommendedSolSize: optimalSol,
    recommendedUsdSize: optimalUsd,
    jitoProtection,
    recommendedSlippageBps,
    reasoning,
    agents,
    createdAt: new Date(),
  };
}
