const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrate() {
  console.log('🚀 Running UserWallet PostgreSQL Migration on Supabase...');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserWallet" (
      "id" TEXT NOT NULL,
      "userChatId" TEXT NOT NULL,
      "publicKey" TEXT NOT NULL,
      "encryptedPrivateKey" TEXT NOT NULL,
      "iv" TEXT NOT NULL,
      "authTag" TEXT NOT NULL,
      "lastBalanceSol" DECIMAL(18, 9) NOT NULL DEFAULT 0,
      "lastBalanceUsd" DECIMAL(18, 4) NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT "UserWallet_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "UserWallet_userChatId_key" ON "UserWallet"("userChatId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "UserWallet_publicKey_key" ON "UserWallet"("publicKey");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserWallet_publicKey_idx" ON "UserWallet"("publicKey");
  `);

  console.log('✅ UserWallet table & indexes created successfully on Supabase!');
}

migrate()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
