'use client'

import { CheckCircleIcon, ChevronDownIcon, ShieldCheckIcon, UserIcon } from '@heroicons/react/24/outline'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'

import { useUser } from '@/lib/providers/UserProvider'
import { useProfileForm } from '@/hooks'
import { ProfileForm } from '@/components/profile'
import { ExportWalletKey } from '@/components/profile/ExportWalletKey'
import { LoginMethodsLinks } from '@/components/profile/LoginMethodsLinks'
import { ExplorerLink } from '@/components/trace'
import { PASSKEY_LOGIN_ENABLED, SOCIAL_LOGIN_ENABLED } from '@/lib/auth/loginMethods'
import { isPrivyEnabled } from '@/services/wallet/privySigner'
import { shortAddress } from '@/utils/stellar'

export default function ProfilePage() {
  const t = useTranslations()
  const locale = useLocale()
  const { user, loading, error: userError, refreshUser } = useUser()
  const form = useProfileForm(user, t, refreshUser)
  const isPrivy = user?.walletProvider === 'privy'
  const error = userError || form.error
  const initials = user?.name
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  if (loading && !user)
    return (
      <main className="app-page app-container py-10" aria-busy="true" aria-label={t('profile.loading')}>
        <div className="h-28 rounded-2xl bg-white/70 motion-safe:animate-pulse" />
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="h-64 rounded-3xl bg-white/70 motion-safe:animate-pulse" />
          <div className="h-64 rounded-3xl bg-white/70 motion-safe:animate-pulse" />
        </div>
      </main>
    )

  if (!user)
    return (
      <main className="app-page app-container py-16">
        <div className="surface-card mx-auto max-w-md p-8 text-center">
          <UserIcon className="mx-auto mb-4 h-10 w-10 text-surface-primary-default" />
          <h1 className="text-2xl font-bold">{t('profile.title')}</h1>
          <p className="my-4 text-sm text-gray-600" role={error ? 'alert' : undefined}>
            {error || t('profile.error_not_authenticated')}
          </p>
          <Link href={`/${locale}/login`} className="btn-primary inline-flex">
            {t('profile.dashboard.login')}
          </Link>
        </div>
      </main>
    )

  return (
    <main className="app-page app-container py-8 sm:py-12">
      <header className="mb-8 flex min-w-0 items-center gap-4 sm:gap-5">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white bg-[#e3ece5] text-xl font-bold text-[#286b56] sm:h-20 sm:w-20 sm:text-2xl"
          aria-hidden="true"
        >
          {initials || <UserIcon className="h-8 w-8" />}
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#66756b]">
            {t('profile.dashboard.eyebrow')}
          </p>
          <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
            {user.name ? t('profile.dashboard.greeting', { name: user.name }) : t('profile.title')}
          </h1>
          <p className="mt-2 text-sm text-[#5a6760]">
            {user.role ? t(`roles.${user.role}`) : t('roles.none')}
            {user.organization ? ` · ${user.organization.name}` : ''}
          </p>
        </div>
      </header>

      {form.success && (
        <div
          role="status"
          className="mb-6 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          <CheckCircleIcon className="h-5 w-5 shrink-0" />
          {t('profile.success_message')}
        </div>
      )}
      {error && (
        <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-8">
        <ProfileForm form={form} t={t} />

        <section className="surface-card p-5 sm:p-6" aria-labelledby="account-access-title">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheckIcon className="h-5 w-5 text-[#286b56]" aria-hidden="true" />
            <h2 id="account-access-title" className="text-lg font-bold">
              {t('profile.dashboard.access_title')}
            </h2>
          </div>
          {user.walletAddress && (
            <div className="mb-4 rounded-xl bg-[#f3f6f3] p-4">
              <p className="text-sm text-[#5a6760]">{t('home.wallet_label')}</p>
              <p className="mt-1 font-mono text-sm" title={user.walletAddress}>
                {shortAddress(user.walletAddress)}
              </p>
              <ExplorerLink kind="account" id={user.walletAddress} className="mt-2 text-sm">
                {t('home.view_on_explorer')}
              </ExplorerLink>
            </div>
          )}
          <p className="text-sm leading-relaxed text-[#5a6760]">
            {t(isPrivy ? 'profile.dashboard.access_simple' : 'profile.dashboard.access_wallet')}
          </p>
          {isPrivyEnabled() && isPrivy && (SOCIAL_LOGIN_ENABLED || PASSKEY_LOGIN_ENABLED) && (
            <LoginMethodsLinks t={t} />
          )}
          {isPrivyEnabled() && isPrivy && user.walletAddress && (
            <details className="group mt-5 border-t border-[#e5ebe6] pt-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-1 text-sm font-medium text-[#5a6760] [&::-webkit-details-marker]:hidden">
                {t('profile.dashboard.advanced_options')}
                <ChevronDownIcon className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <ExportWalletKey walletAddress={user.walletAddress} t={t} />
            </details>
          )}
        </section>
      </div>
    </main>
  )
}
