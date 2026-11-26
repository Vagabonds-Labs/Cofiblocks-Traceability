'use client'

import {
  ArrowRightIcon,
  BuildingStorefrontIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentListIcon,
  GlobeAltIcon,
  ShieldCheckIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useCallback, useRef, useState } from 'react'

import {
  BatchesSection,
  MyBatches,
  CollectorWork,
  PilotSummary,
} from '@/components/batches'

import { useUser } from '@/lib/providers/UserProvider'
import type { User } from '@/services/auth/types'

export default function HomePage() {
  const { user, loading } = useUser()

  if (loading && !user) {
    return (
      <main className="app-page app-container py-16" aria-busy="true">
        <div className="h-40 animate-pulse rounded-3xl bg-white/70" />
      </main>
    )
  }

  return user ? (
    <StaffHome
      key={`${user.id}:${user.role ?? 'none'}:${user.organizationId ?? ''}:${user.collectionCenterId ?? ''}`}
      user={user}
    />
  ) : (
    <Landing />
  )
}

function Landing() {
  const t = useTranslations('home')
  const locale = useLocale()

  const steps = [
    {
      icon: ChatBubbleLeftRightIcon,
      title: t('step_farmers_title'),
      text: t('step_farmers_text'),
    },
    {
      icon: BuildingStorefrontIcon,
      title: t('step_coop_title'),
      text: t('step_coop_text'),
    },
    {
      icon: GlobeAltIcon,
      title: t('step_union_title'),
      text: t('step_union_text'),
    },
  ]

  return (
    <main className="app-page pb-16">
      <section className="app-container grid items-center gap-10 py-12 md:py-16 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-[#8a6a2f]">
            {t('eyebrow')}
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight text-[#1d2b24] sm:text-5xl">
            {t('hero_title')}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#4c5a52]">
            {t('hero_subtitle')}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={`/${locale}/login`}
              className="btn-primary inline-flex items-center gap-2 px-6 py-3"
            >
              {t('hero_cta')}
              <ArrowRightIcon className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-2 text-sm">
            {[t('pilot_coops'), t('pilot_farmers'), t('pilot_centers')].map(
              (item) => (
                <li
                  key={item}
                  className="chip chip-neutral px-3 py-1.5 text-sm"
                >
                  {item}
                </li>
              )
            )}
          </ul>
        </div>
        <div className="relative overflow-hidden rounded-3xl">
          <img
            src="/images/coffee-ritual.webp"
            alt=""
            className="aspect-[4/3] w-full object-cover"
            width={1200}
            height={800}
          />
          <div className="absolute inset-x-4 bottom-4 flex items-start gap-3 rounded-2xl bg-white/90 p-4 backdrop-blur sm:inset-x-6 sm:bottom-6">
            <ShieldCheckIcon
              className="h-6 w-6 shrink-0 text-[rgb(var(--cb-primary))]"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold">{t('verified_title')}</p>
              <p className="mt-1 text-sm text-[#4c5a52]">
                {t('verified_text')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="app-container" aria-labelledby="how-title">
        <h2 id="how-title" className="text-2xl font-bold">
          {t('how_title')}
        </h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, text }, index) => (
            <li key={title} className="surface-card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf1ef] text-[rgb(var(--cb-primary))]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold text-[#8a6a2f]">
                  0{index + 1}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4c5a52]">
                {text}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}

function StaffHome({ user }: { user: User }) {
  const t = useTranslations()
  const locale = useLocale()
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])
  const hasWork = !!user.role
  const [activeView, setActiveView] = useState<'work' | 'overview'>(
    hasWork ? 'work' : 'overview'
  )
  // Mount the overview on its first visit, then preserve its filters between tabs.
  const [overviewVisited, setOverviewVisited] = useState(!hasWork)
  const [workCount, setWorkCount] = useState<number | null>(null)
  const [selectedCoopId, setSelectedCoopId] = useState('')
  const workTab = useRef<HTMLButtonElement>(null)
  const overviewTab = useRef<HTMLButtonElement>(null)
  const tabs = useRef<HTMLDivElement>(null)
  const ownCoopId =
    user.organization?.kind === 'COOPERATIVE'
      ? (user.organizationId ?? null)
      : null
  const processRole =
    user.role === 'INDUSTRY_MANAGER' ||
    user.role === 'STORE_KEEPER' ||
    user.role === 'EXPORT_MANAGER'

  const selectView = (view: 'work' | 'overview') => {
    if (view === 'overview') setOverviewVisited(true)
    setActiveView(view)
    if (view !== activeView) {
      refresh()
      requestAnimationFrame(() => tabs.current?.scrollIntoView({ block: 'start' }))
    }
  }

  const exploreCooperative = (id: string) => {
    setSelectedCoopId(id)
    const heading = document.getElementById('batches-title')
    heading?.scrollIntoView({ block: 'start' })
    heading?.focus({ preventScroll: true })
  }

  const tabKeys = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!hasWork) return
    let next: 'work' | 'overview'
    if (event.key === 'Home') next = 'work'
    else if (event.key === 'End') next = 'overview'
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      next = activeView === 'work' ? 'overview' : 'work'
    else return
    event.preventDefault()
    selectView(next)
    ;(next === 'work' ? workTab : overviewTab).current?.focus()
  }

  const place = [user.organization?.name, user.collectionCenter?.name]
    .filter(Boolean)
    .join(' · ')

  return (
    <main className="app-page app-container space-y-6 py-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#71815d]">
            {t('home.eyebrow')}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#2d432e] sm:text-4xl">
            {activeView === 'work' ? t('work.title') : t('dashboard.title')}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#68756a]">
            {activeView === 'work' && user.role
              ? t(`home.tasks_${user.role}`)
              : t('dashboard.subtitle')}
          </p>
          {activeView === 'work' && user.role && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#68756a]">
              <span className="rounded-full bg-[#e9efdf] px-2.5 py-1 font-semibold text-[#526c42]">
                {t(`roles.${user.role}`)}
              </span>
              {place}
            </p>
          )}
        </div>
        {user.isAdmin && (
          <nav
            aria-label={t('home.admin_title')}
            className="flex flex-wrap gap-2"
          >
            <AdminLink
              href={`/${locale}/admin/farmers`}
              icon={UserGroupIcon}
              title={t('user_menu.manage_farmers')}
            />
            <AdminLink
              href={`/${locale}/admin/users`}
              icon={ShieldCheckIcon}
              title={t('user_menu.manage_users')}
            />
          </nav>
        )}
      </header>

      <div
        ref={tabs}
        role="tablist"
        aria-label={t('work.views')}
        className="sticky top-20 z-30 flex w-full scroll-mt-24 gap-1 rounded-2xl border border-[#dce3d5] bg-[#f4f6ef]/95 p-1.5 shadow-sm backdrop-blur sm:w-fit"
      >
        {hasWork && (
          <button
            ref={workTab}
            id="work-tab"
            role="tab"
            type="button"
            aria-selected={activeView === 'work'}
            aria-controls="work-panel"
            tabIndex={activeView === 'work' ? 0 : -1}
            onKeyDown={tabKeys}
            onClick={() => selectView('work')}
            className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors sm:flex-none sm:px-5 ${activeView === 'work' ? 'bg-[#355b3a] text-white shadow-sm' : 'text-[#66765a] hover:bg-[#e8eddf]'}`}
          >
            <ClipboardDocumentListIcon
              className="h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            {t('work.tab')}
            {workCount !== null && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] tabular-nums ${activeView === 'work' ? 'bg-white/15 text-white' : 'bg-[#dfe8d3] text-[#426238]'}`}
              >
                {workCount}
              </span>
            )}
          </button>
        )}
        <button
          ref={overviewTab}
          id="overview-tab"
          role="tab"
          type="button"
          aria-selected={activeView === 'overview'}
          aria-controls="overview-panel"
          tabIndex={activeView === 'overview' ? 0 : -1}
          onKeyDown={tabKeys}
          onClick={() => selectView('overview')}
          className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors sm:flex-none sm:px-5 ${activeView === 'overview' ? 'bg-[#355b3a] text-white shadow-sm' : 'text-[#66765a] hover:bg-[#e8eddf]'}`}
        >
          <GlobeAltIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t('work.overview')}
        </button>
      </div>

      {hasWork && (
        <div
          id="work-panel"
          role="tabpanel"
          aria-labelledby="work-tab"
          hidden={activeView !== 'work'}
          tabIndex={0}
          className="space-y-5 rounded-md"
        >
          {user.role === 'COLLECTOR' && (
            <CollectorWork
              user={user}
              refreshKey={refreshKey}
              onChanged={refresh}
              onCountChange={setWorkCount}
            />
          )}
          {processRole && (
            <MyBatches refreshKey={refreshKey} onCountChange={setWorkCount} />
          )}
          {user.role === 'COMMITTEE_MEMBER' && (
            <section className="surface-card p-6">
              <h2 className="text-lg font-bold">{t('work.committee_title')}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#68756a]">
                {t('home.tasks_COMMITTEE_MEMBER')}
              </p>
              <button
                type="button"
                className="btn-primary mt-5 inline-flex items-center gap-2"
                onClick={() => {
                  setSelectedCoopId(ownCoopId ?? '')
                  selectView('overview')
                }}
              >
                {t('work.committee_open')}
                <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </section>
          )}
        </div>
      )}

      <div
        id="overview-panel"
        role="tabpanel"
        aria-labelledby="overview-tab"
        hidden={activeView !== 'overview'}
        tabIndex={0}
        className="space-y-8 rounded-md"
      >
        {overviewVisited && (
          <>
            <PilotSummary
              refreshKey={refreshKey}
              ownCoopId={ownCoopId}
              selectedCoopId={selectedCoopId}
              onSelectCooperative={exploreCooperative}
            />
            <BatchesSection
              refreshKey={refreshKey}
              cooperativeId={selectedCoopId}
              onCooperativeChange={setSelectedCoopId}
            />
          </>
        )}
      </div>
    </main>
  )
}

function AdminLink({
  href,
  icon: Icon,
  title,
}: {
  href: string
  icon: typeof ShieldCheckIcon
  title: string
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full border border-[#d8e0ce] bg-white/70 px-4 py-2.5 text-xs font-semibold text-[#526749] transition hover:bg-white"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {title}
    </Link>
  )
}
