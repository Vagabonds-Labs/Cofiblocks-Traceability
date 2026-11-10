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
 * The layout no longer fetches configuration from the backend before rendering.
 *
 * It used to fetch the Cavos config with up to 5 retries and 3 to 7 second
 * waits, blocking the render. Connecting a wallet needs none of that: the
 * Stellar Wallets Kit is initialized on the client when needed.
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
