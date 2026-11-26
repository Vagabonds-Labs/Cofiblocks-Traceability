'use client'

import { ScaleIcon } from '@heroicons/react/24/outline'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { ApiError } from '@/lib/api'
import { batchesService } from '@/services/api/batches'
import type { Batch } from '@/types/traceability'

import { ReceptionDialog } from './ReceptionDialog'

/**
 * Collector: batches at their center that still need the weight and receipt
 * signed on chain, usually deliveries the farmer just confirmed in the bot.
 * The oldest first, since those have been waiting longest.
 */
export function PendingDeliveries({
  collectionCenterId,
  refreshKey,
  onRecorded,
  onCountChange,
}: {
  collectionCenterId: string | null
  refreshKey: number
  onRecorded: () => void
  onCountChange?: (count: number | null) => void
}) {
  const t = useTranslations('pending')
  const tc = useTranslations('common')
  const locale = useLocale()
  const [batches, setBatches] = useState<Batch[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [weighing, setWeighing] = useState<Batch | null>(null)
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const id = ++requestId.current
    setError(null)
    try {
      const page = await batchesService.list({
        stage: 'DELIVERED',
        collectionCenterId: collectionCenterId ?? undefined,
        limit: 100,
      })
      if (id !== requestId.current) return
      setBatches([...page.batches].reverse())
      onCountChange?.(page.total)
    } catch (err) {
      if (id !== requestId.current) return
      setError((err as ApiError).message)
      onCountChange?.(null)
    }
  }, [collectionCenterId, onCountChange])

  useEffect(() => {
    load()
    return () => {
      requestId.current++
    }
  }, [load, refreshKey])

  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))

  return (
    <section
      className="surface-card p-5 sm:p-6"
      aria-labelledby="pending-title"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pending-title" className="text-lg font-bold">
          {t('title')}
        </h2>
        {batches && batches.length > 0 && (
          <span className="chip chip-warm">
            {t('count', { count: batches.length })}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-[#5a6760]">{t('subtitle')}</p>

      {error ? (
        <div className="mt-4" role="alert">
          <p className="text-sm text-red-800">{error}</p>
          <button
            type="button"
            className="btn-secondary mt-3 text-sm"
            onClick={load}
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
          {t('empty')}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {batches.map((batch) => (
            <li
              key={batch.id}
              className="flex flex-col gap-3 rounded-2xl border border-[#e3e8e4] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="break-words font-mono text-sm font-semibold">
                  {batch.number}
                </p>
                <p className="mt-1 text-sm text-[#5a6760]">
                  {t('delivered', {
                    time: time(batch.deliveredAt),
                    center: batch.collectionCenter.name,
                  })}
                  {batch.confirmedKg != null
                    ? ` · ${t('confirmed', { kg: batch.confirmedKg })}`
                    : batch.estimatedKg != null &&
                      ` · ${t('estimated', { kg: batch.estimatedKg })}`}
                </p>
              </div>
              <button
                type="button"
                className="btn-primary inline-flex shrink-0 items-center justify-center gap-2 px-4 py-2.5"
                onClick={() => setWeighing(batch)}
              >
                <ScaleIcon className="h-5 w-5" aria-hidden="true" />
                {t(batch.confirmedKg != null ? 'finalize' : 'weigh')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {weighing && (
        <ReceptionDialog
          batch={weighing}
          onClose={() => setWeighing(null)}
          onRecorded={onRecorded}
        />
      )}
    </section>
  )
}
