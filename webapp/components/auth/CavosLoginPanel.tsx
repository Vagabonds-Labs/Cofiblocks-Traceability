'use client'

import { useTranslations } from 'next-intl'
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'

import { useCavosLogin } from '@/hooks/auth/useCavosLogin'

/**
 * Cavos login: a single button that opens its modal, with Telegram and email.
 *
 * What happens after authenticating (signing the nonce and registering the
 * session in our backend) is handled by `useCavosLogin`.
 */
export function CavosLoginPanel({ onLoggedIn }: { onLoggedIn: () => void }) {
  const t = useTranslations()
  const { start, isBusy, isRegistering, error } = useCavosLogin(onLoggedIn)
  const busy = isBusy || isRegistering

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="btn-primary flex w-full items-center justify-center gap-2 py-3"
      >
        <ChatBubbleLeftRightIcon className="h-5 w-5" aria-hidden="true" />
        {busy ? t('auth.preparing_account') : t('auth.cavos_continue')}
      </button>
      <p className="text-center text-xs text-[rgb(var(--cb-muted))]">{t('auth.cavos_hint')}</p>
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
