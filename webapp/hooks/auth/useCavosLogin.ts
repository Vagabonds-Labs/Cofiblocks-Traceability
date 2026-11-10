'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCavos } from '@cavos/kit/react'

import { authService } from '@/services/auth'

/**
 * Flag for "the user left to sign in". Telegram redirects out of the app and
 * the page reloads on return, so React state is not enough to know a login is
 * in progress.
 */
const PENDING_KEY = 'cofiblocks:cavos-login-pending'

function readPending(): boolean {
  try {
    return window.sessionStorage.getItem(PENDING_KEY) === '1'
  } catch {
    return false
  }
}

function writePending(value: boolean): void {
  try {
    if (value) window.sessionStorage.setItem(PENDING_KEY, '1')
    else window.sessionStorage.removeItem(PENDING_KEY)
  } catch {
    // Without sessionStorage (strict private mode) only the Telegram return is lost.
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

/**
 * Cavos login (Telegram or email).
 *
 * Cavos handles authentication and the wallet: it shows its modal, and when it
 * finishes it exposes the user's Stellar account (`G…`). This hook does the
 * rest, same as with an own wallet: it requests the nonce from the backend,
 * signs it with the Cavos wallet and calls `register_wallet`.
 *
 * The Cavos signature is not SEP-53 and is made by the device's "control key",
 * which may not be the account: that is why `signer` is sent too and the
 * backend verifies it differently (`provider: 'cavos'`).
 */
export function useCavosLogin(onLoggedIn: () => void) {
  const {
    isAuthenticated,
    address,
    wallet,
    walletStatus,
    openModal,
    closeModal,
    signMessage,
    authorizeDevice,
    authorizingDevice,
    logout,
    authError,
    clearAuthError,
  } = useCavos()

  const [pending, setPending] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const registering = useRef(false)
  const authorizing = useRef(false)

  // Return from the Telegram redirect.
  useEffect(() => {
    if (readPending()) setPending(true)
  }, [])

  const finish = useCallback(() => {
    writePending(false)
    setPending(false)
    setIsRegistering(false)
  }, [])

  const fail = useCallback(
    (err: unknown) => {
      console.error('Cavos login failed', err)
      setError((err as Error)?.message || 'Login failed')
      finish()
      logout()
    },
    [finish, logout]
  )

  const start = useCallback(() => {
    setError(null)
    clearAuthError()
    writePending(true)
    setPending(true)
    // If Cavos already had the session (for example, after signing out of our
    // app only), the modal is not needed: the effect below signs directly.
    if (!isAuthenticated) openModal()
  }, [isAuthenticated, openModal, clearAuthError])

  const register = useCallback(
    async (account: string) => {
      if (registering.current) return
      registering.current = true
      setIsRegistering(true)
      try {
        const { nonce, message } = await authService.requestNonce(account)
        const { signature, publicKey } = await signMessage(message)
        await authService.registerWallet(account, bytesToBase64(signature), nonce, 'cavos', publicKey)
        finish()
        closeModal()
        onLoggedIn()
      } catch (err) {
        fail(err)
      } finally {
        registering.current = false
      }
    },
    [signMessage, finish, closeModal, onLoggedIn, fail]
  )

  useEffect(() => {
    if (!pending || !isAuthenticated || !address || wallet?.chain !== 'stellar') return

    // A device that does not sign for this account yet is authorized first;
    // Cavos shows whatever is needed. When it finishes, the state changes and
    // this effect runs again.
    if (walletStatus.needsDeviceApproval) {
      if (authorizing.current || authorizingDevice) return
      authorizing.current = true
      authorizeDevice()
        .catch(fail)
        .finally(() => {
          authorizing.current = false
        })
      return
    }

    if (walletStatus.isReady || walletStatus.isUndeployed) {
      void register(address)
    }
  }, [pending, isAuthenticated, address, wallet, walletStatus, authorizingDevice, authorizeDevice, register, fail])

  return {
    start,
    isBusy: pending && isAuthenticated,
    isRegistering,
    error: error ?? authError,
  }
}
