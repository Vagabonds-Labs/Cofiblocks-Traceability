import type { CavosConfig, CavosModalConfig } from '@cavos/kit/react'

/** App ID del dashboard de Cavos. Sin él, la app ofrece sólo el login con wallet. */
export const CAVOS_APP_ID = process.env.NEXT_PUBLIC_CAVOS_APP_ID

export function isCavosEnabled(): boolean {
  return Boolean(CAVOS_APP_ID)
}

/**
 * Configuración de Cavos.
 *
 * `appSalt` nombra el lugar donde cada dispositivo guarda su clave. **No se
 * puede cambiar** una vez que haya usuarios: si cambia, cada dispositivo genera
 * una clave nueva y todos quedan esperando aprobar el dispositivo.
 */
export const cavosConfig: CavosConfig = {
  appId: CAVOS_APP_ID,
  environment: process.env.NEXT_PUBLIC_CAVOS_ENVIRONMENT === 'development' ? 'development' : 'production',
  chains: ['stellar'],
  defaultChain: 'stellar',
  network: process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet',
  appSalt: 'cofiblocks-traceability',
}

/** Modal de login de Cavos: Telegram primero, porque es lo que usan en el piloto. */
export const cavosModalConfig: CavosModalConfig = {
  appName: 'CofiBlocks Traceability',
  appLogo: '/images/logo.png',
  providers: ['telegram', 'email'],
  primaryColor: '#286b56',
  theme: 'light',
  radius: 12,
}
