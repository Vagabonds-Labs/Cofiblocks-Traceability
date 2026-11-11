'use client'

import { useCallback, useEffect, useState } from 'react'

import { useUser } from '@/lib/providers/UserProvider'
import { walletService, type WalletInfo } from '@/services/api/wallet'
import { cavosSigner } from '@/services/wallet/cavosSigner'

export type WalletState = 'loading' | 'setting_up' | 'ready' | 'error'

/** Own wallets are created by Friendbot right after login; wait for it a bit. */
const FRIENDBOT_RETRIES = 5
const RETRY_DELAY_MS = 3000

/**
 * One setup at a time per page load, even if several components use the hook.
 */
let setupInFlight: Promise<void> | null = null

/**
 * Creates and funds the user's account on first use (SOW deliverable 1:
 * "a Stellar address created and funded automatically").
 *
 * - Cavos wallets: Cavos creates the account (see `cavosSigner.ensureDeployed`),
 *   then our faucet sends testnet XLM.
 * - Own wallets: the backend creates them with Friendbot at login; this only
 *   waits for it to land.
 */
async function setUpAccount(walletProvider: string | null | undefined): Promise<void> {
  let wallet = await walletService.get()
  if (wallet.funded_at) return

  if (walletProvider === 'cavos') {
    if (!wallet.exists) {
      const faucet = await walletService.faucetAddress()
      if (!faucet) throw new Error('The faucet is not configured')
      await cavosSigner.ensureDeployed(wallet.address, faucet)
    }
    await walletService.fund()
    return
  }

  for (let attempt = 0; attempt < FRIENDBOT_RETRIES && !wallet.funded_at; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    wallet = await walletService.get()
  }
}

/** The user's Stellar account: balance, funding and its first-use setup. */
export function useWallet() {
  const { user } = useUser()
  const [wallet, setWallet] = useState<WalletInfo | null>(null)
  const [state, setState] = useState<WalletState>('loading')

  const load = useCallback(async () => {
    if (!user?.walletAddress) return
    setState('loading')
    try {
      const current = await walletService.get()
      setWallet(current)
      if (current.exists && current.funded_at) {
        setState('ready')
        return
      }
      setState('setting_up')
      setupInFlight ??= setUpAccount(user.walletProvider).finally(() => {
        setupInFlight = null
      })
      await setupInFlight
      const updated = await walletService.get()
      setWallet(updated)
      // Only a funded account is ready. If setup ran out of attempts (e.g.
      // Friendbot is slow), show the error with a retry instead.
      setState(updated.exists && updated.funded_at ? 'ready' : 'error')
    } catch (error) {
      console.error('Wallet setup failed:', error)
      setState('error')
    }
  }, [user?.walletAddress, user?.walletProvider])

  useEffect(() => {
    void load()
  }, [load])

  return { wallet, state, retry: load }
}
