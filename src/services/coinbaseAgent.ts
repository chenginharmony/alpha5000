import { config } from '../config';

export interface CdpAgentStatus {
  isConfigured: boolean;
  projectId: string;
  apiKeyId: string;
  clientKey: string;
  network: string;
  supportedCapabilities: string[];
}

export interface AgenticExecutionPlan {
  agentName: string;
  action: 'BUY' | 'SELL' | 'HOLD' | 'REBALANCE';
  targetMint: string;
  targetSymbol: string;
  suggestedAllocationSol: number;
  confidenceScore: number;
  reasoning: string;
}

/**
 * Returns the status and capabilities of the Coinbase CDP Agentic Engine
 */
export function getCdpAgentStatus(): CdpAgentStatus {
  const isConfigured = Boolean(config.COINBASE_API_KEY_ID && config.COINBASE_API_SECRET);

  return {
    isConfigured,
    projectId: config.COINBASE_PROJECT_ID,
    apiKeyId: config.COINBASE_API_KEY_ID,
    clientKey: config.COINBASE_CLIENT_KEY,
    network: 'solana-mainnet',
    supportedCapabilities: [
      'Autonomous MPC Agent Wallets',
      'Coinbase Onramp (Fiat -> SOL instant funding)',
      'AI Swarm Coordinated Trade Execution',
      'Gasless / Priority Execution Routing',
      'Multi-Agent Portfolio Rebalancing',
    ],
  };
}

/**
 * Generate Coinbase Agentic Onramp link for autonomous funding
 */
export function generateAgentOnrampLink(userWalletAddress: string, presetAmountUsd: number = 25): string {
  const appId = config.COINBASE_PROJECT_ID;
  const destinationWallets = JSON.stringify([
    {
      address: userWalletAddress,
      blockchains: ['solana'],
    },
  ]);

  const params = new URLSearchParams({
    appId,
    destinationWallets,
    defaultAsset: 'SOL',
    defaultNetwork: 'solana',
    fiatCurrency: 'USD',
    presetFiatAmount: String(presetAmountUsd),
  });

  return `https://pay.coinbase.com/buy/select-asset?${params.toString()}`;
}

/**
 * Generates an autonomous agent execution recommendation based on CDP and on-chain intelligence
 */
export async function evaluateAgenticOpportunity(
  tokenMint: string,
  tokenSymbol: string,
  solBudget: number = 0.05
): Promise<AgenticExecutionPlan> {
  const { runSwarmCouncilAnalysis } = await import('./aiSwarm');
  const swarmVerdict = await runSwarmCouncilAnalysis(tokenMint);

  let action: 'BUY' | 'SELL' | 'HOLD' | 'REBALANCE' = 'HOLD';
  let suggestedAllocation = 0;

  if (swarmVerdict.decision === 'BUY' && swarmVerdict.consensusScore >= 70) {
    action = 'BUY';
    suggestedAllocation = solBudget;
  } else if (swarmVerdict.decision === 'PASS') {
    action = 'SELL';
  }

  return {
    agentName: 'Alpha5000 CDP Agentic Swarm',
    action,
    targetMint: tokenMint,
    targetSymbol: tokenSymbol || swarmVerdict.tokenSymbol,
    suggestedAllocationSol: suggestedAllocation,
    confidenceScore: swarmVerdict.consensusScore,
    reasoning: swarmVerdict.reasoning,
  };
}
