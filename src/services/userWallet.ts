import crypto from 'crypto';
import { Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { prisma } from '../db';
import { connection } from './jupiter';
import { config } from '../config';

// 32-byte encryption key derived from environment secret
const ENCRYPTION_SECRET = process.env.WALLET_ENCRYPTION_KEY || process.env.WEBHOOK_SECRET || 'alpha5000_secure_vault_key_2026';
const MASTER_KEY = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();

export interface UserWalletInfo {
  userChatId: string;
  publicKey: string;
  balanceSol: number;
  balanceLamports: number;
  balanceUsd: number;
  solPriceUsd: number;
}

/**
 * Encrypt a secret key buffer with AES-256-GCM
 */
function encryptKey(secretKey: Uint8Array): { encrypted: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  
  const secretHex = Buffer.from(secretKey).toString('hex');
  let encrypted = cipher.update(secretHex, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag,
  };
}

/**
 * Decrypt AES-256-GCM into Keypair
 */
function decryptKeypair(encrypted: string, iv: string, authTag: string): Keypair {
  const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decryptedHex = decipher.update(encrypted, 'hex', 'utf8');
  decryptedHex += decipher.final('utf8');
  
  const secretKey = Buffer.from(decryptedHex, 'hex');
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

/**
 * Get or create an embedded Solana wallet for a Telegram user
 */
export async function getOrCreateUserWallet(userChatId: string | number): Promise<{ publicKey: string; isNew: boolean }> {
  const chatIdStr = String(userChatId);
  let wallet = await prisma.userWallet.findUnique({
    where: { userChatId: chatIdStr },
  });

  if (wallet) {
    return { publicKey: wallet.publicKey, isNew: false };
  }

  // Generate new Solana Keypair
  const newKeypair = Keypair.generate();
  const publicKeyStr = newKeypair.publicKey.toBase58();
  const { encrypted, iv, authTag } = encryptKey(newKeypair.secretKey);

  wallet = await prisma.userWallet.create({
    data: {
      userChatId: chatIdStr,
      publicKey: publicKeyStr,
      encryptedPrivateKey: encrypted,
      iv,
      authTag,
      lastBalanceSol: 0,
      lastBalanceUsd: 0,
    },
  });

  return { publicKey: publicKeyStr, isNew: true };
}

/**
 * Get decrypted Keypair for signing user transactions in-memory
 */
export async function getUserWalletKeypair(userChatId: string | number): Promise<Keypair> {
  const chatIdStr = String(userChatId);
  const wallet = await prisma.userWallet.findUnique({
    where: { userChatId: chatIdStr },
  });

  if (!wallet) {
    throw new Error(`Wallet not found for user ${chatIdStr}. Please start the bot with /start.`);
  }

  return decryptKeypair(wallet.encryptedPrivateKey, wallet.iv, wallet.authTag);
}

/**
 * Fetch live SOL price in USD
 */
let cachedSolPrice = 180;
let lastPriceFetch = 0;

export async function getSolPriceUsd(): Promise<number> {
  const now = Date.now();
  if (now - lastPriceFetch < 60000) {
    return cachedSolPrice;
  }

  try {
    const res = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
    const json = await res.json();
    const price = parseFloat(json.data?.['So11111111111111111111111111111111111111112']?.price || '180');
    if (price > 0) {
      cachedSolPrice = price;
      lastPriceFetch = now;
    }
  } catch {}

  return cachedSolPrice;
}

/**
 * Get live on-chain SOL balance and USD equivalent
 */
export async function getUserWalletInfo(userChatId: string | number): Promise<UserWalletInfo> {
  const chatIdStr = String(userChatId);
  const { publicKey } = await getOrCreateUserWallet(chatIdStr);

  let lamports = 0;
  try {
    lamports = await connection.getBalance(new PublicKey(publicKey), 'confirmed');
  } catch (e) {
    console.error(`Balance fetch error for ${publicKey}:`, (e as Error).message);
  }

  const solBalance = lamports / LAMPORTS_PER_SOL;
  const solPrice = await getSolPriceUsd();
  const balanceUsd = solBalance * solPrice;

  // Update DB cache
  await prisma.userWallet.update({
    where: { userChatId: chatIdStr },
    data: {
      lastBalanceSol: solBalance,
      lastBalanceUsd: balanceUsd,
    },
  }).catch(() => {});

  return {
    userChatId: chatIdStr,
    publicKey,
    balanceSol: solBalance,
    balanceLamports: lamports,
    balanceUsd,
    solPriceUsd: solPrice,
  };
}

/**
 * Withdraw SOL to an external wallet
 */
export async function withdrawSol(
  userChatId: string | number,
  destinationAddress: string,
  amountSol: number
): Promise<{ success: boolean; txid?: string; error?: string }> {
  const chatIdStr = String(userChatId);

  let toPubkey: PublicKey;
  try {
    toPubkey = new PublicKey(destinationAddress.trim());
  } catch {
    return { success: false, error: 'Invalid destination Solana address.' };
  }

  const keypair = await getUserWalletKeypair(chatIdStr);
  const lamports = await connection.getBalance(keypair.publicKey, 'confirmed');

  const feeLamports = 5000; // 0.000005 SOL network fee
  const withdrawLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

  if (withdrawLamports + feeLamports > lamports) {
    const maxSol = Math.max(0, (lamports - feeLamports) / LAMPORTS_PER_SOL);
    return {
      success: false,
      error: `Insufficient balance. Available: ${maxSol.toFixed(4)} SOL (after network fee).`,
    };
  }

  try {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey,
        lamports: withdrawLamports,
      })
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = keypair.publicKey;
    tx.sign(keypair);

    const rawTx = tx.serialize();
    const txid = await connection.sendRawTransaction(rawTx, {
      skipPreflight: true,
      maxRetries: 3,
    });

    await connection.confirmTransaction({
      blockhash,
      lastValidBlockHeight,
      signature: txid,
    }, 'confirmed');

    return { success: true, txid };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/**
 * Securely export Base58 private key
 */
export async function exportPrivateKey(userChatId: string | number): Promise<string> {
  const keypair = await getUserWalletKeypair(userChatId);
  return bs58.encode(keypair.secretKey);
}
