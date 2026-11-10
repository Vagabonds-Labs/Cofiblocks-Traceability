// app/[locale]/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getLocale, getTranslations } from 'next-intl/server'

import { AppProviders } from '@/lib/providers/AppProviders'
import { Footer } from '@/components/footer/Footer'
import { Header } from '@/components/header/Header'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('home')
  return { title: t('meta_title'), description: t('meta_description') }
}

/**
 * El layout ya no busca configuración en el backend antes de renderizar.
 *
 * Antes tenía que traer la config de Cavos con hasta 5 reintentos y esperas de
 * 3 a 7 segundos, bloqueando el render. La conexión de wallet no necesita nada
 * de eso: el Stellar Wallets Kit se inicializa en el cliente cuando hace falta.
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&family=Noto+Sans+Ethiopic:wght@400..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex min-h-screen flex-col">
        <AppProviders>
          <NextIntlClientProvider messages={messages}>
            <Header />
            <div className="flex-1">{children}</div>
            <Footer />
          </NextIntlClientProvider>
        </AppProviders>
      </body>
    </html>
  )
}
