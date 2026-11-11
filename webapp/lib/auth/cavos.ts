import type { CavosConfig } from '@cavos/kit/react'

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

/**
 * Length of the sign-in code Cavos emails. The kit does not export it from its
 * public entry points; it is `EMAIL_CODE_LENGTH` in `@cavos/kit` 0.5.2.
 */
export const CAVOS_EMAIL_CODE_LENGTH = 9

/** Same normalization Cavos applies to a typed code (lower case, no spaces or dashes). */
export function normalizeEmailCode(raw: string): string {
  return raw.toLowerCase().replace(/[\s-]/g, '')
}
