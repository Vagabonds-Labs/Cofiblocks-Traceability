'use client'

import { useEffect } from 'react'
import { walletService } from '@/services/wallet/walletService'

/**
 * Vigila que la wallet conectada siga siendo la de la sesión.
 *
 * Sólo aplica a las wallets de extensión, donde el usuario puede cambiar de
 * cuenta sin avisarnos. La wallet de Cavos está atada a la sesión de Telegram
 * o email y no cambia sola.
 */
export function useWalletWatcher(user: any, logoutCallback: () => void) {
  useEffect(() => {
    if (!user?.walletAddress || user.walletProvider === 'cavos') return

    const interval = setInterval(async () => {
      const address = await walletService.trySilent()
      if (!address) return

      if (address !== user.walletAddress) {
        console.warn('WalletWatcher: Wallet mismatch')
        logoutCallback()
      }
    }, 30_000)

    return () => clearInterval(interval)
  }, [user, logoutCallback])
}
