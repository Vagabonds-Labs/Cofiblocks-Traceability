'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowLeftIcon, EnvelopeIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'

import { useCavosLogin } from '@/hooks/auth/useCavosLogin'
import { CAVOS_EMAIL_CODE_LENGTH, normalizeEmailCode } from '@/lib/auth/cavos'

type Screen = 'choose' | 'email' | 'code'

/** Seconds before a new code can be requested, as in Cavos's own modal. */
const RESEND_SECONDS = 60

/**
 * Cavos login screens: Telegram or email with a one-time code.
 *
 * These replace Cavos's modal, which only exists in English, so the whole
 * login follows the app's language. Cavos still does the authentication and
 * creates the wallet; what happens afterwards (signing the nonce and
 * registering the session in our backend) is handled by `useCavosLogin`.
 */
export function CavosLoginPanel({ onLoggedIn }: { onLoggedIn: () => void }) {
  const t = useTranslations('auth')
  const { loginWithTelegram, sendCode, verifyCode, isBusy, isRegistering, error } = useCavosLogin(onLoggedIn)

  const [screen, setScreen] = useState<Screen>('choose')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  const settingUp = isBusy || isRegistering
  const disabled = settingUp || submitting

  const onTelegram = async () => {
    setSubmitting(true)
    await loginWithTelegram()
    // On success the page navigates to Telegram; this only runs if it did not.
    setSubmitting(false)
  }

  const onSendCode = async (e?: FormEvent) => {
    e?.preventDefault()
    const address = email.trim()
    if (!address) return
    setSubmitting(true)
    const sent = await sendCode(address)
    setSubmitting(false)
    if (sent) {
      setCode('')
      setScreen('code')
      setResendIn(RESEND_SECONDS)
    }
  }

  const onVerify = async (e: FormEvent) => {
    e.preventDefault()
    if (normalizeEmailCode(code).length !== CAVOS_EMAIL_CODE_LENGTH) return
    setSubmitting(true)
    await verifyCode(email.trim(), code)
    setSubmitting(false)
  }

  const errorText = error ? t(`error_${error}`) : null

  if (settingUp) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-center gap-3 rounded-xl border border-gray-200 p-4 text-[rgb(var(--cb-text))]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-[rgb(40,107,86)]" />
          {t('preparing_account')}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {screen === 'choose' && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={onTelegram}
            disabled={disabled}
            className="btn-primary flex w-full items-center justify-center gap-2 py-3"
          >
            <PaperAirplaneIcon className="h-5 w-5 -rotate-45" aria-hidden="true" />
            {t('cavos_telegram')}
          </button>
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-[rgb(var(--cb-muted))]">
            <span className="h-px flex-1 bg-gray-200" />
            {t('cavos_or')}
            <span className="h-px flex-1 bg-gray-200" />
          </div>
          <button
            type="button"
            onClick={() => setScreen('email')}
            disabled={disabled}
            className="btn-secondary flex w-full items-center justify-center gap-2 py-3"
          >
            <EnvelopeIcon className="h-5 w-5" aria-hidden="true" />
            {t('cavos_email')}
          </button>
          <p className="text-center text-xs text-[rgb(var(--cb-muted))]">{t('cavos_hint')}</p>
        </div>
      )}

      {screen === 'email' && (
        <form onSubmit={onSendCode} className="space-y-3">
          <BackButton label={t('cavos_back')} onClick={() => setScreen('choose')} />
          <div>
            <h2 className="font-semibold text-[rgb(var(--cb-text))]">{t('email_title')}</h2>
            <p className="mt-1 text-sm text-[rgb(var(--cb-muted))]">{t('email_subtitle')}</p>
          </div>
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('email_placeholder')}
            aria-label={t('email_placeholder')}
            className="field-input w-full"
          />
          <button type="submit" disabled={disabled || !email.trim()} className="btn-primary w-full py-3">
            {submitting ? t('email_sending') : t('email_send_code')}
          </button>
        </form>
      )}

      {screen === 'code' && (
        <form onSubmit={onVerify} className="space-y-3">
          <BackButton label={t('cavos_back')} onClick={() => setScreen('email')} />
          <div>
            <h2 className="font-semibold text-[rgb(var(--cb-text))]">{t('code_title')}</h2>
            <p className="mt-1 text-sm text-[rgb(var(--cb-muted))]">
              {t('code_subtitle', { length: CAVOS_EMAIL_CODE_LENGTH, email: email.trim() })}
            </p>
          </div>
          <input
            type="text"
            required
            autoFocus
            inputMode="text"
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={CAVOS_EMAIL_CODE_LENGTH + 4}
            aria-label={t('code_title')}
            className="field-input w-full text-center font-mono text-lg tracking-[0.3em]"
          />
          <button
            type="submit"
            disabled={disabled || normalizeEmailCode(code).length !== CAVOS_EMAIL_CODE_LENGTH}
            className="btn-primary w-full py-3"
          >
            {submitting ? t('code_verifying') : t('code_verify')}
          </button>
          <div className="flex justify-between text-sm">
            <button
              type="button"
              onClick={() => onSendCode()}
              disabled={disabled || resendIn > 0}
              className="text-[rgb(40,107,86)] hover:underline disabled:text-[rgb(var(--cb-muted))] disabled:no-underline"
            >
              {resendIn > 0 ? t('code_resend_in', { seconds: resendIn }) : t('code_resend')}
            </button>
            <button
              type="button"
              onClick={() => setScreen('email')}
              disabled={disabled}
              className="text-[rgb(var(--cb-muted))] hover:underline"
            >
              {t('code_other_email')}
            </button>
          </div>
        </form>
      )}

      {errorText && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorText}
        </p>
      )}

      <p className="text-center text-xs text-[rgb(var(--cb-muted))]">
        {t.rich('cavos_terms', {
          privacy: (chunks) => (
            <a href="https://cavos.xyz/user-privacy" target="_blank" rel="noopener noreferrer" className="underline">
              {chunks}
            </a>
          ),
          terms: (chunks) => (
            <a href="https://cavos.xyz/user-terms" target="_blank" rel="noopener noreferrer" className="underline">
              {chunks}
            </a>
          ),
        })}
      </p>
    </div>
  )
}

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-sm text-[rgb(var(--cb-muted))] hover:text-[rgb(var(--cb-text))]"
    >
      <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  )
}
