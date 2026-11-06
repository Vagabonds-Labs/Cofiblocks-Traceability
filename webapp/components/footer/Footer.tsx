'use client'

import { useTranslations } from 'next-intl'

export function Footer() {
  const t = useTranslations()

  return (
    <footer className="border-t border-[#dfe4d8] bg-[#eaf0e5] text-[#53634f]">
      <div className="app-container py-10">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[2fr_1fr_1fr]">
          <div>
            <p className="text-sm font-bold tracking-[0.14em] text-[#284e3b]">COFIBLOCKS TRACEABILITY</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed">{t('footer.description')}</p>
          </div>
          <div>
            <h2 className="mb-3 text-sm font-semibold text-[#284e3b]">{t('footer.links')}</h2>
            <a
              href="https://cofiblocks.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline-offset-4 hover:underline"
            >
              {t('footer.about')}
            </a>
          </div>
          <div>
            <h2 className="mb-3 text-sm font-semibold text-[#284e3b]">{t('footer.contact')}</h2>
            <a href="mailto:info@cofiblocks.com" className="text-sm underline-offset-4 hover:underline">
              info@cofiblocks.com
            </a>
          </div>
        </div>
        <p className="mt-8 border-t border-[#d5dfcf] pt-5 text-xs">
          {t('footer.trademark', { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  )
}
