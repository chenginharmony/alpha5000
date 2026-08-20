const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Connecting to database...');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ReferralUser" (
      "id" TEXT NOT NULL,
      "userChatId" TEXT NOT NULL,
      "username" TEXT,
      "firstName" TEXT,
      "referredBy" TEXT,
      "totalVolumeUsd" DECIMAL(18,6) NOT NULL DEFAULT 0,
      "totalEarningsUsd" DECIMAL(18,6) NOT NULL DEFAULT 0,
      "unclaimedEarningsUsd" DECIMAL(18,6) NOT NULL DEFAULT 0,
      "payoutWallet" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ReferralUser_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ReferralUser_userChatId_key" ON "ReferralUser"("userChatId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReferralUser_referredBy_idx" ON "ReferralUser"("referredBy");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ReferralReward" (
      "id" TEXT NOT NULL,
      "referrerChatId" TEXT NOT NULL,
      "referredChatId" TEXT NOT NULL,
      "tradeId" TEXT,
      "tradeVolumeUsd" DECIMAL(18,6) NOT NULL,
      "feeAmountUsd" DECIMAL(18,6) NOT NULL,
      "rewardAmountUsd" DECIMAL(18,6) NOT NULL,
      "rewardPercent" DECIMAL(5,2) NOT NULL DEFAULT 20.00,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReferralReward_referrerChatId_idx" ON "ReferralReward"("referrerChatId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReferralReward_referredChatId_idx" ON "ReferralReward"("referredChatId");
  `);

  console.log('✅ ReferralUser & ReferralReward tables created successfully in Supabase PostgreSQL!');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
