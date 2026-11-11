'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCavos } from '@cavos/kit/react'

import { normalizeEmailCode } from '@/lib/auth/cavos'
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

/** Cavos's own message when a device has to sign in again to be restored. */
const RESTORE_DEVICE_MESSAGE = 'Sign in again to restore this device.'

export type CavosLoginError = 'generic' | 'send_email' | 'code' | 'restore_device'

/**
 * Cavos login (Telegram or email).
 *
 * Cavos handles authentication and the wallet; our own screens
 * (`CavosLoginPanel`) call `loginWithTelegram`, `sendCode` and `verifyCode`.
 * When Cavos exposes the user's Stellar account (`G…`), this hook does the
 * rest, same as with an own wallet: it requests the nonce from the backend,
 * signs it with the Cavos wallet and calls `register_wallet`.
 *
 * Errors are returned as keys, not as Cavos's English messages, so the screen
 * shows them in the user's language.
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
    login,
    sendOtp,
    verifyOtp,
    signMessage,
    authorizeDevice,
    authorizingDevice,
    logout,
    authError,
    clearAuthError,
  } = useCavos()

  const [pending, setPending] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [error, setError] = useState<CavosLoginError | null>(null)
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
      setError('generic')
      finish()
      logout()
    },
    [finish, logout]
  )

  /** Marks a login as started, so the effect below registers the session. */
  const begin = useCallback(() => {
    setError(null)
    clearAuthError()
    writePending(true)
    setPending(true)
  }, [clearAuthError])

  /**
   * Telegram redirects out of the app. If Cavos already had the session (for
   * example, after signing out of our app only), no redirect is needed: the
   * effect below signs directly.
   */
  const loginWithTelegram = useCallback(async () => {
    begin()
    if (isAuthenticated) return
    try {
      await login('telegram')
    } catch (err) {
      fail(err)
    }
  }, [begin, isAuthenticated, login, fail])

  /** Emails a sign-in code. Returns whether it was sent. */
  const sendCode = useCallback(
    async (email: string): Promise<boolean> => {
      setError(null)
      clearAuthError()
      try {
        await sendOtp(email)
        return true
      } catch (err) {
        console.error('Cavos could not send the code', err)
        setError('send_email')
        return false
      }
    },
    [sendOtp, clearAuthError]
  )

  /** Checks the emailed code; on success the effect below finishes the login. */
  const verifyCode = useCallback(
    async (email: string, code: string): Promise<boolean> => {
      begin()
      try {
        await verifyOtp(email, normalizeEmailCode(code))
        return true
      } catch (err) {
        console.error('Cavos rejected the code', err)
        finish()
        setError('code')
        return false
      }
    },
    [begin, verifyOtp, finish]
  )

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
        onLoggedIn()
      } catch (err) {
        fail(err)
      } finally {
        registering.current = false
      }
    },
    [signMessage, finish, onLoggedIn, fail]
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

  const cavosError: CavosLoginError | null = authError
    ? authError === RESTORE_DEVICE_MESSAGE
      ? 'restore_device'
      : 'generic'
    : null

  return {
    loginWithTelegram,
    sendCode,
    verifyCode,
    /** A login is in progress after authenticating (Telegram return, device, backend). */
    isBusy: pending && (isAuthenticated || walletStatus.isDeploying),
    isRegistering,
    error: error ?? cavosError,
  }
}
