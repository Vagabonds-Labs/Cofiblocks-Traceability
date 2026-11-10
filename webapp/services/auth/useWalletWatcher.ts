'use client'

import { useEffect } from 'react'
import { walletService } from '@/services/wallet/walletService'

/**
 * Watches that the connected wallet is still the session's wallet.
 *
 * It only applies to extension wallets, where the user can switch accounts
 * without telling us. The Cavos wallet is tied to the Telegram or email
 * session and does not change on its own.
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
