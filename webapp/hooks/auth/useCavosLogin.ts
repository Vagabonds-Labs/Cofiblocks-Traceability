'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCavos } from '@cavos/kit/react'

import { authService } from '@/services/auth'

/**
 * Marca de "el usuario salió a loguearse". Telegram redirige fuera de la app y
 * la página se recarga al volver, así que el estado de React no alcanza para
 * saber que hay un login en curso.
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
    // Sin sessionStorage (modo privado estricto) sólo se pierde la vuelta de Telegram.
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
 * Login con Cavos (Telegram o email).
 *
 * Cavos se ocupa de autenticar y de la wallet: muestra su modal, y al terminar
 * expone la cuenta Stellar (`G…`) del usuario. Este hook hace lo que sigue,
 * igual que con una wallet propia: pide el nonce al backend, lo firma con la
 * wallet de Cavos y llama a `register_wallet`.
 *
 * La firma de Cavos no es SEP-53 y la hace la "control key" del dispositivo,
 * que puede no ser la cuenta: por eso viaja también `signer` y el backend la
 * verifica distinto (`provider: 'cavos'`).
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

  // Vuelta del redirect de Telegram.
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
    // Si Cavos ya tenía la sesión (por ejemplo, después de salir sólo de
    // nuestra app), no hace falta el modal: el efecto de abajo firma directo.
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

    // Un dispositivo que todavía no firma por esta cuenta se autoriza primero;
    // Cavos muestra lo que haga falta. Cuando termina, el estado cambia y este
    // efecto vuelve a correr.
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
