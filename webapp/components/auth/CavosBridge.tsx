'use client'

import { useEffect } from 'react'
import { useCavos } from '@cavos/kit/react'

import { cavosSigner } from '@/services/wallet/cavosSigner'

/**
 * Expone la sesión de Cavos a `walletService`.
 *
 * No renderiza nada: cada vez que Cavos conecta o cierra la wallet de Stellar,
 * registra o borra el firmante en `cavosSigner`.
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
