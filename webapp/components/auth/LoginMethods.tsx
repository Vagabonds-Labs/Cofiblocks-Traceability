'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { WalletIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'

import { LoginMethodsProps } from './types'
import { CavosLoginPanel } from './CavosLoginPanel'
import { isMobile } from '../../utils/platform'
import { isCavosEnabled } from '@/lib/auth/cavos'

/**
 * Formas de entrar.
 *
 * La app es para gente que no viene de web3, así que lo principal es entrar con
 * Telegram o email (Cavos). Conectar una wallet de Stellar sigue disponible,
 * como un link discreto al final: el modal lo abre el Stellar Wallets Kit
 * (Freighter, xBull, Albedo, Lobstr y Rabet).
 *
 * Sin `NEXT_PUBLIC_CAVOS_APP_ID` la wallet es la única opción y vuelve a ser el
 * botón principal.
 */
export function LoginMethods({
  walletError,
  isConnecting,
  onWallet,
  onEmailLoggedIn,
}: LoginMethodsProps) {
  const t = useTranslations()
  const [showMobileWalletWarning, setShowMobileWalletWarning] = useState(false)
  const cavos = isCavosEnabled()

  const handleWalletClick = () => {
    if (isMobile()) {
      setShowMobileWalletWarning(true)
    } else {
      onWallet?.()
    }
  }

  const handleWalletContinue = () => {
    setShowMobileWalletWarning(false)
    onWallet?.()
  }

  return (
    <div className="space-y-6">
      {cavos && <CavosLoginPanel onLoggedIn={onEmailLoggedIn} />}

      {walletError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {walletError}
        </div>
      )}

      {cavos ? (
        <div className="border-t border-gray-100 pt-5 text-center text-sm text-[rgb(var(--cb-muted))]">
          {t('auth.wallet_prompt')}{' '}
          <button
            onClick={handleWalletClick}
            disabled={isConnecting}
            className="inline-flex items-center gap-1 font-medium text-[rgb(var(--cb-primary))] hover:underline disabled:opacity-50"
          >
            <WalletIcon className="h-4 w-4" />
            {isConnecting ? t('auth.button_connecting') : t('auth.wallet_link')}
          </button>
        </div>
      ) : (
        <button
          onClick={handleWalletClick}
          disabled={isConnecting}
          className="btn-primary flex w-full items-center justify-center gap-2 py-3"
        >
          <WalletIcon className="h-5 w-5" />
          {isConnecting ? t('auth.button_connecting') : t('auth.button_connect_wallet')}
        </button>
      )}

      {/* Mobile wallet warning modal */}
      {showMobileWalletWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-gray-700 text-sm">
                {t('auth.wallet_mobile_warning')}
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowMobileWalletWarning(false)}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 font-medium text-gray-700 hover:bg-gray-50"
              >
                {t('auth.wallet_mobile_cancel')}
              </button>
              <button
                type="button"
                onClick={handleWalletContinue}
                className="btn-primary flex-1"
              >
                {t('auth.wallet_mobile_continue')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
