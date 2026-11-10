import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import type { ReactNode } from 'react'

import { explorerUrl } from '@/utils/stellar'

/** Stellar Expert link, opens in a new tab. */
export function ExplorerLink({
  kind,
  id,
  children,
  className = '',
}: {
  kind: 'account' | 'tx' | 'contract'
  id: string
  children: ReactNode
  className?: string
}) {
  return (
    <a
      href={explorerUrl(kind, id)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 font-medium text-[rgb(var(--cb-primary))] underline-offset-4 hover:underline ${className}`}
    >
      {children}
      <ArrowTopRightOnSquareIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
    </a>
  )
}
