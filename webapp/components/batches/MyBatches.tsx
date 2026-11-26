'use client'

import { ArrowRightIcon } from '@heroicons/react/24/outline'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import type { ApiError } from '@/lib/api'
import { batchesService } from '@/services/api/batches'
import type { Batch } from '@/types/traceability'

import { StageChip } from './StageChip'

const SHOWN = 8

/**
 * Industry Manager, Store Keeper and Export Manager: the batches their role
 * moves to the next stage now, oldest delivery first. Each opens the batch
 * page, where the stage is advanced and documents attached.
 */
export function MyBatches({
  refreshKey,
  onCountChange,
}: {
  refreshKey: number
  onCountChange?: (count: number | null) => void
}) {
  const t = useTranslations('batch')
  const tc = useTranslations('common')
  const locale = useLocale()
  const [batches, setBatches] = useState<Batch[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    batchesService
      .list({ forMe: true, limit: 100 })
      .then((page) => {
        if (!current) return
        setError(null)
        setTotal(page.total)
        onCountChange?.(page.total)
        setBatches([...page.batches].reverse().slice(0, SHOWN))
      })
      .catch((err: ApiError) => {
        if (!current) return
        setError(err.message)
        onCountChange?.(null)
      })
    return () => {
      current = false
    }
  }, [refreshKey, attempt, onCountChange])

  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
      new Date(iso)
    )

  return (
    <section
      className="surface-card p-5 sm:p-6"
      aria-labelledby="my-batches-title"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 id="my-batches-title" className="text-lg font-bold">
          {t('my_title')}
        </h2>
        {total > 0 && (
          <span className="chip chip-warm">
            {t('my_count', { count: total })}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-[#5a6760]">{t('my_subtitle')}</p>

      {error ? (
        <div className="mt-4" role="alert">
          <p className="text-sm text-red-800">{error}</p>
          <button
            type="button"
            className="btn-secondary mt-3 text-sm"
            onClick={() => setAttempt((a) => a + 1)}
          >
            {tc('retry')}
          </button>
        </div>
      ) : batches === null ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-2xl bg-[#eef1ee]"
            />
          ))}
        </div>
      ) : batches.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-[#f4f7f4] p-4 text-center text-sm text-[#5a6760]">
          {t('my_empty')}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {batches.map((batch) => (
            <li key={batch.id}>
              <Link
                href={`/${locale}/batches/${batch.id}`}
                className="flex flex-col gap-3 rounded-2xl border border-[#e3e8e4] bg-white p-4 transition hover:border-[rgb(var(--cb-primary))] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="break-words font-mono font-semibold">
                    {batch.number}
                  </p>
                  <p className="mt-1 text-sm text-[#5a6760]">
                    {batch.organization.code} · {batch.collectionCenter.name} ·{' '}
                    {date(batch.deliveredAt)}
                    {batch.weightKg != null && ` · ${batch.weightKg} kg`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StageChip stage={batch.stage} />
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-[rgb(var(--cb-primary))]">
                    {t('open')}
                    <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
