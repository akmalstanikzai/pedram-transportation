import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  ClipboardList,
  FileBarChart,
  HandCoins,
  LayoutDashboard,
  Settings,
  MapPinned,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ShieldCheck,
  Truck,
  UserRound,
  Users,
  WalletCards,
  X,
} from 'lucide-react'
import { getTranslation } from '../lib/i18n'
import { canAccess, canOperate } from '../lib/operations'
import { client } from '../lib/api'
import { EmptyState, Loading, Notice, PageHeading } from '../components/Workspace'
import { LanguageSwitch } from './LoginPage'
import GlobalSearch from '../components/GlobalSearch'
import ProfileMenu from '../components/ProfileMenu'
import NotificationCenter from '../components/NotificationCenter'
import useWorkspaceAlerts from '../lib/useWorkspaceAlerts'
import {
  normalizePreferences,
  parseWorkspaceRoute,
  readPreferences,
  writePreferences,
} from '../lib/workspaceTools'
const VehiclesPage = lazy(() => import('./VehiclesPage'))
const BranchesPage = lazy(() => import('./BranchesPage'))
const BookingsPage = lazy(() => import('./BookingsPage'))
const CashbookPage = lazy(() => import('./CashbookPage'))
const SettingsPage = lazy(() => import('./SettingsPage'))

const modules = [
  { id: 'branches', icon: Building2, en: 'Branches', fa: 'شعبات' },
  { id: 'vehicles', icon: Truck, en: 'Fleet', fa: 'وسایط و رانندگان' },
  { id: 'bookings', icon: ClipboardList, en: 'Bookings', fa: 'بوکینگ‌ها' },
  { id: 'cashbook', icon: BookOpen, en: 'Cashbook', fa: 'روزنامچه' },
  { id: 'trip-plans', icon: MapPinned, en: 'Trip plans', fa: 'برنامه‌های سفر', future: true },
  {
    id: 'trader-accounts',
    icon: HandCoins,
    en: 'Trader accounts',
    fa: 'حسابات تاجران',
    future: true,
  },
  { id: 'customs', icon: ShieldCheck, en: 'Customs', fa: 'امور گمرکی', future: true },
  { id: 'finance', icon: WalletCards, en: 'Finance', fa: 'امور مالی', future: true },
  { id: 'reports', icon: FileBarChart, en: 'Reports', fa: 'گزارش‌ها', future: true },
]
const readRoute = () => parseWorkspaceRoute(window.location.hash).segments
const link = (route) => `#/${route}`

export default function DashboardPage({
  language,
  onLanguageChange,
  session,
  profile,
  onSignOut,
  signingOut,
  onProfileUpdated,
}) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const [route, setRoute] = useState(readRoute)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('pedram-sidebar') === 'collapsed'
    } catch {
      return false
    }
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const sidebarRef = useRef(null)
  const [expanded, setExpanded] = useState({ vehicles: true })
  const [today] = useState(() => new Date())
  const [preferences, setPreferences] = useState(() => readPreferences(profile.id))
  const alerts = useWorkspaceAlerts(preferences.notificationDays)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  const [moduleId = 'overview', action = '', recordId = ''] = route
  const { params } = parseWorkspaceRoute(window.location.hash)
  const role = profile.role
  const name = profile.full_name || session.user.email?.split('@')[0] || t('Staff member', 'کارمند')
  const module = modules.find(
    (item) =>
      item.id === moduleId || (item.id === 'vehicles' && ['owners', 'drivers'].includes(moduleId)),
  )
  const allowed = moduleId === 'settings' || canAccess(role, moduleId)
  const title =
    moduleId === 'settings'
      ? t('Settings', 'تنظیمات')
      : moduleId === 'overview'
        ? t('Overview', 'نمای کلی')
        : ['owners', 'drivers'].includes(moduleId)
          ? moduleId === 'owners'
            ? t('Vehicle owners', 'مالکان وسایط')
            : t('Drivers', 'رانندگان')
          : module
            ? t(module.en, module.fa)
            : t('Page not found', 'صفحه یافت نشد')
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = (event) => setSystemDark(event.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  function changePreferences(patch) {
    const next = normalizePreferences({ ...preferences, ...patch })
    try {
      writePreferences(profile.id, next)
    } catch {
      throw new Error('STORAGE_UNAVAILABLE')
    }
    setPreferences(next)
  }
  useEffect(() => {
    const update = () => {
      setRoute(readRoute())
      setMobileOpen(false)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const update = (event) => {
      setNarrow(event.matches)
      if (!event.matches) setMobileOpen(false)
    }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!mobileOpen || !narrow) return undefined
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sidebarRef.current.querySelector('.sidebar-mobile-close')?.focus()
    function trap(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMobileOpen(false)
      }
      if (event.key !== 'Tab') return
      const controls = [
        ...sidebarRef.current.querySelectorAll('a[href],button:not(:disabled)'),
      ].filter((element) => element.getClientRects().length)
      const first = controls[0],
        last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', trap)
    return () => {
      document.removeEventListener('keydown', trap)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [mobileOpen, narrow])
  function toggleSidebar() {
    setCollapsed((value) => {
      try {
        localStorage.setItem('pedram-sidebar', value ? 'expanded' : 'collapsed')
      } catch {
        /* Optional preference. */
      }
      return !value
    })
  }
  function groupChildren(id) {
    if (id === 'vehicles')
      return [
        ['vehicles', Truck, t('All vehicles', 'تمام وسایط')],
        ['owners', Users, t('Vehicle owners', 'مالکان وسایط')],
        ['drivers', UserRound, t('Drivers', 'رانندگان')],
        ['vehicles/new', Plus, t('Register vehicle', 'ثبت واسطه')],
        ['owners/new', Plus, t('Register owner', 'ثبت مالک')],
        ['drivers/new', Plus, t('Register driver', 'ثبت راننده')],
      ]
    if (id === 'branches')
      return [
        ['branches', Building2, t('All branches', 'تمام شعبات')],
        ...(role === 'president'
          ? [
              ['branches/new', Plus, t('Add branch', 'افزودن شعبه')],
              ['branches/archived', BookOpen, t('Archived branches', 'شعبات بایگانی')],
            ]
          : []),
      ]
    if (id === 'bookings')
      return [
        ['bookings', ClipboardList, t('All bookings', 'تمام بوکینگ‌ها')],
        ...(canOperate(role)
          ? [
              ['bookings/new', Plus, t('New booking', 'بوکینگ جدید')],
              ['bookings/active', Truck, t('Active bookings', 'بوکینگ‌های فعال')],
            ]
          : []),
      ]
    return []
  }
  return (
    <div
      className={`workspace ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'sidebar-mobile-open' : ''}`}
      data-theme={
        preferences.theme === 'system' ? (systemDark ? 'dark' : 'light') : preferences.theme
      }
      data-density={preferences.density}
    >
      <a
        className="skip-link"
        href="#workspace-main"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('workspace-main')?.focus()
        }}
      >
        {t('Skip to content', 'رفتن به محتوا')}
      </a>
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          onClick={() => setMobileOpen(false)}
          aria-label={t('Close navigation', 'بستن فهرست')}
        />
      )}
      <aside
        ref={sidebarRef}
        inert={narrow && !mobileOpen}
        className="workspace-sidebar"
        aria-label={t('Main navigation', 'فهرست اصلی')}
      >
        <div className="sidebar-top">
          <a className="sidebar-brand" href="#/">
            <img src="/pedram-logo.jpeg" alt="" />
            <span>
              <strong>
                PEDRAM<span className="brand-dot">.</span>
              </strong>
              <small>{t('TRANSPORTATION', 'ترانسپورت بین‌المللی')}</small>
            </span>
          </a>
          <button
            type="button"
            className="sidebar-collapse-button icon-button"
            onClick={toggleSidebar}
            title={t(
              collapsed ? 'Expand sidebar' : 'Collapse sidebar',
              collapsed ? 'گسترش فهرست' : 'جمع‌کردن فهرست',
            )}
            aria-label={t(
              collapsed ? 'Expand sidebar' : 'Collapse sidebar',
              collapsed ? 'گسترش فهرست' : 'جمع‌کردن فهرست',
            )}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <button
          className="sidebar-mobile-close icon-button"
          onClick={() => setMobileOpen(false)}
          aria-label={t('Close navigation', 'بستن فهرست')}
        >
          <X size={20} />
        </button>
        <div className="sidebar-section-label">{t('WORKSPACE', 'محیط کاری')}</div>
        <nav>
          <a
            href="#/"
            className={`sidebar-link ${moduleId === 'overview' ? 'selected' : ''}`}
            title={t('Overview', 'نمای کلی')}
            aria-current={moduleId === 'overview' ? 'page' : undefined}
          >
            <LayoutDashboard size={20} />
            <span>{t('Overview', 'نمای کلی')}</span>
          </a>
          {modules
            .filter((item) => !item.future && canAccess(role, item.id))
            .map((item) => {
              const Icon = item.icon
              const children = groupChildren(item.id)
              const current = module?.id === item.id
              const open = expanded[item.id] ?? current
              return (
                <div className="sidebar-group" key={item.id}>
                  {children.length ? (
                    <button
                      className={`sidebar-link ${current ? 'group-selected' : ''}`}
                      title={t(item.en, item.fa)}
                      aria-expanded={(!collapsed || narrow) && open}
                      aria-controls={`nav-${item.id}`}
                      onClick={() => {
                        if (collapsed && !narrow) {
                          setCollapsed(false)
                          setExpanded((value) => ({ ...value, [item.id]: true }))
                        } else setExpanded((value) => ({ ...value, [item.id]: !open }))
                      }}
                    >
                      <Icon size={20} />
                      <span>{t(item.en, item.fa)}</span>
                      <ChevronDown className={open ? 'chevron-open' : ''} size={15} />
                    </button>
                  ) : (
                    <a
                      href={link(item.id)}
                      className={`sidebar-link ${current ? 'selected' : ''}`}
                      title={t(item.en, item.fa)}
                      aria-current={current ? 'page' : undefined}
                    >
                      <Icon size={20} />
                      <span>{t(item.en, item.fa)}</span>
                    </a>
                  )}
                  {children.length > 0 && (!collapsed || narrow) && open && (
                    <div className="sidebar-submenu" id={`nav-${item.id}`}>
                      {children.map(([path, ChildIcon, label]) => (
                        <a
                          key={path}
                          href={link(path)}
                          className={route.join('/') === path ? 'selected' : ''}
                          aria-current={route.join('/') === path ? 'page' : undefined}
                        >
                          <ChildIcon size={15} />
                          <span>{label}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          {role === 'president' && (
            <>
              <div className="sidebar-section-label">{t('MORE MODULES', 'سایر بخش‌ها')}</div>
              {modules
                .filter((item) => item.future)
                .map((item) => {
                  const Icon = item.icon
                  return (
                    <a
                      key={item.id}
                      className={`sidebar-link ${moduleId === item.id ? 'selected' : ''}`}
                      href={link(item.id)}
                      title={t(item.en, item.fa)}
                      aria-current={moduleId === item.id ? 'page' : undefined}
                    >
                      <Icon size={20} />
                      <span>{t(item.en, item.fa)}</span>
                      <span
                        className="nav-future-dot"
                        aria-label={t('Planned module', 'بخش برنامه‌ریزی‌شده')}
                      />
                    </a>
                  )
                })}
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="workspace-indicator">
            <span /> <span>{t('Pedram management', 'مدیریت پدرام')}</span>
          </div>
          <a
            href="#/settings"
            className={`sidebar-link ${moduleId === 'settings' ? 'selected' : ''}`}
            title={t('Settings', 'تنظیمات')}
            aria-current={moduleId === 'settings' ? 'page' : undefined}
          >
            <Settings size={20} />
            <span>{t('Settings', 'تنظیمات')}</span>
          </a>
        </div>
      </aside>
      <div className="workspace-body" inert={narrow && mobileOpen}>
        <header className="workspace-topbar">
          <div className="workspace-breadcrumb">
            <button
              className="icon-button mobile-menu-button"
              onClick={() => setMobileOpen(true)}
              aria-label={t('Open navigation', 'بازکردن فهرست')}
            >
              <Menu size={22} />
            </button>
            <span>{t('Workspace', 'محیط کاری')}</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{title}</strong>
          </div>
          <GlobalSearch language={language} role={role} />
          <div className="workspace-user">
            <LanguageSwitch language={language} onChange={onLanguageChange} />
            <span className="topbar-divider" />
            <NotificationCenter
              language={language}
              alerts={alerts}
              preferences={preferences}
              onPreferencesChange={changePreferences}
            />
            <ProfileMenu
              name={name}
              email={session.user.email}
              roleLabel={getTranslation(language).roles[role]}
              language={language}
              onSignOut={onSignOut}
              signingOut={signingOut}
            />
          </div>
        </header>
        <main
          id="workspace-main"
          className="workspace-main"
          tabIndex={-1}
          key={`${moduleId}/${action}/${recordId}?${params.toString()}`}
        >
          <Suspense fallback={<Loading language={language} />}>
            {!allowed ? (
              <EmptyState
                title={t('Access restricted', 'دسترسی محدود')}
                description={t(
                  'Your account does not have access to this module.',
                  'حساب شما به این بخش دسترسی ندارد.',
                )}
              />
            ) : moduleId === 'settings' ? (
              <SettingsPage
                language={language}
                onLanguageChange={onLanguageChange}
                session={session}
                profile={profile}
                tab={action}
                preferences={preferences}
                onPreferencesChange={changePreferences}
                onProfileUpdated={onProfileUpdated}
                alerts={alerts}
              />
            ) : moduleId === 'overview' ? (
              <Overview language={language} profile={profile} name={name} today={today} />
            ) : moduleId === 'branches' ? (
              <BranchesPage
                language={language}
                profile={profile}
                action={action}
                recordId={recordId}
              />
            ) : ['vehicles', 'owners', 'drivers'].includes(moduleId) ? (
              <VehiclesPage
                language={language}
                profile={profile}
                view={moduleId}
                action={action}
                recordId={recordId}
                documentId={params.get('document')}
                onAlertsChanged={alerts.refresh}
              />
            ) : moduleId === 'bookings' ? (
              <BookingsPage
                language={language}
                profile={profile}
                action={action}
                recordId={recordId}
                traderId={params.get('trader')}
                onAlertsChanged={alerts.refresh}
              />
            ) : moduleId === 'cashbook' ? (
              <CashbookPage
                language={language}
                profile={profile}
                initialScope={params.get('scope')}
                initialCurrency={params.get('currency')}
                highlightEntry={params.get('entry')}
              />
            ) : module?.future ? (
              <>
                <PageHeading
                  title={title}
                  description={t(
                    'A place for your next stage of operations.',
                    'محلی برای مرحله بعدی فعالیت‌ها.',
                  )}
                />
                <div className="surface-card">
                  <EmptyState
                    title={t('Ready for the next step', 'آماده برای مرحله بعد')}
                    description={t(
                      'This module is reserved for future implementation. Your existing navigation is retained.',
                      'این بخش برای توسعه آینده در فهرست حفظ شده است.',
                    )}
                  />
                </div>
              </>
            ) : (
              <EmptyState title={t('Page not found', 'صفحه یافت نشد')} />
            )}
          </Suspense>
          <footer className="workspace-page-footer">
            <span>
              © {today.getFullYear()} {t('Pedram Transportation', 'ترانسپورت پدرام')}
            </span>
            <span>{t('Built for every journey.', 'همراه هر سفر.')}</span>
          </footer>
        </main>
      </div>
    </div>
  )
}

function Overview({ language, profile, name, today }) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let active = true
    async function load() {
      if (!canOperate(profile.role) && profile.role !== 'driver') {
        if (active) setData({})
        return
      }
      try {
        const tables =
          profile.role === 'driver' ? ['bookings'] : ['bookings', 'vehicles', 'drivers', 'branches']
        const results = await Promise.all(
          tables.map((table) => client().from(table).select('id', { count: 'exact', head: true })),
        )
        const failure = results.find((result) => result.error)
        if (failure) throw failure.error
        if (active) setData(Object.fromEntries(tables.map((table, i) => [table, results[i].count])))
      } catch (failure) {
        if (active) setError(failure)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [profile.role])
  const cards = [
    [ClipboardList, 'bookings', t('Bookings', 'بوکینگ‌ها'), t('Transport records', 'سوابق انتقال')],
    [Truck, 'vehicles', t('Vehicles', 'وسایط'), t('Registered fleet', 'وسایط ثبت‌شده')],
    [UserRound, 'drivers', t('Drivers', 'رانندگان'), t('People on the move', 'همکاران در مسیر')],
    [Building2, 'branches', t('Branches', 'شعبات'), t('Connected locations', 'دفاتر مرتبط')],
  ]
  return (
    <>
      <div className="overview-eyebrow">
        <span className="status-dot" />
        {t('YOUR OPERATIONS, AT A GLANCE', 'فعالیت‌های شما در یک نگاه')}
      </div>
      <PageHeading
        title={t(`Welcome back, ${name.split(' ')[0]}`, `خوش آمدید، ${name.split(' ')[0]}`)}
        description={t(
          'Keep your people, fleet and bookings moving together.',
          'کارمندان، وسایط و بوکینگ‌ها را هماهنگ مدیریت کنید.',
        )}
      >
        <span className="today-chip">
          {new Intl.DateTimeFormat('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }).format(today)}
        </span>
      </PageHeading>
      <Notice error={error} language={language} />
      {!data && !error ? (
        <Loading language={language} />
      ) : (
        <div className="overview-stats">
          {cards
            .filter(([, id]) => canAccess(profile.role, id))
            .map(([Icon, id, label, caption]) => (
              <a href={link(id)} className="overview-stat" key={id}>
                <span className="stat-top">
                  <span>{label}</span>
                  <Icon size={21} />
                </span>
                <strong>{data?.[id]?.toLocaleString('en-US') ?? '—'}</strong>
                <span className="stat-caption">
                  {caption}
                  <ArrowRight size={15} />
                </span>
              </a>
            ))}
        </div>
      )}
      <div className="overview-columns">
        <section className="surface-card quick-actions">
          <div className="section-heading">
            <h2>{t('Quick actions', 'دسترسی سریع')}</h2>
            <span>{t('Start something new', 'یک کار جدید آغاز کنید')}</span>
          </div>
          <div className="quick-actions-grid">
            {[
              [
                'branches/new',
                Building2,
                t('Add a branch', 'افزودن شعبه'),
                (role) => role === 'president',
              ],
              ['vehicles/new', Truck, t('Register a vehicle', 'ثبت واسطه'), canOperate],
              ['drivers/new', UserRound, t('Register a driver', 'ثبت راننده'), canOperate],
              ['bookings/new', ClipboardList, t('Create a booking', 'ثبت بوکینگ'), canOperate],
            ]
              .filter(([, , , access]) => access(profile.role))
              .map(([path, Icon, label]) => (
                <a href={link(path)} key={path}>
                  <span>
                    <Icon size={20} />
                  </span>
                  <strong>{label}</strong>
                  <Plus size={17} />
                </a>
              ))}
            {!canOperate(profile.role) && (
              <p className="muted">
                {profile.role === 'driver'
                  ? t(
                      'Open Bookings to view your assigned journeys.',
                      'برای دیدن سفرهای تعیین‌شده، بوکینگ‌ها را باز کنید.',
                    )
                  : t(
                      'Your staff account is active. Contact your administrator to arrange module access.',
                      'حساب کاری شما فعال است. برای دسترسی به بخش‌ها با مسئول سیستم تماس بگیرید.',
                    )}
              </p>
            )}
          </div>
        </section>
        <section className="overview-note">
          <div className="note-icon">
            <Check size={22} />
          </div>
          <span className="eyebrow-label">
            {t('ONE CONNECTED WORKSPACE', 'یک محیط کاری یکپارچه')}
          </span>
          <h2>{t('A clearer view of the road ahead.', 'دید روشن‌تر به مسیر پیش رو.')}</h2>
          <p>
            {t(
              'Register your fleet, keep documents together, and turn transport requests into organized bookings.',
              'وسایط را ثبت، اسناد را یکجا و درخواست‌های انتقال را به بوکینگ‌های منظم تبدیل کنید.',
            )}
          </p>
          <a href={link('bookings')}>
            {t('View bookings', 'مشاهده بوکینگ‌ها')}
            <ArrowRight size={17} />
          </a>
        </section>
      </div>
    </>
  )
}
