import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  SOLANA_RPC_URL: z.string().url(),
  HELIUS_API_KEY: z.string().min(1),
  PRIVATE_KEY_BASE58: z.string().min(1),

  TRADE_BUDGET_USD: z.string().default('6.00').transform(Number),
  TAKE_PROFIT_PERCENT: z.string().default('50').transform(Number),
  STOP_LOSS_PERCENT: z.string().default('-30').transform(Number),
  MAX_SLIPPAGE_BPS: z.string().default('200').transform(Number),
  MIN_WHALE_BUY_USD: z.string().default('100').transform(Number),

  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().optional().transform(val => val || undefined),

  DATABASE_URL: z.string().min(1),
  PORT: z.string().default('3000').transform(Number),
  WEBHOOK_SECRET: z.string().min(1),

  // Optional: Mobula for wallet discovery
  MOBULA_API_KEY: z.string().optional().transform(val => val || undefined),

  // Optional: Webhook URL for Helius auto-setup
  WEBHOOK_URL: z.string().url().optional().or(z.literal('')).transform(val => val || undefined),

  // === REFERRAL FEES ===
  PLATFORM_FEE_BPS: z.string().default('20').transform(Number), // 20 = 0.2%
  FEE_WALLET_ADDRESS: z.string().optional().transform(val => val || undefined), // Where fees go (defaults to bot wallet)
  JUPITER_API_KEY: z.string().optional().transform(val => val || undefined), // Jupiter API / Referral key
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
