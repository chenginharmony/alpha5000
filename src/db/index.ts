import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export async function initDb() {
  await prisma.$connect();

  // Ensure settings row exists
  const settings = await prisma.settings.findFirst();
  if (!settings) {
    await prisma.settings.create({ data: {} });
  }

  console.log('✅ Database connected');
}
