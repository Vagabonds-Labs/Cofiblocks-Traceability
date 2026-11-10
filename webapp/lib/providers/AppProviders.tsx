'use client'

import { ReactNode } from 'react'
import { CavosProvider } from '@cavos/kit/react'

import { UserProvider } from './UserProvider'
import { CavosBridge } from '@/components/auth/CavosBridge'
import { cavosConfig, cavosModalConfig, isCavosEnabled } from '@/lib/auth/cavos'

/**
 * Proveedores de la app.
 *
 * Hay dos formas de entrar: con Telegram o email, a través de Cavos, que le
 * crea al usuario una wallet de Stellar sin frases semilla; o con una wallet de
 * Stellar propia (Stellar Wallets Kit, que no necesita provider). Sin
 * `NEXT_PUBLIC_CAVOS_APP_ID` queda sólo la segunda.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const content = <UserProvider>{children}</UserProvider>
  if (!isCavosEnabled()) return content

  return (
    <CavosProvider config={cavosConfig} modal={cavosModalConfig}>
      <CavosBridge />
      {content}
    </CavosProvider>
  )
}
