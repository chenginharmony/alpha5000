export interface BundleScoreInput {
  pctSupplyBought: number;    // e.g. 34.5 (%)
  walletCount: number;        // e.g. 18
  burnerCount: number;        // Number of wallets < 24h old
  totalSolSpent: number;      // e.g. 450.5 SOL
  hasCommonFunder: boolean;   // True if multiple wallets funded by same address
  commonFunderCount?: number; // How many wallets shared the same funder
  devInBundle: boolean;       // True if token creator/dev bought in bundle
  devFundedBundle: boolean;   // True if token creator/dev funded the bundle wallets
  isJitoBundle: boolean;      // True if atomic same-slot execution
  slotsElapsed: number;       // Slots between creation and buys
}

export interface RiskFactor {
  name: string;
  weight: number;
  score: number;
  weightedScore: number;
  summary: string;
}

export interface BundleScoreResult {
  riskScore: number;          // 0 - 100
  riskLevel: 'EXTREME' | 'HIGH' | 'MEDIUM' | 'LOW';
  riskEmoji: string;
  recommendation: string;
  factors: RiskFactor[];
  reasons: string[];
}

export class BundleRiskScorer {
  /**
   * Evaluates the 6 independent risk factors and returns weighted score
   */
  static calculateScore(input: BundleScoreInput): BundleScoreResult {
    const factors: RiskFactor[] = [];
    const reasons: string[] = [];

    // 1. Supply Concentration (Weight: 25%)
    let supplyScore = 0;
    if (input.pctSupplyBought >= 50) {
      supplyScore = 100;
      reasons.push(`🚨 Bundle holds ${input.pctSupplyBought.toFixed(1)}% of total supply (MASSIVE control)`);
    } else if (input.pctSupplyBought >= 30) {
      supplyScore = 85;
      reasons.push(`⚠️ Bundle holds ${input.pctSupplyBought.toFixed(1)}% of total supply (High concentration)`);
    } else if (input.pctSupplyBought >= 15) {
      supplyScore = 55;
      reasons.push(`Bundle acquired ${input.pctSupplyBought.toFixed(1)}% of total supply`);
    } else if (input.pctSupplyBought >= 5) {
      supplyScore = 25;
    }
    factors.push({
      name: 'Supply Concentration',
      weight: 0.25,
      score: supplyScore,
      weightedScore: supplyScore * 0.25,
      summary: `${input.pctSupplyBought.toFixed(1)}% supply grabbed`,
    });

    // 2. Wallet Freshness / Burner Ratio (Weight: 20%)
    let freshnessScore = 0;
    const burnerRatio = input.walletCount > 0 ? (input.burnerCount / input.walletCount) : 0;
    if (burnerRatio >= 0.8 && input.walletCount >= 3) {
      freshnessScore = 100;
      reasons.push(`🔥 ${input.burnerCount}/${input.walletCount} wallets are brand new burners (<24h old)`);
    } else if (burnerRatio >= 0.5) {
      freshnessScore = 70;
      reasons.push(`${input.burnerCount}/${input.walletCount} wallets are new burner accounts`);
    } else if (burnerRatio >= 0.25) {
      freshnessScore = 40;
    }
    factors.push({
      name: 'Wallet Freshness',
      weight: 0.20,
      score: freshnessScore,
      weightedScore: freshnessScore * 0.20,
      summary: `${(burnerRatio * 100).toFixed(0)}% burner wallets`,
    });

    // 3. Funding Pattern / Common Funder (Weight: 20%)
    let fundingScore = 0;
    if (input.devFundedBundle) {
      fundingScore = 100;
      reasons.push(`🎯 DEV WALLET FUNDED THE BUNDLE directly before launch`);
    } else if (input.hasCommonFunder) {
      fundingScore = 90;
      reasons.push(`🔗 Wallets funded from the SAME master address (Sybil cluster)`);
    } else if (input.commonFunderCount && input.commonFunderCount >= 3) {
      fundingScore = 60;
      reasons.push(`${input.commonFunderCount} wallets share a common funding source`);
    }
    factors.push({
      name: 'Funding Pattern',
      weight: 0.20,
      score: fundingScore,
      weightedScore: fundingScore * 0.20,
      summary: input.devFundedBundle ? 'Dev Funded' : input.hasCommonFunder ? 'Same Funder' : 'Organic',
    });

    // 4. SOL Capital Commitment (Weight: 15%)
    let capitalScore = 0;
    if (input.totalSolSpent >= 500) {
      capitalScore = 100;
      reasons.push(`💰 ${input.totalSolSpent.toFixed(1)} SOL deployed (Extremely heavy insider buy)`);
    } else if (input.totalSolSpent >= 150) {
      capitalScore = 80;
      reasons.push(`💰 ${input.totalSolSpent.toFixed(1)} SOL committed in launch bundle`);
    } else if (input.totalSolSpent >= 50) {
      capitalScore = 55;
      reasons.push(`${input.totalSolSpent.toFixed(1)} SOL committed at launch`);
    } else if (input.totalSolSpent >= 15) {
      capitalScore = 30;
    }
    factors.push({
      name: 'Capital Commitment',
      weight: 0.15,
      score: capitalScore,
      weightedScore: capitalScore * 0.15,
      summary: `${input.totalSolSpent.toFixed(1)} SOL committed`,
    });

    // 5. Dev Overlap (Weight: 12%)
    let devScore = 0;
    if (input.devInBundle) {
      devScore = 100;
      reasons.push(`👤 DEV WALLET IS IN THE BUNDLE (Direct insider sniping)`);
    }
    factors.push({
      name: 'Dev Overlap',
      weight: 0.12,
      score: devScore,
      weightedScore: devScore * 0.12,
      summary: input.devInBundle ? 'Dev Sniped' : 'No Dev Overlap',
    });

    // 6. Timing & Jito Precision (Weight: 8%)
    let timingScore = 0;
    if (input.isJitoBundle) {
      timingScore = 100;
      reasons.push(`⚡ Atomic Jito MEV bundle executed in same slot`);
    } else if (input.slotsElapsed <= 3 && input.walletCount >= 4) {
      timingScore = 80;
      reasons.push(`⏱️ Coordinated multi-wallet buy within ${input.slotsElapsed} slots of creation`);
    } else if (input.slotsElapsed <= 8) {
      timingScore = 40;
    }
    factors.push({
      name: 'Timing Precision',
      weight: 0.08,
      score: timingScore,
      weightedScore: timingScore * 0.08,
      summary: input.isJitoBundle ? 'Jito Atomic' : `Within ${input.slotsElapsed} slots`,
    });

    // Compute Total Weighted Score
    const totalWeightedScore = factors.reduce((sum, f) => sum + f.weightedScore, 0);
    const riskScore = Math.min(100, Math.max(0, Math.round(totalWeightedScore)));

    let riskLevel: 'EXTREME' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    let riskEmoji = '🟢';
    let recommendation = '✅ Clean organic launch detected. No significant insider bundle found.';

    if (riskScore >= 80) {
      riskLevel = 'EXTREME';
      riskEmoji = '🟥';
      recommendation = '⛔ DANGER: High probability of dev/insider dump. AVOID or exercise extreme caution.';
    } else if (riskScore >= 60) {
      riskLevel = 'HIGH';
      riskEmoji = '🟧';
      recommendation = '⚠️ CAUTION: High insider bundle concentration detected. Tight stop-loss recommended.';
    } else if (riskScore >= 35) {
      riskLevel = 'MEDIUM';
      riskEmoji = '🟨';
      recommendation = '🟡 MODERATE: Some coordinated buyer activity at launch. DYOR.';
    }

    return {
      riskScore,
      riskLevel,
      riskEmoji,
      recommendation,
      factors,
      reasons,
    };
  }
}
