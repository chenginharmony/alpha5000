import fetch from 'cross-fetch';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../config';

const connection = new Connection(config.SOLANA_RPC_URL, 'confirmed');

// Known scam patterns (fast string checks)
const BLACKLIST_MINTS = new Set<string>([
  // Add known honeypot/ scam token mints here
]);

interface ValidationResult {
  safe: boolean;
  reason?: string;
  liquidityUsd?: number;
}

// ⚡ Ultra-fast validation (< 100ms)
export async function quickValidateToken(mint: string): Promise<ValidationResult> {
  // 1. Blacklist check (instant)
  if (BLACKLIST_MINTS.has(mint)) {
    return { safe: false, reason: 'Blacklisted token' };
  }

  // 2. Basic mint validity (fast RPC)
  try {
    const mintPubkey = new PublicKey(mint);
    const accountInfo = await connection.getAccountInfo(mintPubkey);
    if (!accountInfo) {
      return { safe: false, reason: 'Mint account not found' };
    }
  } catch {
    return { safe: false, reason: 'Invalid mint address' };
  }

  // 3. Jupiter route check (ensures tradability)
  try {
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${mint}&amount=100000&slippageBps=200`;
    const res = await fetch(quoteUrl, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      return { safe: false, reason: 'No Jupiter route (illiquid or untradable)' };
    }
    const data = await res.json();
    if (!data.routePlan || data.routePlan.length === 0) {
      return { safe: false, reason: 'Empty route plan' };
    }
    return { safe: true, liquidityUsd: data.outAmount ? Number(data.outAmount) : undefined };
  } catch (e) {
    // If Jupiter check fails, allow but warn (don't block on API hiccups)
    console.warn('Jupiter validation failed:', (e as Error).message);
    return { safe: true, reason: 'Validation skipped (Jupiter timeout)' };
  }
}

// Optional: Deep validation via RugCheck (slower, ~500ms)
export async function deepValidateToken(mint: string): Promise<ValidationResult> {
  try {
    const res = await fetch(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { safe: true, reason: 'RugCheck unavailable' };

    const data = await res.json();
    const score = data.score || 0;

    if (score > 500) {
      return { safe: false, reason: `RugCheck score too high: ${score}` };
    }
    return { safe: true };
  } catch {
    return { safe: true, reason: 'Deep validation failed, allowing' };
  }
}
