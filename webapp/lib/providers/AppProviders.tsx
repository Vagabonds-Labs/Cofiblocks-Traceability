'use client'

import { ReactNode } from 'react'
import { CavosProvider } from '@cavos/kit/react'

import { UserProvider } from './UserProvider'
import { CavosBridge } from '@/components/auth/CavosBridge'
import { cavosConfig, isCavosEnabled } from '@/lib/auth/cavos'

/**
 * App providers.
 *
 * There are two ways to sign in: with Telegram or email through Cavos, which
 * creates a Stellar wallet for the user without seed phrases; or with the
 * user's own Stellar wallet (Stellar Wallets Kit, which needs no provider).
 * Without `NEXT_PUBLIC_CAVOS_APP_ID` only the second one remains.
 *
 * No `modal` is passed to `CavosProvider`: its modal is English only, so the
 * login screens are our own (`CavosLoginPanel`), translated with next-intl.
 * Without `modal`, Cavos never renders it, not even on the Telegram return.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const content = <UserProvider>{children}</UserProvider>
  if (!isCavosEnabled()) return content

  return (
    <CavosProvider config={cavosConfig}>
      <CavosBridge />
      {content}
    </CavosProvider>
  )
}
