const { getCoinbaseOnrampUrl } = require('../dist/services/coinbase');

const testWallet = '54uXTNYGjG9NwbwPZ138JkHNx7Rk9qZk8FmX3w4N9Lwb';
const url = getCoinbaseOnrampUrl({ walletAddress: testWallet });

console.log('--- Coinbase Onramp URL Generated ---');
console.log('Wallet:', testWallet);
console.log('Onramp URL:\n', url);
