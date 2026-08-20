import fetch from 'cross-fetch';
import {
  Connection,
  Keypair,
  VersionedTransaction,
  PublicKey,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { config } from '../config';
import { prisma } from '../db';

import bs58 from 'bs58';

const connection = new Connection(config.SOLANA_RPC_URL, 'confirmed');

function loadKeypair(keyStr: string): Keypair {
  const trimmed = keyStr.trim();
  // 1. JSON array format (e.g. [1,2,3,...])
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const arr = JSON.parse(trimmed);
      const bytes = new Uint8Array(arr);
      return bytes.length === 32 ? Keypair.fromSeed(bytes) : Keypair.fromSecretKey(bytes);
    } catch {}
  }
  // 2. Base58 format
  try {
    const decoded = bs58.decode(trimmed);
    if (decoded.length === 64) return Keypair.fromSecretKey(decoded);
    if (decoded.length === 32) return Keypair.fromSeed(decoded);
  } catch {}
  // 3. Base64 format
  try {
    const buf = Buffer.from(trimmed, 'base64');
    if (buf.length === 64) return Keypair.fromSecretKey(new Uint8Array(buf));
    if (buf.length === 32) return Keypair.fromSeed(new Uint8Array(buf));
  } catch {}
  // 4. Hex format
  try {
    const buf = Buffer.from(trimmed, 'hex');
    if (buf.length === 64) return Keypair.fromSecretKey(new Uint8Array(buf));
    if (buf.length === 32) return Keypair.fromSeed(new Uint8Array(buf));
  } catch {}

  throw new Error('Invalid PRIVATE_KEY_BASE58: must be a valid 64-byte or 32-byte private key');
}

const wallet = loadKeypair(config.PRIVATE_KEY_BASE58);

export const MY_WALLET_PUBKEY = wallet.publicKey.toBase58();

// Fee wallet (defaults to own wallet if not set)
const FEE_WALLET = config.FEE_WALLET_ADDRESS || MY_WALLET_PUBKEY;
const PLATFORM_FEE_BPS = config.PLATFORM_FEE_BPS || 0;

// Jupiter API Headers
function getJupiterHeaders(isJson: boolean = false): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...(isJson ? { 'Content-Type': 'application/json' } : {}),
  };
  if (config.JUPITER_API_KEY) {
    headers['x-api-key'] = config.JUPITER_API_KEY;
  }
  return headers;
}

// Cache SOL price
let solPriceCache: { price: number; ts: number } | null = null;

async function getSolPrice(): Promise<number> {
  const now = Date.now();
  if (solPriceCache && now - solPriceCache.ts < 30000) {
    return solPriceCache.price;
  }
  try {
    const res = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112', {
      headers: getJupiterHeaders(),
      signal: AbortSignal.timeout(2000),
    });
    const data = await res.json();
    const price = data.data?.['So11111111111111111111111111111111111111112']?.price;
    if (price) {
      solPriceCache = { price: Number(price), ts: now };
      return Number(price);
    }
  } catch { /* fallback */ }
  return solPriceCache?.price || 150;
}

// ═══════════════════════════════════════════════════════════════
// FEE ACCOUNT (for Jupiter referral fees)
// ═══════════════════════════════════════════════════════════════

async function getFeeAccount(outputMint: string): Promise<string | undefined> {
  if (PLATFORM_FEE_BPS <= 0) return undefined;

  try {
    // For ExactIn swaps (SOL -> Token), feeAccount can be input or output mint
    // We'll use the output token's ATA for the fee wallet
    const feeAccount = await getAssociatedTokenAddress(
      new PublicKey(FEE_WALLET),
      new PublicKey(outputMint)
    );
    return feeAccount.toBase58();
  } catch (e) {
    console.warn('Fee account derivation failed:', (e as Error).message);
    return undefined;
  }
}

// ═══════════════════════════════════════════════════════════════
// BUY with referral fees
// ═══════════════════════════════════════════════════════════════

export async function executeBuy(
  tokenMint: string,
  usdAmount: number,
  slippageBps: number = config.MAX_SLIPPAGE_BPS
): Promise<{ success: boolean; txid?: string; error?: string; tokenAmount?: number; feeAmount?: number }> {
  const startTime = Date.now();

  try {
    // Convert USD to lamports
    const solPrice = await getSolPrice();
    const solAmount = usdAmount / solPrice;
    const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

    if (lamports < 50000) {
      return { success: false, error: 'Amount too small (< 0.00005 SOL)' };
    }

    // Get fee account
    const feeAccount = await getFeeAccount(tokenMint);

    // 2. Get Jupiter quote with platform fee
    let quoteUrl = `https://quote-api.jup.ag/v6/quote?` +
      `inputMint=So11111111111111111111111111111111111111112` +
      `&outputMint=${tokenMint}` +
      `&amount=${lamports}` +
      `&slippageBps=${slippageBps}` +
      `&onlyDirectRoutes=false` +
      `&asLegacyTransaction=false`;

    if (PLATFORM_FEE_BPS > 0) {
      quoteUrl += `&platformFeeBps=${PLATFORM_FEE_BPS}`;
    }

    const quoteRes = await fetch(quoteUrl, {
      headers: getJupiterHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    if (!quoteRes.ok) {
      const errText = await quoteRes.text();
      return { success: false, error: `Jupiter quote failed: ${errText}` };
    }
    const quoteData = await quoteRes.json();

    if (!quoteData.routePlan || quoteData.routePlan.length === 0) {
      return { success: false, error: 'No route found' };
    }

    // 3. Get swap transaction
    const swapBody: any = {
      quoteResponse: quoteData,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 100000,
          priorityLevel: "veryHigh"
        }
      }
    };

    // Add fee account if set
    if (feeAccount) {
      swapBody.feeAccount = feeAccount;
    }

    const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: getJupiterHeaders(true),
      body: JSON.stringify(swapBody),
      signal: AbortSignal.timeout(5000),
    });

    if (!swapRes.ok) {
      const errText = await swapRes.text();
      return { success: false, error: `Jupiter swap prep failed: ${errText}` };
    }
    const swapData = await swapRes.json();
    const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');

    // 4. Deserialize, sign, send
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([wallet]);

    const rawTransaction = transaction.serialize();
    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true,
      maxRetries: 2,
      preflightCommitment: 'confirmed',
    });

    // 5. Confirm with timeout
    const confirmation = await connection.confirmTransaction(txid, 'confirmed');
    if (confirmation.value.err) {
      return { success: false, error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`, txid };
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ Buy executed in ${elapsed}ms: ${txid}`);

    // Calculate fee amount (if applicable)
    let feeAmount = 0;
    if (PLATFORM_FEE_BPS > 0 && quoteData.platformFee) {
      feeAmount = Number(quoteData.platformFee) || 0;
    }

    return {
      success: true,
      txid,
      tokenAmount: Number(quoteData.outAmount) / Math.pow(10, quoteData.outputMintDecimals || 6),
      feeAmount,
    };

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ Buy failed after ${elapsed}ms:`, (error as Error).message);
    return { success: false, error: (error as Error).message };
  }
}

// ═══════════════════════════════════════════════════════════════
// SELL with referral fees
// ═══════════════════════════════════════════════════════════════

export async function executeSell(
  tokenMint: string,
  tokenAmount: number,
  decimals: number = 6,
  slippageBps: number = config.MAX_SLIPPAGE_BPS
): Promise<{ success: boolean; txid?: string; error?: string; solReceived?: number }> {
  const startTime = Date.now();

  try {
    const tokenAmountRaw = Math.floor(tokenAmount * Math.pow(10, decimals));

    // For sells (Token -> SOL), feeAccount can only be input mint (the token)
    const feeAccount = await getFeeAccount(tokenMint);

    // 1. Get Jupiter quote (Token -> SOL)
    let quoteUrl = `https://quote-api.jup.ag/v6/quote?` +
      `inputMint=${tokenMint}` +
      `&outputMint=So11111111111111111111111111111111111111112` +
      `&amount=${tokenAmountRaw}` +
      `&slippageBps=${slippageBps}`;

    if (PLATFORM_FEE_BPS > 0) {
      quoteUrl += `&platformFeeBps=${PLATFORM_FEE_BPS}`;
    }

    const quoteRes = await fetch(quoteUrl, {
      headers: getJupiterHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    if (!quoteRes.ok) {
      return { success: false, error: 'No sell route found' };
    }
    const quoteData = await quoteRes.json();

    // 2. Get swap transaction
    const swapBody: any = {
      quoteResponse: quoteData,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 100000,
          priorityLevel: "veryHigh"
        }
      }
    };

    if (feeAccount) {
      swapBody.feeAccount = feeAccount;
    }

    const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: getJupiterHeaders(true),
      body: JSON.stringify(swapBody),
      signal: AbortSignal.timeout(5000),
    });

    const swapData = await swapRes.json();
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(swapData.swapTransaction, 'base64')
    );
    transaction.sign([wallet]);

    const txid = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      maxRetries: 2,
    });

    await connection.confirmTransaction(txid, 'confirmed');

    const elapsed = Date.now() - startTime;
    console.log(`✅ Sell executed in ${elapsed}ms: ${txid}`);

    return {
      success: true,
      txid,
      solReceived: Number(quoteData.outAmount) / LAMPORTS_PER_SOL,
    };

  } catch (error) {
    console.error('❌ Sell failed:', (error as Error).message);
    return { success: false, error: (error as Error).message };
  }
}

// ═══════════════════════════════════════════════════════════════
// FEE TRACKING
// ═══════════════════════════════════════════════════════════════

export async function trackFee(
  tradeId: string,
  tokenMint: string,
  tokenSymbol: string,
  feeAmount: number,
  feeBps: number,
  txid: string,
  traderChatId?: string | number,
  tradeVolumeUsd?: number
) {
  try {
    const solPrice = await getSolPrice();
    const feeAmountUsd = feeAmount * solPrice; // Approx (assumes fee is in tokens)

    await prisma.feeTracking.create({
      data: {
        tradeId,
        tokenMint,
        tokenSymbol,
        feeAmount,
        feeAmountUsd,
        feeBps,
        txid,
      },
    });

    if (traderChatId) {
      const { recordTradeReferralReward } = await import('./referral');
      await recordTradeReferralReward(
        tradeId,
        traderChatId,
        tradeVolumeUsd || 0,
        feeAmountUsd
      );
    }
  } catch (e) {
    console.error('Fee tracking failed:', (e as Error).message);
  }
}

export async function getFeeStats(): Promise<{ totalFeesUsd: number; feeCount: number; topToken: string }> {
  const fees = await prisma.feeTracking.findMany();

  const totalFeesUsd = fees.reduce((sum, f) => sum + Number(f.feeAmountUsd), 0);
  const feeCount = fees.length;

  // Find top token
  const tokenMap = new Map<string, number>();
  for (const f of fees) {
    const current = tokenMap.get(f.tokenSymbol || 'Unknown') || 0;
    tokenMap.set(f.tokenSymbol || 'Unknown', current + Number(f.feeAmountUsd));
  }
  let topToken = 'N/A';
  let maxVal = 0;
  for (const [token, val] of tokenMap) {
    if (val > maxVal) {
      maxVal = val;
      topToken = token;
    }
  }

  return { totalFeesUsd, feeCount, topToken };
}
