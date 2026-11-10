'use client'

import { useState, useEffect, useCallback } from 'react'

import { authService } from '@/services/auth'
import { walletService } from '@/services/wallet/walletService'

/**
 * Wallet-signature login.
 *
 * The flow changed from Starknet: there is no SNIP-12 typed data to sign and
 * no check against the user's account contract. Here the backend issues a
 * single-use nonce, the wallet signs the message in SEP-53 format and the
 * backend verifies it locally with the ed25519 public key.
 */
export function useWalletLogin() {
  const [address, setAddress] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isRegistered, setIsRegistered] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Silent reconnection if the user had already chosen a wallet.
  useEffect(() => {
    let cancelled = false

    walletService
      .trySilent()
      .then((connected) => {
        if (cancelled || !connected) return
        setAddress(connected)
        setIsRegistered(authService.isAuthenticated())
      })
      .catch((err) => console.error(err))

    return () => {
      cancelled = true
    }
  }, [])

  /** Opens the modal and returns the address, without asking for a signature. */
  const connectWalletWithoutSignature = useCallback(async () => {
    const connected = await walletService.connect()
    setAddress(connected)
    return connected
  }, [])

  const connectWallet = useCallback(async () => {
    setIsConnecting(true)
    setError(null)

    try {
      const connected = await walletService.connect()

      // The backend issues the nonce: an old signature cannot be reused.
      const { nonce, message } = await authService.requestNonce(connected)
      const signature = await walletService.signMessage(message, connected)

      await authService.registerWallet(connected, signature, nonce)

      setAddress(connected)
      setIsRegistered(true)
    } catch (err: any) {
      console.error('Wallet login failed', err)
      setError(err.message || 'Wallet login failed')
      await walletService.disconnect()
      setAddress(null)
      setIsRegistered(false)
    } finally {
      setIsConnecting(false)
    }
  }, [])

  const disconnectWallet = useCallback(async () => {
    await walletService.disconnect()
    setAddress(null)
    setIsRegistered(false)
  }, [])

  return {
    address,
    isRegistered,
    isConnecting,
    error,
    connectWalletWithoutSignature,
    connectWallet,
    disconnectWallet,
  }
}
