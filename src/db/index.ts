import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export async function initDb(maxRetries = 5, delayMs = 2000) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      attempt++;
      await prisma.$connect();

      // Ensure settings row exists
      const settings = await prisma.settings.findFirst();
      if (!settings) {
        await prisma.settings.create({ data: {} });
      }

      console.log('✅ Database connected');
      return;
    } catch (e) {
      console.warn(`⚠️ Database connection attempt ${attempt}/${maxRetries} failed: ${(e as Error).message}`);
      if (attempt >= maxRetries) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
