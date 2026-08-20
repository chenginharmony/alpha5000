const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrate() {
  console.log('🚀 Running AlphaPoints PostgreSQL Database Migration on Supabase...');

  // 1. Create UserPoints table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserPoints" (
      "id" TEXT NOT NULL,
      "userChatId" TEXT NOT NULL,
      "username" TEXT,
      "firstName" TEXT,
      "totalPoints" INTEGER NOT NULL DEFAULT 0,
      "currentStreak" INTEGER NOT NULL DEFAULT 0,
      "lastDailyClaim" TIMESTAMP(3),
      "totalTrades" INTEGER NOT NULL DEFAULT 0,
      "totalWins" INTEGER NOT NULL DEFAULT 0,
      "totalReferrals" INTEGER NOT NULL DEFAULT 0,
      "tier" TEXT NOT NULL DEFAULT 'Bronze',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT "UserPoints_pkey" PRIMARY KEY ("id")
    );
  `);

  // 2. Create PointsLedger table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PointsLedger" (
      "id" TEXT NOT NULL,
      "userChatId" TEXT NOT NULL,
      "amount" INTEGER NOT NULL,
      "action" TEXT NOT NULL,
      "description" TEXT,
      "metadata" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT "PointsLedger_pkey" PRIMARY KEY ("id")
    );
  `);

  // 3. Create Unique & Foreign Key Indexes
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "UserPoints_userChatId_key" ON "UserPoints"("userChatId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserPoints_totalPoints_idx" ON "UserPoints"("totalPoints");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PointsLedger_userChatId_idx" ON "PointsLedger"("userChatId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PointsLedger_createdAt_idx" ON "PointsLedger"("createdAt");
  `);

  // 4. Foreign Key Constraints
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'PointsLedger_userChatId_fkey'
        ) THEN
          ALTER TABLE "PointsLedger"
          ADD CONSTRAINT "PointsLedger_userChatId_fkey"
          FOREIGN KEY ("userChatId") REFERENCES "UserPoints"("userChatId")
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
  } catch (e) {
    console.log('FK check note:', e.message);
  }

  console.log('✅ AlphaPoints database tables and indexes created successfully!');
}

migrate()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
