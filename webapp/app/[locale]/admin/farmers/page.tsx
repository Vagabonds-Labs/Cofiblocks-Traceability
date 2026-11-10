'use client'

import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useUser } from '@/lib/providers/UserProvider'
import type { ApiError } from '@/lib/api'
import { adminService, type FarmersPage } from '@/services/api/admin'
import { organizationsService } from '@/services/api/organizations'
import type { FarmerImportResult, FarmerStatus, Organization } from '@/types/traceability'

const STATUSES: FarmerStatus[] = ['PRELOADED', 'LINKED', 'REGISTERED', 'CONSENTED']

const STATUS_STYLES: Record<FarmerStatus, string> = {
  PRELOADED: 'bg-[#eef1ee] text-[#5a6760]',
  LINKED: 'bg-[#fff1d4] text-[#7a4f12]',
  REGISTERED: 'bg-[#e0eefa] text-[#164e63]',
  CONSENTED: 'bg-[#dcefe5] text-[#14532d]',
}

const TEMPLATE = 'coop_code,farmer_id,full_name,phone,collection_center\nKK,ID001,Full Name,+251900000000,Kirkir\n'

export default function AdminFarmersPage() {
  const t = useTranslations('admin_farmers')
  const tc = useTranslations('common')
  const { user: me } = useUser()

  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [page, setPage] = useState<FarmersPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [coopFilter, setCoopFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | FarmerStatus>('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [orgs, farmers] = await Promise.all([
        organizationsService.list(),
        adminService.listFarmers({
          organizationId: coopFilter || undefined,
          status: statusFilter || undefined,
          search: search.trim() || undefined,
          limit: 500,
        }),
      ])
      setOrganizations(orgs)
      setPage(farmers)
    } catch (error) {
      setLoadError((error as ApiError).message)
    } finally {
      setLoading(false)
    }
  }, [coopFilter, statusFilter, search])

  // Search goes to the backend: wait until the user stops typing.
  useEffect(() => {
    if (!me?.isAdmin) return
    const timer = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [me?.isAdmin, load, search])

  const cooperatives = organizations.filter((o) => o.kind === 'COOPERATIVE')
  const filtered = !!(coopFilter || statusFilter || search.trim())

  return (
    <main className="app-page app-container space-y-6 py-8 sm:py-12">
      <header>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-2 max-w-2xl text-[#5a6760]">{t('subtitle')}</p>
      </header>

      {page && (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {STATUSES.map((status) => (
            <li key={status} className="surface-card p-4">
              <p className="text-2xl font-bold">{page.statusCounts[status] ?? 0}</p>
              <p className="mt-1 text-sm text-[#5a6760]">{t(`status_${status}`)}</p>
            </li>
          ))}
        </ul>
      )}

      <ImportPanel onImported={load} />

      <section aria-labelledby="farmers-list-title" className="space-y-3">
        <h2 id="farmers-list-title" className="sr-only">
          {t('title')}
        </h2>
        <div className="flex flex-col gap-3 md:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">{t('search_placeholder')}</span>
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8a968f]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('search_placeholder')}
              className="field-input pl-10"
            />
          </label>
          <label className="md:w-64">
            <span className="sr-only">{t('filter_coop')}</span>
            <select value={coopFilter} onChange={(e) => setCoopFilter(e.target.value)} className="field-input">
              <option value="">{t('all_coops')}</option>
              {cooperatives.map((coop) => (
                <option key={coop.id} value={coop.id}>
                  {coop.name}
                </option>
              ))}
            </select>
          </label>
          <label className="md:w-56">
            <span className="sr-only">{t('filter_status')}</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | FarmerStatus)}
              className="field-input"
            >
              <option value="">{t('all_statuses')}</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`status_${status}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="surface-card overflow-x-auto">
          {loading && !page ? (
            <div className="space-y-3 p-6" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-[#eef1ee]" />
              ))}
            </div>
          ) : loadError ? (
            <div className="p-6 text-center" role="alert">
              <p className="text-red-800">{loadError}</p>
              <button type="button" className="btn-secondary mt-4" onClick={load}>
                {tc('retry')}
              </button>
            </div>
          ) : !page || page.farmers.length === 0 ? (
            <p className="p-8 text-center text-[#5a6760]">{filtered ? t('empty_filtered') : t('empty')}</p>
          ) : (
            <table className="data-table" aria-busy={loading}>
              <thead>
                <tr>
                  <th scope="col">{t('col_id')}</th>
                  <th scope="col">{t('col_name')}</th>
                  <th scope="col">{t('col_coop')}</th>
                  <th scope="col">{t('col_center')}</th>
                  <th scope="col">{t('col_status')}</th>
                  <th scope="col">{t('col_telegram')}</th>
                </tr>
              </thead>
              <tbody>
                {page.farmers.map((farmer) => (
                  <tr key={farmer.id}>
                    <td className="font-mono font-semibold">{farmer.coopFarmerId}</td>
                    <td>{farmer.fullName ?? '—'}</td>
                    <td>{farmer.organization.name}</td>
                    <td>{farmer.collectionCenter?.name ?? '—'}</td>
                    <td>
                      <span className={`chip ${STATUS_STYLES[farmer.status]}`}>{t(`status_${farmer.status}`)}</span>
                    </td>
                    <td className="text-[#5a6760]">{farmer.telegramUsername ? `@${farmer.telegramUsername}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {page && !loadError && <p className="text-sm text-[#5a6760]">{t('total', { count: page.total })}</p>}
      </section>
    </main>
  )
}

/**
 * Two-step import: first the file is checked (dry run, writes nothing), and
 * only once everything is in order is importing enabled.
 */
function ImportPanel({ onImported }: { onImported: () => void }) {
  const t = useTranslations('admin_farmers')
  const fileInput = useRef<HTMLInputElement>(null)
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<FarmerImportResult | null>(null)
  const [done, setDone] = useState<FarmerImportResult | null>(null)
  const [busy, setBusy] = useState<'check' | 'import' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = (text: string) => {
    setCsv(text)
    setPreview(null)
    setDone(null)
    setError(null)
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setFileName(file.name)
    reset(await file.text())
  }

  const run = async (dryRun: boolean) => {
    setBusy(dryRun ? 'check' : 'import')
    setError(null)
    try {
      const result = await adminService.importFarmers(csv, dryRun)
      if (dryRun) {
        setPreview(result)
      } else {
        setPreview(null)
        setDone(result)
        setCsv('')
        setFileName(null)
        if (fileInput.current) fileInput.current.value = ''
        onImported()
      }
    } catch (err) {
      setError((err as ApiError).message)
    } finally {
      setBusy(null)
    }
  }

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'farmers-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const toImport = preview ? preview.created + preview.updated : 0
  const canImport = !!preview && preview.errors.length === 0 && toImport > 0

  return (
    <section className="surface-card p-5 sm:p-6" aria-labelledby="import-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 id="import-title" className="text-lg font-bold">
            {t('import_title')}
          </h2>
          <p className="mt-1 text-sm text-[#5a6760]">{t('import_text')}</p>
        </div>
        <button type="button" className="btn-secondary inline-flex items-center gap-2 text-sm" onClick={downloadTemplate}>
          <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />
          {t('template')}
        </button>
      </div>

      <div className="mt-5 space-y-3">
        <label className="btn-secondary inline-flex cursor-pointer items-center gap-2 text-sm">
          <ArrowUpTrayIcon className="h-4 w-4" aria-hidden="true" />
          {fileName ?? t('choose_file')}
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[#5a6760]">{t('or_paste')}</span>
          <textarea
            value={csv}
            onChange={(e) => {
              setFileName(null)
              reset(e.target.value)
            }}
            rows={4}
            spellCheck={false}
            className="field-input font-mono text-xs"
            placeholder={TEMPLATE}
          />
        </label>

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        {preview && preview.errors.length > 0 && (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="flex items-center gap-2 font-semibold">
              <ExclamationTriangleIcon className="h-5 w-5" aria-hidden="true" />
              {t('errors_title')}
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              {preview.errors.map((e) => (
                <li key={`${e.line}-${e.message}`}>
                  <span className="font-medium">{t('line', { line: e.line })}</span>: {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {preview && preview.errors.length === 0 && (
          <p role="status" className="rounded-xl border border-[#d5e2d9] bg-[#eaf1e9] p-3 text-sm">
            {t('preview_result', { created: preview.created, updated: preview.updated, unchanged: preview.unchanged })}
          </p>
        )}

        {done && (
          <p role="status" className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <CheckCircleIcon className="h-5 w-5" aria-hidden="true" />
            {t('import_done', { created: done.created, updated: done.updated })}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => run(true)} disabled={!csv.trim() || !!busy}>
            {busy === 'check' ? t('checking') : t('preview')}
          </button>
          {canImport && (
            <button type="button" className="btn-primary" onClick={() => run(false)} disabled={!!busy}>
              {busy === 'import' ? t('importing') : t('import', { count: toImport })}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
