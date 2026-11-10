import type { CavosConfig, CavosModalConfig } from '@cavos/kit/react'

/** App ID from the Cavos dashboard. Without it, the app offers wallet login only. */
export const CAVOS_APP_ID = process.env.NEXT_PUBLIC_CAVOS_APP_ID

export function isCavosEnabled(): boolean {
  return Boolean(CAVOS_APP_ID)
}

/**
 * Cavos configuration.
 *
 * `appSalt` names the place where each device stores its key. **It cannot
 * change** once there are users: if it does, every device generates a new key
 * and everyone is left waiting to approve their device.
 */
export const cavosConfig: CavosConfig = {
  appId: CAVOS_APP_ID,
  environment: process.env.NEXT_PUBLIC_CAVOS_ENVIRONMENT === 'development' ? 'development' : 'production',
  chains: ['stellar'],
  defaultChain: 'stellar',
  network: process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet',
  appSalt: 'cofiblocks-traceability',
}

/** Cavos login modal: Telegram first, because that is what the pilot uses. */
export const cavosModalConfig: CavosModalConfig = {
  appName: 'CofiBlocks Traceability',
  appLogo: '/images/logo.png',
  providers: ['telegram', 'email'],
  primaryColor: '#286b56',
  theme: 'light',
  radius: 12,
}
