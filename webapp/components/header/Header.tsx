'use client'

import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import NextImage from 'next/image'
import { useEffect, useState } from 'react'

import { useUser } from '@/lib/providers/UserProvider'
import { UserMenu } from '../menu'
import { NotificationDropdown } from '../notifications'

const LANGUAGES = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'es', label: 'ES', name: 'Español' },
  { code: 'om', label: 'OM', name: 'Afaan Oromoo' },
  { code: 'am', label: 'AM', name: 'አማርኛ' },
] as const

const isSupported = (value: string | null): value is (typeof LANGUAGES)[number]['code'] =>
  LANGUAGES.some((language) => language.code === value)

export function Header() {
  const t = useTranslations()
  const locale = useLocale()
  const { user } = useUser()
  const [isScrolled, setIsScrolled] = useState(false)
  const [selectedLanguage, setSelectedLanguage] = useState<string>(locale || 'en')

  useEffect(() => {
    const updateScrollState = () => setIsScrolled(window.scrollY > 24)
    updateScrollState()
    window.addEventListener('scroll', updateScrollState, { passive: true })
    return () => window.removeEventListener('scroll', updateScrollState)
  }, [])

  useEffect(() => {
    let saved: string | null = null
    try {
      saved = localStorage.getItem('cofiblocks-language')
    } catch {
      // Without localStorage access, the route's language is used.
    }
    setSelectedLanguage(isSupported(saved) ? saved : locale || 'en')
  }, [locale])

  const changeLanguage = (lang: string) => {
    setSelectedLanguage(lang)
    try {
      localStorage.setItem('cofiblocks-language', lang)
    } catch {
      // The cookie is enough for the server to pick the language.
    }
    document.cookie = `cofiblocks-language=${lang}; path=/; max-age=31536000`
    window.location.reload()
  }

  const isLoggedIn = !!user

  return (
    <>
      <div role="note" className="bg-[#284e3b] text-white">
        <p className="app-container py-2.5 text-center text-xs leading-relaxed sm:text-sm">
          <span className="font-semibold">{t('header.demo_notice')}</span>{' '}
          <span className="text-[#e4eddf]">{t('header.full_version_soon')}</span>
        </p>
      </div>
      <header
        className={`sticky top-0 z-50 border-b text-[rgb(24,33,29)] backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-300 motion-reduce:transition-none ${
          isScrolled
            ? 'border-[#d8cfbd] bg-[#eee8dc] shadow-[0_4px_18px_rgba(36,60,46,0.08)]'
            : 'border-[#e7e4db] bg-white/80'
        }`}
      >
        <div className="app-container py-2">
          <div className="flex h-16 items-center justify-between gap-3">
            <Link href={`/${locale}`} className="flex min-w-0 items-center gap-2">
              <NextImage
                src="/images/logo.png"
                alt="CofiBlocks"
                width={40}
                height={64}
                className="h-auto w-10"
                priority
              />
              <span className="hidden text-sm font-semibold tracking-wide sm:inline">
                COFIBLOCKS <span className="font-normal text-[#5a6760]">TRACEABILITY</span>
              </span>
            </Link>

            <nav className="flex items-center gap-2 sm:gap-4">
              <select
                value={selectedLanguage}
                onChange={(e) => changeLanguage(e.target.value)}
                className="field-input max-w-[80px] cursor-pointer px-2.5 py-2 text-sm"
                aria-label={t('header.language_selector')}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code} title={lang.name} lang={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>

              {isLoggedIn && (
                <NotificationDropdown
                  isLoggedIn={isLoggedIn}
                  selectedLanguage={selectedLanguage}
                  textColor="rgb(24, 33, 29)"
                  progress={0}
                  bottom={248}
                />
              )}

              <UserMenu
                isLoggedIn={isLoggedIn}
                userName={user?.name || ''}
                walletAddress={user?.walletAddress || ''}
                isAdmin={user?.isAdmin || false}
              />
            </nav>
          </div>
        </div>
      </header>
    </>
  )
}
