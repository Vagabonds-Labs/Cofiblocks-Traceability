'use client'

import { MagnifyingGlassIcon, ShieldCheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { ExplorerLink } from '@/components/trace'
import { useUser } from '@/lib/providers/UserProvider'
import type { ApiError } from '@/lib/api'
import { adminService } from '@/services/api/admin'
import { organizationsService } from '@/services/api/organizations'
import { userService } from '@/services/api/users'
import type { User } from '@/services/auth/types'
import { STAFF_ROLES, type Organization, type StaffRole } from '@/types/traceability'
import { shortAddress } from '@/utils/stellar'

type Notice = { kind: 'success' | 'error'; text: string; tx?: string }

const displayName = (user: User, fallback: string) =>
  user.name || user.email || (user.telegramUsername ? `@${user.telegramUsername}` : null) || fallback

export default function AdminUsersPage() {
  const t = useTranslations('admin_users')
  const tr = useTranslations('roles')
  const tc = useTranslations('common')
  const { user: me } = useUser()

  const [users, setUsers] = useState<User[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'' | StaffRole | 'NONE'>('')
  const [editing, setEditing] = useState<User | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [usersPage, orgs] = await Promise.all([
        userService.getAllUsers({ limit: 100, role: roleFilter && roleFilter !== 'NONE' ? roleFilter : undefined }),
        organizationsService.list(),
      ])
      setUsers(usersPage.users)
      setOrganizations(orgs)
    } catch (error) {
      setLoadError((error as ApiError).message)
    } finally {
      setLoading(false)
    }
  }, [roleFilter])

  useEffect(() => {
    if (me?.isAdmin) load()
  }, [me?.isAdmin, load])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter === 'NONE' && u.role) return false
      if (!query) return true
      return [u.name, u.email, u.telegramUsername, u.walletAddress].some((v) => v?.toLowerCase().includes(query))
    })
  }, [users, search, roleFilter])

  const revoke = async (user: User) => {
    const name = displayName(user, t('no_name'))
    if (!confirm(t('confirm_remove', { name }))) return
    try {
      const result = await adminService.revokeRole(user.id)
      setUsers((list) => list.map((u) => (u.id === user.id ? result.user : u)))
      setNotice({ kind: 'success', text: t('removed', { name }), tx: result.tx_hash })
    } catch (error) {
      setNotice({ kind: 'error', text: t('error', { message: (error as ApiError).message }) })
    }
  }

  return (
    <main className="app-page app-container py-8 sm:py-12">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-2 max-w-2xl text-[#5a6760]">{t('subtitle')}</p>
      </header>

      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm ${
            notice.kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'
          }`}
        >
          <span>{notice.text}</span>
          <span className="flex items-center gap-3">
            {notice.tx && (
              <ExplorerLink kind="tx" id={notice.tx}>
                {t('view_tx')}
              </ExplorerLink>
            )}
            <button type="button" onClick={() => setNotice(null)} aria-label={t('cancel')}>
              <XMarkIcon className="h-5 w-5" />
            </button>
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
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
        <label className="sm:w-60">
          <span className="sr-only">{t('filter_role')}</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
            className="field-input"
          >
            <option value="">{t('filter_all_roles')}</option>
            <option value="NONE">{t('filter_without_role')}</option>
            {STAFF_ROLES.map((role) => (
              <option key={role} value={role}>
                {tr(role)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="surface-card overflow-x-auto">
        {loading ? (
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
        ) : visible.length === 0 ? (
          <p className="p-8 text-center text-[#5a6760]">{t('empty')}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t('col_user')}</th>
                <th scope="col">{t('col_role')}</th>
                <th scope="col">{t('col_organization')}</th>
                <th scope="col" className="text-right">
                  {t('col_actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-2 font-semibold">
                      {displayName(u, t('no_name'))}
                      {u.isAdmin && (
                        <span className="chip chip-neutral">
                          <ShieldCheckIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                          {t('admin_badge')}
                        </span>
                      )}
                    </div>
                    {u.walletAddress && (
                      <span className="font-mono text-xs text-[#5a6760]" title={u.walletAddress}>
                        {shortAddress(u.walletAddress)}
                      </span>
                    )}
                  </td>
                  <td>
                    {u.role ? (
                      <span className="font-medium">{tr(u.role)}</span>
                    ) : (
                      <span className="text-[#8a968f]">{tr('none')}</span>
                    )}
                    {u.roleTx && u.role && (
                      <div>
                        <ExplorerLink kind="tx" id={u.roleTx} className="text-xs">
                          {t('view_tx')}
                        </ExplorerLink>
                      </div>
                    )}
                  </td>
                  <td>
                    {u.organization?.name ?? '—'}
                    {u.collectionCenter && (
                      <span className="block text-xs text-[#5a6760]">{u.collectionCenter.name}</span>
                    )}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn-secondary px-3 py-1.5 text-sm"
                        onClick={() => setEditing(u)}
                        disabled={!u.walletAddress}
                      >
                        {u.role ? t('change') : t('assign')}
                      </button>
                      {u.role && (
                        <button type="button" className="btn-danger px-3 py-1.5 text-sm" onClick={() => revoke(u)}>
                          {t('remove')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {!loading && !loadError && (
        <p className="mt-3 text-sm text-[#5a6760]">{t('total', { count: visible.length })}</p>
      )}

      {editing && (
        <RoleDialog
          user={editing}
          organizations={organizations}
          onClose={() => setEditing(null)}
          onSaved={(updated, tx) => {
            setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)))
            setNotice({ kind: 'success', text: t('assigned', { name: displayName(updated, t('no_name')) }), tx })
            setEditing(null)
          }}
        />
      )}
    </main>
  )
}

function RoleDialog({
  user,
  organizations,
  onClose,
  onSaved,
}: {
  user: User
  organizations: Organization[]
  onClose: () => void
  onSaved: (user: User, tx: string) => void
}) {
  const t = useTranslations('admin_users')
  const tr = useTranslations('roles')
  const [role, setRole] = useState<StaffRole | ''>(user.role ?? '')
  const [organizationId, setOrganizationId] = useState(user.organizationId ?? '')
  const [centerId, setCenterId] = useState(user.collectionCenterId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const kind = role === 'EXPORT_MANAGER' ? 'UNION' : 'COOPERATIVE'
  const options = organizations.filter((o) => o.kind === kind)
  const organization = options.find((o) => o.id === organizationId)
  const needsCenter = role === 'COLLECTOR'
  const canSave = !!role && !!organization && (!needsCenter || !!centerId) && !saving

  // Si cambia el rol a uno de otro tipo de organización, la elegida deja de valer.
  useEffect(() => {
    if (organizationId && !options.some((o) => o.id === organizationId)) {
      setOrganizationId(options.length === 1 ? options[0].id : '')
      setCenterId('')
    }
  }, [kind]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const save = async () => {
    if (!role || !organization) return
    setSaving(true)
    setError(null)
    try {
      const result = await adminService.assignRole(user.id, {
        role,
        organizationId: organization.id,
        collectionCenterId: needsCenter ? centerId : null,
      })
      onSaved(result.user, result.tx_hash)
    } catch (err) {
      setError(t('error', { message: (err as ApiError).message }))
      setSaving(false)
    }
  }

  const name = displayName(user, t('no_name'))

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-dialog-title"
        className="app-page w-full max-w-md rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="role-dialog-title" className="text-xl font-bold">
          {t('modal_title', { name })}
        </h2>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{t('field_role')}</span>
            <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className="field-input">
              <option value="">{t('choose')}</option>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {tr(r)}
                </option>
              ))}
            </select>
          </label>

          {role && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{t('field_organization')}</span>
              <select
                value={organizationId}
                onChange={(e) => {
                  setOrganizationId(e.target.value)
                  setCenterId('')
                }}
                className="field-input"
              >
                <option value="">{t('choose')}</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              {role === 'EXPORT_MANAGER' && <span className="mt-1 block text-xs text-[#5a6760]">{t('export_manager_hint')}</span>}
            </label>
          )}

          {needsCenter && organization && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{t('field_center')}</span>
              <select value={centerId} onChange={(e) => setCenterId(e.target.value)} className="field-input">
                <option value="">{t('choose')}</option>
                {organization.collectionCenters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            {t('cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={save} disabled={!canSave}>
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
