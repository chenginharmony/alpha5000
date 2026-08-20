const { PrismaClient } = require('@prisma/client');
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const prisma = new PrismaClient();

async function testUserWallets() {
  console.log('🧪 Testing Multi-User Embedded Wallet System...\n');

  const testChatId = 'test_telegram_user_778899';

  // Cleanup test user
  await prisma.userWallet.deleteMany({ where: { userChatId: testChatId } });

  const {
    getOrCreateUserWallet,
    getUserWalletKeypair,
    getUserWalletInfo,
    exportPrivateKey,
    getSolPriceUsd,
  } = require('../dist/services/userWallet');

  console.log('1️⃣ Generating & Encrypting User Solana Wallet (AES-256-GCM)...');
  const walletResult = await getOrCreateUserWallet(testChatId);
  console.log(`✅ Generated Wallet Public Key: ${walletResult.publicKey} (isNew: ${walletResult.isNew})`);

  console.log('\n2️⃣ Verifying In-Memory Decryption & Keypair Integrity...');
  const keypair = await getUserWalletKeypair(testChatId);
  const decryptedPubKey = keypair.publicKey.toBase58();
  console.log(`✅ Decrypted Public Key: ${decryptedPubKey}`);

  if (decryptedPubKey !== walletResult.publicKey) {
    throw new Error('Public key mismatch after decryption!');
  }
  console.log('✅ AES-256-GCM Round-trip matches perfectly!');

  console.log('\n3️⃣ Fetching Live SOL Price & On-Chain Balance...');
  const solPrice = await getSolPriceUsd();
  console.log(`✅ Current SOL Price: $${solPrice.toFixed(2)} USD`);

  const walletInfo = await getUserWalletInfo(testChatId);
  console.log(`✅ Wallet Info:`);
  console.log(`   • Address: ${walletInfo.publicKey}`);
  console.log(`   • Balance: ${walletInfo.balanceSol.toFixed(4)} SOL ($${walletInfo.balanceUsd.toFixed(2)} USD)`);

  console.log('\n4️⃣ Testing Private Key Export (Self-Custody)...');
  const exportedKey = await exportPrivateKey(testChatId);
  console.log(`✅ Exported Private Key (Base58): ${exportedKey.slice(0, 10)}...${exportedKey.slice(-10)}`);

  // Verify exported key can be loaded into Solana Keypair
  const reimportedKeypair = Keypair.fromSecretKey(bs58.decode(exportedKey));
  if (reimportedKeypair.publicKey.toBase58() !== walletResult.publicKey) {
    throw new Error('Exported private key does not match public key!');
  }
  console.log(`✅ Reimported Keypair matches public key: ${reimportedKeypair.publicKey.toBase58()}`);

  // Cleanup
  await prisma.userWallet.deleteMany({ where: { userChatId: testChatId } });

  console.log('\n==================================================');
  console.log('✅ ALL USER WALLET TESTS PASSED PERFECTLY!');
  console.log('==================================================');
}

testUserWallets()
  .catch((e) => {
    console.error('❌ Test failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
