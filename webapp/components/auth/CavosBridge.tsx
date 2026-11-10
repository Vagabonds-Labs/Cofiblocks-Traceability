'use client'

import { useEffect } from 'react'
import { useCavos } from '@cavos/kit/react'

import { cavosSigner } from '@/services/wallet/cavosSigner'

/**
 * Exposes the Cavos session to `walletService`.
 *
 * It renders nothing: every time Cavos connects or closes the Stellar wallet,
 * it registers or clears the signer in `cavosSigner`.
 */
export function CavosBridge() {
  const { wallet, address, logout } = useCavos()

  useEffect(() => {
    if (wallet?.chain === 'stellar' && address) {
      cavosSigner.register({
        address,
        signXdr: (xdr) => wallet.signXdr(xdr),
        logout,
      })
    } else {
      cavosSigner.clear()
    }
  }, [wallet, address, logout])

  return null
}
