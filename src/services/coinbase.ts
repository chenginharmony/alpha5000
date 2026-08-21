import { config } from '../config';

export interface CoinbaseOnrampOptions {
  walletAddress: string;
  defaultNetwork?: string;
  defaultAsset?: string;
  presetFiatAmount?: number;
  fiatCurrency?: string;
}

/**
 * Generate a direct Coinbase Onramp URL prefilled with the user's Solana wallet address
 */
export function getCoinbaseOnrampUrl(options: CoinbaseOnrampOptions): string {
  const appId = config.COINBASE_PROJECT_ID || 'ba7c7fb8-d55e-4963-8905-62c43aef2697';
  const destinationWallets = JSON.stringify([
    {
      address: options.walletAddress,
      blockchains: ['solana'],
    },
  ]);

  const params = new URLSearchParams({
    appId,
    destinationWallets,
    defaultAsset: options.defaultAsset || 'SOL',
    defaultNetwork: options.defaultNetwork || 'solana',
    fiatCurrency: options.fiatCurrency || 'USD',
  });

  if (options.presetFiatAmount) {
    params.append('presetFiatAmount', String(options.presetFiatAmount));
  }

  return `https://pay.coinbase.com/buy/select-asset?${params.toString()}`;
}
