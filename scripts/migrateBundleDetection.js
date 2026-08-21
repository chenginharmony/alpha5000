require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function migrate() {
  const prisma = new PrismaClient();
  console.log('Connected to PostgreSQL via Prisma for Bundle Detection migration...');

  try {
    // 1. Create BundleDetection table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BundleDetection" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tokenMint" TEXT NOT NULL UNIQUE,
        "tokenSymbol" TEXT,
        "tokenName" TEXT,
        "launchSlot" TEXT,
        "bundleType" TEXT NOT NULL DEFAULT 'COORDINATED',
        "walletCount" INTEGER NOT NULL DEFAULT 0,
        "totalSolSpent" DECIMAL(18,6) NOT NULL DEFAULT 0,
        "totalUsdSpent" DECIMAL(18,2),
        "pctSupplyBought" DECIMAL(5,2) NOT NULL DEFAULT 0,
        "commonFunder" TEXT,
        "devWallet" TEXT,
        "devInBundle" BOOLEAN NOT NULL DEFAULT false,
        "riskScore" INTEGER NOT NULL DEFAULT 0,
        "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
        "riskSummary" TEXT,
        "rawData" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ BundleDetection table ready');

    // 2. Create BundleWallet table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BundleWallet" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "bundleId" TEXT NOT NULL REFERENCES "BundleDetection"("id") ON DELETE CASCADE,
        "walletAddress" TEXT NOT NULL,
        "solSpent" DECIMAL(18,6) NOT NULL DEFAULT 0,
        "tokensReceived" DECIMAL(36,0),
        "pctSupply" DECIMAL(5,2),
        "fundingSource" TEXT,
        "walletAgeHours" DECIMAL(10,2),
        "isBurner" BOOLEAN NOT NULL DEFAULT false,
        "txHash" TEXT,
        "slot" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ BundleWallet table ready');

    // 3. Create BundleAlertSubscription table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BundleAlertSubscription" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userChatId" TEXT NOT NULL UNIQUE,
        "minRiskScore" INTEGER NOT NULL DEFAULT 60,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ BundleAlertSubscription table ready');

    // 4. Create Indexes
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_bundle_token_mint" ON "BundleDetection"("tokenMint");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_bundle_risk_score" ON "BundleDetection"("riskScore");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_bundle_created_at" ON "BundleDetection"("createdAt");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_bundle_wallet_bundle_id" ON "BundleWallet"("bundleId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_bundle_wallet_address" ON "BundleWallet"("walletAddress");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_bundle_wallet_funding" ON "BundleWallet"("fundingSource");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_bundle_sub_chat_id" ON "BundleAlertSubscription"("userChatId");`);
    console.log('✅ Bundle indexes created');

    console.log('\n🎉 Bundle Detection database migration completed successfully!');
  } catch (e) {
    console.error('Migration error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

migrate();

