'use client'

import { ChevronDownIcon, ClockIcon } from '@heroicons/react/24/outline'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { ApiError } from '@/lib/api'
import { deliveriesService } from '@/services/api/deliveries'
import type { Delivery, DeliveryStatus } from '@/types/traceability'

const POLL_MS = 10_000
const SHOWN = 8
const STATUS_STYLE: Record<DeliveryStatus, string> = {
  PENDING: 'chip-warm',
  CONFIRMED: 'bg-[#e6f2ea] text-[#14532d]',
  REJECTED: 'bg-red-50 text-red-800',
  CANCELLED: 'chip-neutral',
  EXPIRED: 'chip-neutral',
}
const inProgress = (delivery: Delivery) =>
  delivery.status === 'PENDING' ||
  (delivery.status === 'CONFIRMED' && !delivery.batch)

/** Farmer responses and recent history at the Collector's own center. */
export function RecordedDeliveries({
  collectionCenterId,
  refreshKey,
  onConfirmed,
}: {
  collectionCenterId: string | null
  refreshKey: number
  onConfirmed: () => void
}) {
  const t = useTranslations('deliveries')
  const tw = useTranslations('work')
  const tc = useTranslations('common')
  const locale = useLocale()
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [historyLimit, setHistoryLimit] = useState(SHOWN)
  const pendingIds = useRef<Set<string>>(new Set())
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const id = ++requestId.current
    if (!collectionCenterId) {
      setDeliveries([])
      return
    }
    try {
      const all = await deliveriesService.list()
      if (id !== requestId.current) return
      const list = all.filter(
        (delivery) => delivery.collectionCenter.id === collectionCenterId
      )
      setError(null)
      setDeliveries(list)
      const confirmedNow = list.some(
        (delivery) =>
          delivery.status === 'CONFIRMED' &&
          delivery.batch &&
          pendingIds.current.has(delivery.id)
      )
      pendingIds.current = new Set(
        list.filter(inProgress).map((delivery) => delivery.id)
      )
      if (confirmedNow) onConfirmed()
    } catch (err) {
      if (id === requestId.current) setError((err as ApiError).message)
    }
  }, [collectionCenterId, onConfirmed])

  useEffect(() => {
    void load()
    return () => {
      requestId.current++
    }
  }, [load, refreshKey])

  const waiting =
    deliveries?.filter((delivery) => delivery.status === 'PENDING') ?? []
  const processing =
    deliveries?.filter(
      (delivery) => delivery.status === 'CONFIRMED' && !delivery.batch
    ) ?? []
  const history = deliveries?.filter((delivery) => !inProgress(delivery)) ?? []
  const hasPending = waiting.length > 0 || processing.length > 0
  useEffect(() => {
    if (!hasPending) return
    const timer = setInterval(load, POLL_MS)
    return () => clearInterval(timer)
  }, [hasPending, load])

  const cancel = async (id: string) => {
    setCancelling(id)
    try {
      await deliveriesService.cancel(id)
      await load()
    } catch (err) {
      setError((err as ApiError).message)
    } finally {
      setCancelling(null)
    }
  }
  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  const row = (delivery: Delivery) => (
    <li
      key={delivery.id}
      className="flex flex-col gap-3 rounded-2xl border border-[#e3e8e4] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="break-words text-sm font-semibold">
          {delivery.farmerName || delivery.farmerRef} ·{' '}
          {t('kg', { kg: delivery.weightKg })}
        </p>
        <p className="mt-1 text-xs text-[#5a6760]">
          <span className="font-mono">{delivery.farmerRef}</span> ·{' '}
          {delivery.collectionCenter.name} · {time(delivery.deliveredAt)}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[#5a6760]">
          {delivery.status === 'PENDING'
            ? t('waiting_until', { time: time(delivery.expiresAt) })
            : delivery.status === 'CONFIRMED' && delivery.batch
              ? t('confirmed_batch', { batch: delivery.batch.number })
              : t(`status_hint.${delivery.status}`)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`chip ${STATUS_STYLE[delivery.status]}`}>
          {t(`status.${delivery.status}`)}
        </span>
        {delivery.status === 'PENDING' && (
          <button
            type="button"
            className="btn-secondary px-3 py-2 text-xs"
            onClick={() => {
              void cancel(delivery.id)
            }}
            disabled={cancelling === delivery.id}
          >
            {t('cancel')}
          </button>
        )}
      </div>
    </li>
  )

  return (
    <div className="space-y-5">
      <section
        className="surface-card p-5 sm:p-6"
        aria-labelledby="recorded-title"
      >
        <div className="flex flex-wrap items-center gap-2">
          <ClockIcon className="h-5 w-5 text-[#9a7c42]" aria-hidden="true" />
          <h2 id="recorded-title" className="text-lg font-bold">
            {tw('waiting_title')}
          </h2>
          {waiting.length > 0 && (
            <span className="chip chip-warm">{waiting.length}</span>
          )}
        </div>
        <p className="mt-1 text-sm text-[#5a6760]">{tw('waiting_hint')}</p>
        {error ? (
          <div role="alert" className="mt-4">
            <p className="text-sm text-red-800">{error}</p>
            <button
              type="button"
              className="btn-secondary mt-3 text-sm"
              onClick={() => {
                void load()
              }}
            >
              {tc('retry')}
            </button>
          </div>
        ) : deliveries === null ? (
          <div
            className="mt-4 h-16 rounded-2xl bg-[#eef1ee] motion-safe:animate-pulse"
            aria-busy="true"
            aria-label={tc('loading')}
          />
        ) : waiting.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-[#f7f8f2] p-4 text-sm text-[#68756a]">
            {tw('waiting_empty')}
          </p>
        ) : (
          <ul className="mt-4 space-y-3" aria-live="polite">
            {[...waiting].reverse().map(row)}
          </ul>
        )}
        {!error && processing.length > 0 && (
          <div className="mt-5 border-t border-[#e5ebe0] pt-4">
            <h3 className="text-sm font-semibold">{tw('processing_title')}</h3>
            <ul className="mt-3 space-y-3">{processing.map(row)}</ul>
          </div>
        )}
      </section>

      {!error && history.length > 0 && (
        <details className="group rounded-2xl border border-[#dfe5d8] bg-white/60 p-5">
          <summary className="flex min-h-6 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-[#53684b] [&::-webkit-details-marker]:hidden">
            <span>
              {tw('history_title')}{' '}
              <span className="ml-1 text-xs font-normal tabular-nums text-[#78816f]">
                ({history.length})
              </span>
            </span>
            <ChevronDownIcon
              className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </summary>
          <ul className="mt-4 space-y-3">
            {history.slice(0, historyLimit).map(row)}
          </ul>
          {history.length > historyLimit && (
            <button
              type="button"
              onClick={() => setHistoryLimit((limit) => limit + SHOWN)}
              className="btn-secondary mt-4 text-sm"
            >
              {tw('show_more')}
            </button>
          )}
        </details>
      )}
    </div>
  )
}
