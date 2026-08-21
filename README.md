# 🚀 Alpha5000 — Solana Whale Copy-Trading Bot

**Alpha5000** is an ultra-fast, self-hosted Solana copy-trading bot that watches whale wallets and instantly mirrors their buys with your fixed budget ($0.80–$6+). Auto-sells on profit targets.

---

## ⚡ Speed Architecture

| Step | Latency | Method |
|------|---------|--------|
| Whale signs tx | ~400ms | On-chain |
| Helius detects + webhook | ~100ms | **Enhanced Webhook** |
| Bot parses + validates | ~50ms | Inline processing |
| Jupiter quote + swap | ~800ms | v6 API + skipPreflight |
| **Total detection→buy** | **~1.3s** | |

**Key speed decisions:**
- ✅ **Helius Enhanced Webhooks** (not polling)
- ✅ **Inline execution** (no job queues on buy path)
- ✅ **skipPreflight** on transaction send (risky but saves 200-400ms)
- ✅ **Jupiter price cache** (avoids duplicate API calls)
- ✅ **Instant HTTP 200** response to Helius, process async

---

## 📋 Prerequisites

1. **Node.js 20+**
2. **PostgreSQL** (or use Docker)
3. **Helius API Key** — [helius.xyz](https://helius.xyz) (free tier works)
4. **Mobula API Key** (Optional) — [mobula.io](https://mobula.io) for wallet discovery & leaderboard
5. **Telegram Bot** — message [@BotFather](https://t.me/BotFather)
6. **Solana Wallet** with SOL for gas + trade capital
7. **VPS/Server** with public IP (for webhooks)

---

## 🔍 Wallet Discovery & Analytics (Powered by Mobula)

The bot integrates with the **Mobula API** to automatically discover profitable whale wallets from trending tokens, evaluate trader metrics, and power the leaderboard.

### Mobula vs Birdeye Comparison

| Feature | Birdeye | Mobula |
|---|---|---|
| **Top traders per token** | `/defi/v2/tokens/top_traders` | `GET /api/1/token/top-traders` |
| **Wallet P&L + win rate** | Trader object fields | `GET /api/1/wallet/trading-analysis` |
| **Wallet labels/tags** | `tags` array | `GET /api/1/wallet/labels` (`proTrader`, `smartTrader`, `sniper`, `bundler`, `insider`) |
| **Trending tokens** | `/defi/v2/tokens/trending` | `GET /api/2/pulse` |
| **Token metadata** | Token metadata | `GET /api/1/market/multi-data` |
| **Free tier** | Tight limits | ✅ **Full access, production-usable** |
| **Latency** | ~200ms | ✅ **~50ms** |
| **Price refresh** | Cached | ✅ **No cache, 5s refresh** |
| **Chains supported** | Solana only | ✅ **90+ chains** |


---

## 👥 Group Bot Mode (Signal-Only)

The bot can join Telegram groups and act as a **shared signal feed**. Group members see whale buy alerts and can copy-trade privately via DM.

### How Group Mode Works

```
┌─────────────────────────────────────────────────────────────┐
│  Alpha Traders Club (Group)                                │
│                                                             │
│  🐋 WHALE BUY DETECTED                                     │
│                                                             │
│  Wallet: 7xKX...tg2C [smart_trader]                        │
│  Token: BONK                                               │
│  Whale Size: ~$12,400                                      │
│                                                             │
│  [🚀 Copy in DM] [⏩ Skip] [📊 DexScreener]                │
│                                                             │
│  💡 Tap "Copy in DM" to trade with your personal bot       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Private DM with @YourBotName                              │
│                                                             │
│  🐋 Copy Trade Setup                                       │
│                                                             │
│  Whale: 7xKX...tg2C                                        │
│  Token: BONK                                               │
│  Your Budget: $6.00                                        │
│                                                             │
│  [🚀 Copy Buy $6.00] [💰 Custom Amount]                    │
│  [⚙️ Change Budget] [⬅️ Back]                             │
└─────────────────────────────────────────────────────────────┘
```

### Group Commands

| Command | Who | Description |
|---------|-----|-------------|
| `/track <wallet>` | Admin | Add whale wallet to group feed |
| `/untrack <wallet>` | Admin | Remove whale wallet |
| `/wallets` | Anyone | List all tracked wallets |
| `/sync` | Admin | Force sync wallets to Helius |
| `/leaderboard` | Anyone | See active members count |
| `/mysettings` | Anyone | Get link to personal settings DM |
| `/help` | Anyone | Full command guide |

### Setting Up a Group

1. **Add bot to your group** as admin (needs "Send Messages" and "Delete Messages")
2. **Admin runs:** `/track 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU`
3. **Bot confirms:** "✅ Now tracking whale wallet..."
4. **When whale buys:** Alert posts to group automatically
5. **Members click "🚀 Copy in DM"** → Opens private chat with bot
6. **Member sets budget** → Bot copies the trade

### Privacy Model

- **Group sees:** Only whale alerts (no member data)
- **Member wallets:** Private, never shared in group
- **Trades:** Executed individually in each member's private bot
- **No shared pool:** Each member controls their own funds

### Revenue Opportunity

Since members DM the bot to copy-trade, you can:
- **Referral fees:** 0.5-1% via Jupiter referral API
- **Premium groups:** Token-gated or subscription for more whales
- **SaaS hosting:** Charge monthly for hosted bot instances

---

## 💰 Referral Fee Earnings

The bot earns a platform fee on **every trade** executed through Jupiter. This is how you monetize the bot — whether running it for yourself, a group, or as a SaaS.

### How It Works

```
Member copies whale buy: $6.00
Platform fee (0.2%):     $0.012
Jupiter's cut (2.5%):    $0.0003
You earn:                $0.0117
```

**At 100 trades/day:** ~$1.17/day = **~$35/month**
**At 1,000 trades/day:** ~$11.70/day = **~$350/month**

### Setup

1. **Set your fee rate** in `.env`:
```env
PLATFORM_FEE_BPS=20        # 20 = 0.2% per trade (max 100 = 1%)
FEE_WALLET_ADDRESS=        # Optional: separate wallet for fees
```

2. **Fees are collected automatically** in the output token of each swap
3. **View earnings** in Telegram: `💰 Fees` menu

### Fee Dashboard (Telegram)

```
💰 Referral Fee Dashboard

Settings
Fee Rate: 0.20% per trade
Fee Wallet: 7xKX...tg2C

Earnings
Total Fees: $12.45
Fee Trades: 1,024
Top Token: BONK

How it works:
Every copy trade charges 0.20% as a platform fee.
Fees are sent to your fee wallet automatically.
Jupiter takes 2.5% of what you earn as their cut.
```

### Best Practices

- **Start low (0.1-0.2%)** — Members won't notice, but it scales
- **Use a separate fee wallet** — Keeps earnings organized
- **Create token accounts** — For common tokens (USDC, SOL) to ensure fees are collected
- **Monitor the dashboard** — Check `💰 Fees` weekly to see what's working

---
## 🚀 Quick Start

### 1. Clone & Install

```bash
cd solana-whale-bot
npm install
npx prisma generate
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your keys
```

**Critical env vars:**

```env
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
HELIUS_API_KEY=your_helius_key
PRIVATE_KEY_BASE58=your_wallet_private_key_base58

TRADE_BUDGET_USD=6.00
TAKE_PROFIT_PERCENT=50
STOP_LOSS_PERCENT=-30

TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

MOBULA_API_KEY=your_mobula_api_key

WEBHOOK_URL=https://your-server.com/webhook/helius
WEBHOOK_SECRET=random_secret_123
```

> 🔒 **SECURITY**: Use a dedicated wallet with only trade capital. Never use your main wallet.

### 3. Set up Database

```bash
# Local PostgreSQL
npm run db:push

# Or use Docker
docker-compose up -d postgres
npm run db:push
```

### 4. Add Whale Wallets

Via Telegram (fastest):
```
/addwallet 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
```

Or via Prisma Studio:
```bash
npm run db:studio
# Add rows to WatchedWallet table
```

### 5. Run

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

---

## 🐳 Docker Deploy

```bash
docker-compose up -d
```

This starts:
- PostgreSQL database
- Bot server (auto-migrates DB on start)

---

## 📡 Helius Webhook Setup

The bot auto-configures the webhook on startup if `WEBHOOK_URL` is set.

**Manual setup** (if auto fails):
1. Go to [Helius Dev Portal](https://dev.helius.xyz/webhooks)
2. Create Enhanced Webhook
3. URL: `https://your-server.com/webhook/helius`
4. Auth Header: same as `WEBHOOK_SECRET`
5. Transaction Type: `ANY`
6. Add your whale wallet addresses
7. Enable: `Native Balance Changes` + `Token Balance Changes`

---

## 👥 User Referral & Growth System

The bot includes an automated viral referral system allowing users to invite fellow traders and earn **20% of all platform fees** generated by their copy trades forever.

- **Unique Deep-Link**: `https://t.me/<YourBotName>?start=ref_<chatId>`
- **1-Tap Sharing**: Uses Telegram's native share deep-link (`https://t.me/share/url`) to share directly with friends and alpha groups.
- **Profit-Win CTA**: Whenever a user hits take-profit on a trade, the bot prompts a celebratory share button to showcase wins and attract new referrals.
- **Dashboard**: Track total friends invited, active traders, cumulative volume generated, and claim commission payouts in SOL.

---

## 🤖 Telegram Commands

| Command | Description |
|---------|-------------|
| `/start` | Open interactive bot dashboard & main menu |
| `/portfolio` | View active holdings, P&L %, and sell buttons |
| `/wallets` | Manage watched whale wallets |
| `/settings` | Configure budget, TP %, SL %, and slippage |
| `/leaderboard` | View top traders, trending tokens, & wallet discovery |
| `/stats` | View bot performance & trade history |
| `/trade` | Execute instant manual buys or sells |
| `/referrals` | View referral link, stats, & claim commissions |
| `/fees` | Platform referral fee dashboard |
| `/refresh` | Refresh status |

---

## ⚙️ How It Works

### Detection Flow
1. Helius streams all transactions for watched wallets
2. Webhook hits your server instantly
3. Bot parses `tokenBalanceChanges` + `nativeBalanceChange`
4. If SOL went out and new tokens came in → **BUY DETECTED**
5. If buy value ≥ `MIN_WHALE_BUY_USD` → trigger copy trade

### Execution Flow
1. Quick token validation (Jupiter route check, ~50ms)
2. Jupiter v6 quote (SOL → Token)
3. Jupiter v6 swap transaction generation
4. Sign + send with `skipPreflight` (speed over safety)
5. Log to DB + Telegram alert

### Sell Flow
1. Cron runs every 30 seconds
2. Fetches current token price (Jupiter Price API)
3. Calculates P&L %
4. If ≥ `TAKE_PROFIT_PERCENT` → market sell
5. If ≤ `STOP_LOSS_PERCENT` → market sell

---

## 🛡️ Safety Features

- **Blacklist**: Add known scam mints to `BLACKLIST_MINTS` in `tokenValidator.ts`
- **Jupiter route check**: Verifies token is tradable before buying
- **Deduplication**: Prevents double-buying same signature
- **🚨 Bundle Detection & Launch Sniper Analysis System**:
  - **Live Feed Dashboard (`/bundles`)**: Renders top 5 latest detected bundled launches with risk badges (🟥 EXTREME, 🟧 HIGH, 🟨 MEDIUM), bundle size (wallets, SOL, USD), % supply grabbed, common funder status, and interactive buttons (`[🔍 Check Token Bundle]`, `[🔄 Refresh]`, `[🔔 Alert Settings]`).
  - **Deep Token Bundle Search (`/checkbundle <address_or_symbol>`)**: Performs live on-chain bundle analysis on any Solana contract, extracting early buyer cluster slots, Jito atomic execution, same-funder addresses, burner wallet ratios, and dev overlap.
  - **6-Factor Weighted Risk Scoring Engine (`BundleRiskScorer`)**:
    1. **Supply Concentration (25%)**: Flags $>30-50\%$ supply grabbed by bundle.
    2. **Wallet Freshness (20%)**: Flags burner accounts created $<24$h before launch.
    3. **Funding Pattern (20%)**: Traces multi-wallet funding back to single dev/master funder.
    4. **Capital Commitment (15%)**: Evaluates total SOL volume committed at launch.
    5. **Dev Overlap (12%)**: Detects dev wallet participation or funding in bundle.
    6. **Timing Precision (8%)**: Identifies same-slot atomic Jito MEV execution.
  - **Auto-Alert Broadcast Stream**: Scans new launches every 7 minutes and broadcasts `🚨 NEW BUNDLE DETECTED` alerts to all registered users and groups when Risk Score $\ge 60$.
  - **Custom Alert Subscriptions (`/bundlesub [min_risk]` & `/bundleunsub`)**: Allows traders to set custom sensitivity thresholds.

- **Live Whale Discovery & Constant Alerts**:
  - **Accelerated Discovery**: Scheduled every **10 minutes** (plus immediate run on boot).
  - **1-Tap Direct Track Buttons**: Every alert includes `[➕ Track #1]`, `[➕ Track #2]`, `[➕ Track #3]`, and `[⚡ Track All Top 3 Whales (+150 AP)]`.
  - **Accurate On-Chain Net Worth & Portfolios**: Integrated Helius DAS API (`getAssetsByOwner`) + Solana RPC to fetch true live SPL token holdings, native SOL balances, and total USD portfolio valuation (e.g. `💎 Net Worth: 94.44 SOL (~$18,328 USD)`).
  - **DEX Platform Identification**: Clearly tags the platform where the smart money trades (e.g. `📍 DEX: Pump.fun`, `Raydium`, `Meteora`) alongside the traded token (`🪙 Token: $Albie`).
  - **Real Token Metadata**: Fixed `UNKNOWN` symbols by batch resolving real token symbols and names (e.g. `$BONK`, `$Albie`, `$TPUSA`) directly via DexScreener & Jupiter.
  - **Multi-Chat Broadcast**: Discovered smart money whale alerts broadcast to all registered bot users, groups, and admins.
  - **Helius Webhook Reuse**: Automatically reuses and updates existing Helius webhooks to respect API limits.
- **Whale dumps**: You're copying buys, not sells. Whale may dump on you.

---

## 📁 Project Structure

```
solana-whale-bot/
├── src/
│   ├── index.ts              # Express server + webhook endpoint
│   ├── config/
│   │   └── index.ts          # Env validation
│   ├── db/
│   │   └── index.ts          # Prisma client
│   └── services/
│       ├── helius.ts                 # Webhook handler & parser ⭐
│       ├── jupiter.ts                # Swap execution ⭐
│       ├── telegram.ts               # Alerts & commands
│       ├── telegramBot.ts            # Telegram bot UI & handlers
│       ├── telegramBotLeaderboard.ts # Leaderboard & discovery UI
│       ├── groupBot.ts               # Group signal feed & admin
│       ├── walletDiscovery.ts        # Mobula wallet discovery & sync ⭐
│       ├── profitMonitor.ts          # Auto-sell cron
│       └── tokenValidator.ts         # Fast safety checks
├── prisma/
│   └── schema.prisma                 # DB schema
├── docker-compose.yml
└── .env.example
```

---

## 💰 Budget Math

| Budget | SOL @ $150 | Jupiter Fee | Net Risk |
|--------|-----------|-------------|----------|
| $0.80 | 0.0053 SOL | ~0.00001 SOL | Gas is ~$0.001 ✅ |
| $6.00 | 0.04 SOL | ~0.0001 SOL | Comfortable ✅ |

**Minimum viable on Solana: $0.50** (gas is negligible)

---

## 🆘 Troubleshooting

**"No route found"**
→ Token is illiquid or too new. Increase `MIN_WHALE_BUY_USD` to filter micro-caps.

**"Transaction failed"**
→ Check wallet SOL balance. Need ~0.01 SOL for gas + trade budget.

**Webhook not firing**
→ Verify `WEBHOOK_URL` is publicly accessible. Use ngrok for local testing.

**Slow execution (>3s)**
→ Check server ping to `helius-rpc.com`. Move VPS closer to US-East.

---

## 📄 License

MIT — Use at your own risk. This is financial software. Test with small amounts first.
