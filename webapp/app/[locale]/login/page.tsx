'use client'

import { useRouter, useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CheckBadgeIcon, LockClosedIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'

import { LoginMethods } from '@/components/auth/LoginMethods'
import { useWalletLogin } from '@/hooks'
import { isPrivyEnabled } from '@/services/wallet/privySigner'

export default function LoginPage() {
  const t = useTranslations()
  const router = useRouter()
  const { locale } = useParams()

  const wallet = useWalletLogin()
  const [emailLoggedIn, setEmailLoggedIn] = useState(false)
  const onEmailLoggedIn = useCallback(() => setEmailLoggedIn(true), [])
  const privy = isPrivyEnabled()

  // Una vez dentro, a la página de inicio, que muestra lo que corresponde al rol.
  useEffect(() => {
    if (!((wallet.address && wallet.isRegistered) || emailLoggedIn)) return
    router.push(`/${locale}`)
  }, [wallet.address, wallet.isRegistered, emailLoggedIn, router, locale])

  const points = [
    { icon: ShieldCheckIcon, text: t('auth.brand_point_1') },
    { icon: CheckBadgeIcon, text: t('auth.brand_point_2') },
    { icon: LockClosedIcon, text: t('auth.brand_point_3') },
  ]

  return (
    <main className="app-page app-container flex min-h-[calc(100vh-160px)] items-center py-8 md:py-12">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_20px_60px_rgba(22,40,30,0.12)] lg:grid-cols-2">
        {/* Panel de marca: sólo en pantallas grandes. En el celular sobra. */}
        <section className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(150deg,rgb(40,107,86)_0%,rgb(25,82,64)_60%,rgb(18,58,46)_100%)] p-10 text-white lg:flex">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[rgb(227,153,60)]/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

          <div className="relative flex items-center gap-3">
            <img src="/images/logo.png" alt="CofiBlocks" className="h-10 w-10 rounded-xl bg-white/90 p-1" />
            <span className="text-lg font-semibold">CofiBlocks Traceability</span>
          </div>

          <div className="relative">
            <h2 className="text-3xl font-bold leading-tight">{t('auth.brand_title')}</h2>
            <ul className="mt-8 space-y-4">
              {points.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/15">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="pt-1.5 text-white/90">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="relative text-xs text-white/60">{t('auth.brand_footer')}</p>
        </section>

        {/* Formulario */}
        <section className="p-6 sm:p-10">
          <h1 className="text-3xl font-bold text-[rgb(var(--cb-text))]">
            {privy ? t('auth.login_title') : t('auth.title_sign_in')}
          </h1>
          <p className="mb-8 mt-2 text-[rgb(var(--cb-muted))]">
            {privy ? t('auth.login_subtitle') : t('auth.subtitle_login_wallet_only')}
          </p>

          <LoginMethods
            walletError={wallet.error}
            isConnecting={wallet.isConnecting}
            onWallet={wallet.connectWallet}
            onEmailLoggedIn={onEmailLoggedIn}
          />
        </section>
      </div>
    </main>
  )
}
