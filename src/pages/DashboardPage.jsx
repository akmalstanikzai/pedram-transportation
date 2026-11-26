import { useEffect, useState } from 'react'
import {
  Building2,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  BookOpen,
  ChartNoAxesCombined,
  Receipt,
  ShieldAlert,
  Stamp,
  Truck,
  Users,
} from 'lucide-react'
import Brand from '../components/Brand'
import AboutSupport from '../components/AboutSupport'
import Icon from '../components/Icon'
import { getTranslation } from '../lib/i18n'
import { canAccessModule } from '../lib/roles'
import { kabulToday } from '../lib/cashbook'
import { bookingAttention } from '../lib/bookingAttention'
import { formatSolarHijri } from '../lib/solarHijri'
import { LanguageSwitch } from './LoginPage'
import VehiclesPage from './VehiclesPage'
import BranchesPage from './BranchesPage'
import BookingsPage from './BookingsPage'
import CashbookPage from './CashbookPage'
import TradersPage from './TradersPage'
import DriverBookingsPage from './DriverBookingsPage'
import TraderPortalPage from './TraderPortalPage'
import AvailabilityPage from './AvailabilityPage'
import EmployeesPage from './EmployeesPage'
import CustomsPage from './CustomsPage'
import CompanyPages from './CompanyPages'
import OperationsSummary from '../components/OperationsSummary'
import LoanNotifications from '../components/LoanNotifications'
import './DashboardPage.css'
import './RolePortals.css'

const moduleDefinitions = [
  { id: 'cashbook', icon: BookOpen, titleKey: 'cashbook', color: 'green' },
  { id: 'company', icon: ChartNoAxesCombined, titleKey: 'company', color: 'blue' },
  { id: 'expenses', icon: Receipt, titleKey: 'expenses', color: 'cyan' },
  { id: 'branches', icon: Building2, titleKey: 'branches', pageKey: 'branchesPage', color: 'blue' },
  { id: 'vehicles', icon: Truck, titleKey: 'vehicles', pageKey: 'vehiclesPage', color: 'green' },
  { id: 'bookings', icon: ClipboardList, titleKey: 'bookings', pageKey: 'bookingsPage', color: 'red' },
  { id: 'customs', icon: Stamp, titleKey: 'customs', color: 'cyan' },
  { id: 'traders', icon: Users, titleKey: 'traders', color: 'cyan' },
  { id: 'employees', icon: Users, titleKey: 'employees', color: 'blue' },
  { id: 'availability', icon: CalendarDays, titleKey: 'availability', color: 'blue' },
]

const registryModules = ['vehicles', 'bookings', 'customs', 'cashbook', 'traders', 'employees', 'availability', 'company', 'expenses']
const compactModuleClasses = { cashbook: 'cashbook-module', vehicles: 'fleet-module', branches: 'branches-module', bookings: 'bookings-module', customs: 'customs-module', traders: 'traders-module', employees: 'employees-module', availability: 'availability-module' }

function getModuleFromHash() {
  const [raw, query] = window.location.hash.replace('#/', '').split('?')
  const id = raw === 'trader-accounts' ? 'traders' : raw
  const module = moduleDefinitions.find(module => module.id === id)
  const attention = new URLSearchParams(query).get('attention')
  return module?.id === 'bookings' && Object.hasOwn(bookingAttention,attention) ? { ...module, attention } : module || null
}

export default function DashboardPage({ language, onLanguageChange, session, profile, onSignOut }) {
  const text = getTranslation(language)
  const role = profile?.role || 'driver'
  const displayName = profile?.full_name || session?.user?.email?.split('@')[0] || 'User'
  const [requestedModule, setActiveModule] = useState(getModuleFromHash)
  const activeModule = requestedModule && canAccessModule(role, requestedModule.id) ? requestedModule : null
  const companyModule = ['company','expenses'].includes(activeModule?.id)
  const compactModuleClass = companyModule ? 'company-module' : compactModuleClasses[activeModule?.id]
  const ActiveModuleIcon = activeModule?.icon
  const managementHome = !activeModule && ['president', 'branch_manager'].includes(role)
  const dari = language === 'fa'
  const dashboardDate = managementHome ? kabulToday() : ''

  useEffect(() => {
    if (requestedModule && !canAccessModule(role, requestedModule.id)) {
      window.history.replaceState('', document.title, `${window.location.pathname}${window.location.search}`)
    }
  }, [role, requestedModule])

  useEffect(() => {
    const updatePage = () => setActiveModule(getModuleFromHash())
    window.addEventListener('hashchange', updatePage)
    window.addEventListener('popstate', updatePage)
    return () => {
      window.removeEventListener('hashchange', updatePage)
      window.removeEventListener('popstate', updatePage)
    }
  }, [])

  function openModule(module, attention) {
    if (!canAccessModule(role, module.id)) return
    const query = attention ? `?attention=${attention}` : ''
    window.history.pushState('', document.title, `#/${module.id}${query}`)
    setActiveModule(getModuleFromHash())
  }

  function clearBookingAttention() {
    window.history.replaceState('', document.title, '#/bookings')
    setActiveModule(getModuleFromHash())
  }

  function closeModule() {
    window.history.pushState('', document.title, `${window.location.pathname}${window.location.search}`)
    setActiveModule(null)
  }

  return (
    <main className={`dashboard${managementHome ? ' dashboard-home' : ''}${managementHome && role === 'branch_manager' ? ' branch-dashboard-home' : ''}${!activeModule && ['driver','trader'].includes(role) ? ' role-portal-home' : ''}`}>
      <header className="dashboard-header">
        <Brand text={text} />
        <div className="header-actions">
          <LanguageSwitch language={language} onChange={onLanguageChange} />
          {role === 'president' && <LoanNotifications language={language} userId={session.user.id} />}
          {!managementHome && <div className="user-chip"><span className="avatar">{displayName.charAt(0).toUpperCase()}</span><span><strong>{displayName}</strong><small>{text.roles[role] || text.roles.driver}</small></span></div>}
          <AboutSupport language={language} />
          <button className="logout-button" onClick={onSignOut} title={text.signOut}><Icon name="logout" size={18} /><span>{text.signOut}</span></button>
        </div>
      </header>

      {activeModule ? (
        <section className={compactModuleClass ? `module-page ${compactModuleClass}` : 'module-page'}>
          {!compactModuleClass && <button className="module-back" onClick={closeModule}><Icon name="back" size={17} /> {role === 'president' ? text.presidentDashboard : text.roles.branch_manager}</button>}
          <div className={`module-shell ${activeModule.id === 'branches' ? 'branch-shell' : registryModules.includes(activeModule.id) ? 'fleet-shell' : ''}`}>
            {activeModule.id !== 'branches' && !registryModules.includes(activeModule.id) && <div className="module-heading">
              <div className={`module-icon ${activeModule.color}`}><ActiveModuleIcon size={38} strokeWidth={1.8} /></div>
              <div><span className="section-label">{text.managementModule}</span><h1>{text[activeModule.titleKey]}</h1><p>{text[activeModule.pageKey]}</p></div>
            </div>}
            {companyModule ? <CompanyPages key={activeModule.id} kind={activeModule.id} language={language} profile={profile} onBack={closeModule} /> : activeModule.id === 'customs' ? <CustomsPage language={language} profile={profile} onBack={closeModule} /> : activeModule.id === 'availability' ? <AvailabilityPage language={language} onBack={closeModule} /> : activeModule.id === 'employees' ? <EmployeesPage language={language} profile={profile} onBack={closeModule} /> : activeModule.id === 'traders' ? <TradersPage language={language} profile={profile} onBack={closeModule} /> : activeModule.id === 'cashbook' ? <CashbookPage language={language} profile={profile} onBack={closeModule} /> : activeModule.id === 'branches' ? <BranchesPage language={language} profile={profile} onBack={closeModule} /> : activeModule.id === 'vehicles' ? <VehiclesPage language={language} profile={profile} onBack={closeModule} /> : activeModule.id === 'bookings' ? <BookingsPage language={language} profile={profile} onBack={closeModule} attention={activeModule.attention} onClearAttention={clearBookingAttention} /> : <div className="empty-state">
              <div className="empty-state-mark"><Icon name="layers" size={27} /></div>
              <h2>{text.readyTitle}</h2>
              <p>{text.readyText}</p>
            </div>}
          </div>
        </section>
      ) : (
        <section className="dashboard-content">
          {managementHome ? (
            <>
            <div className="dashboard-banner">
              {role === 'branch_manager' && <div className="branch-dashboard-mark"><Building2 size={25} aria-hidden="true" /></div>}
              <div className="dashboard-banner-copy">
                <h1>{role === 'president' ? text.presidentDashboard : dari ? 'صفحه شعبه' : 'Branch dashboard'}</h1>
                <p><bdi>{displayName}</bdi></p>
                <time dateTime={dashboardDate}><CalendarDays size={14} aria-hidden="true" /><bdi dir="ltr">{formatSolarHijri(dashboardDate)}</bdi></time>
              </div>
            </div>
            {role === 'branch_manager' && !profile.branch_id && <p className="registry-notice error branch-dashboard-notice" role="alert">{dari ? 'برای تعیین شعبهٔ حساب خود با دفتر مرکزی تماس بگیرید.' : 'Contact head office to assign a branch to your account.'}</p>}
            <nav className="dashboard-menu" aria-labelledby="dashboard-menu-title">
              <h2 id="dashboard-menu-title">{dari ? 'منوی اصلی' : 'Main menu'}</h2>
              <div className="module-grid">
                {moduleDefinitions.map((module, index) => canAccessModule(role, module.id) &&
                  <button type="button" className="module-card" data-module={module.id} key={module.id} onClick={() => openModule(module)}>
                    <span className="dashboard-icon" aria-hidden="true">
                      <span style={{ backgroundPosition: `${(index % 4) * 100 / 3}% ${index < 4 ? 0 : 100}%` }} />
                    </span>
                    <strong>{text[module.titleKey]}</strong>
                    <ChevronRight className="dashboard-card-arrow" size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            </nav>
            <OperationsSummary language={language} president={role === 'president'}
              onBookingAttention={attention=>openModule(moduleDefinitions.find(module=>module.id==='bookings'),attention)} />
            </>
          ) : (
            role === 'driver' ? <DriverBookingsPage language={language} /> : role === 'trader' ? <TraderPortalPage language={language} /> : <div className="role-workspace role-access-state">
              <header className="role-workspace-header">
                <div className="role-workspace-identity">
                  <span className="role-workspace-icon"><ShieldAlert size={23} aria-hidden="true" /></span>
                  <div><h1>{text.roles[role] || text.roles.driver}</h1><p><bdi>{displayName}</bdi></p></div>
                </div>
              </header>
              <p>{dari ? 'برای تعیین دسترسی این حساب با دفتر مرکزی تماس بگیرید.' : 'Contact head office to set up access for this account.'}</p>
            </div>
          )}
        </section>
      )}
    </main>
  )
}
