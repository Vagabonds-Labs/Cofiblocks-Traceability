'use client'

import { PlusIcon } from '@heroicons/react/24/outline'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

import { organizationsService } from '@/services/api/organizations'
import type { User } from '@/services/auth/types'
import type { CollectionCenter } from '@/types/traceability'

import { DeliveryDialog } from './DeliveryDialog'
import { PendingDeliveries } from './PendingDeliveries'
import { RecordedDeliveries } from './RecordedDeliveries'

/** The Collector's actions, independent of the pilot overview and its filters. */
export function CollectorWork({
  user,
  refreshKey,
  onChanged,
  onCountChange,
}: {
  user: User
  refreshKey: number
  onChanged: () => void
  onCountChange: (count: number | null) => void
}) {
  const t = useTranslations('work')
  const td = useTranslations('deliveries')
  const tc = useTranslations('common')
  const [centers, setCenters] = useState<CollectionCenter[]>([])
  const [loadingCenters, setLoadingCenters] = useState(true)
  const [centersError, setCentersError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    let current = true
    setLoadingCenters(true)
    setCentersError(false)
    organizationsService
      .list()
      .then((organizations) => {
        if (!current) return
        const available =
          organizations.find((org) => org.id === user.organizationId)
            ?.collectionCenters ?? []
        // An assigned Collector works at their own center.
        setCenters(
          user.collectionCenterId
            ? available.filter(
                (center) => center.id === user.collectionCenterId
              )
            : []
        )
      })
      .catch(() => {
        if (current) setCentersError(true)
      })
      .finally(() => {
        if (current) setLoadingCenters(false)
      })
    return () => {
      current = false
    }
  }, [user.organizationId, user.collectionCenterId, attempt])

  const onCreated = useCallback(() => onChanged(), [onChanged])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#dce5d2] bg-[#f1f5e9] p-5 sm:p-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#5e7651]">
            {t('your_center')}
          </p>
          <h2 className="mt-1 text-xl font-bold text-[#2d432e]">
            {user.collectionCenter?.name ?? t('center_unassigned')}
          </h2>
          <p className="mt-1 text-sm text-[#68756a]">
            {user.organization?.name}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRecording(true)}
          disabled={loadingCenters || centersError || centers.length === 0}
          className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 px-5 py-3 text-sm"
        >
          <PlusIcon className="h-5 w-5" aria-hidden="true" />
          {td('record')}
        </button>
        {centersError && (
          <p role="alert" className="w-full text-sm text-red-800">
            {t('centers_error')}{' '}
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="font-semibold underline"
            >
              {tc('retry')}
            </button>
          </p>
        )}
        {!loadingCenters && !centersError && centers.length === 0 && (
          <p role="status" className="w-full text-sm text-[#765824]">
            {t('center_unassigned_hint')}
          </p>
        )}
      </div>

      {user.collectionCenterId && (
        <PendingDeliveries
          collectionCenterId={user.collectionCenterId}
          refreshKey={refreshKey}
          onRecorded={onChanged}
          onCountChange={onCountChange}
        />
      )}
      <RecordedDeliveries
        collectionCenterId={user.collectionCenterId ?? null}
        refreshKey={refreshKey}
        onConfirmed={onChanged}
      />

      {recording && (
        <DeliveryDialog
          centers={centers}
          defaultCenterId={user.collectionCenterId ?? null}
          onClose={() => setRecording(false)}
          onCreated={onCreated}
        />
      )}
    </div>
  )
}
