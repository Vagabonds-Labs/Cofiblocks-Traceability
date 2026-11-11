'use client'

import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { useTranslations } from 'next-intl'

import { ExplorerLink } from '@/components/trace'
import { useWallet } from '@/hooks/wallet/useWallet'
import { shortAddress } from '@/utils/stellar'

/** Formats an XLM balance with at most 2 decimals, e.g. `10,000.5`. */
function formatXlm(balance: string, locale?: string): string {
  return Number(balance).toLocaleString(locale, { maximumFractionDigits: 2 })
}

/**
 * The user's Stellar account: address, testnet XLM balance and the funding
 * transaction. On first use it also creates and funds the account.
 */
export function WalletCard({ address, className = '' }: { address: string; className?: string }) {
  const t = useTranslations('wallet')
  const { wallet, state, retry } = useWallet()

  return (
    <div className={className}>
      <p className="text-sm text-[#5a6760]">{t('label')}</p>
      <p className="mt-1 break-all font-mono text-sm" title={address}>
        {shortAddress(address)}
      </p>

      <div className="mt-3 text-sm" aria-live="polite">
        {state === 'loading' && <p className="text-[#5a6760]">{t('loading')}</p>}
        {state === 'setting_up' && (
          <p className="flex items-center gap-2 text-[#5a6760]">
            <ArrowPathIcon className="h-4 w-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
            {t('setting_up')}
          </p>
        )}
        {state === 'error' && (
          <p role="alert" className="text-red-700">
            {t('setup_error')}{' '}
            <button type="button" onClick={() => void retry()} className="font-medium underline underline-offset-4">
              {t('retry')}
            </button>
          </p>
        )}
        {state === 'ready' && wallet?.balance_xlm !== null && wallet?.balance_xlm !== undefined && (
          <p>
            <span className="text-[#5a6760]">{t('balance')}</span>{' '}
            <span className="font-semibold">{formatXlm(wallet.balance_xlm)} XLM</span>
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-col items-start gap-1 text-sm">
        <ExplorerLink kind="account" id={address}>
          {t('view_account')}
        </ExplorerLink>
        {wallet?.fund_tx && (
          <ExplorerLink kind="tx" id={wallet.fund_tx}>
            {t('view_funding')}
          </ExplorerLink>
        )}
      </div>
    </div>
  )
}
