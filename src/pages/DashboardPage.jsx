import { useEffect, useState } from 'react'
import {
  Building2,
  ClipboardList,
  FileBarChart,
  HandCoins,
  MapPinned,
  Route,
  ShieldCheck,
  Truck,
  WalletCards,
} from 'lucide-react'
import Brand from '../components/Brand'
import Icon from '../components/Icon'
import { getTranslation } from '../lib/i18n'
import { LanguageSwitch } from './LoginPage'
import VehiclesPage from './VehiclesPage'
import BranchesPage from './BranchesPage'

const moduleDefinitions = [
  { id: 'branches', icon: Building2, titleKey: 'branches', pageKey: 'branchesPage', color: 'blue' },
  { id: 'vehicles', icon: Truck, titleKey: 'vehicles', pageKey: 'vehiclesPage', color: 'green' },
  { id: 'bookings', icon: ClipboardList, titleKey: 'bookings', pageKey: 'bookingsPage', color: 'red' },
  { id: 'trip-plans', icon: MapPinned, titleKey: 'tripPlans', pageKey: 'tripPlansPage', color: 'gold' },
  { id: 'trips', icon: Route, titleKey: 'trips', pageKey: 'tripsPage', color: 'green' },
  { id: 'trader-accounts', icon: HandCoins, titleKey: 'traderAccounts', pageKey: 'traderAccountsPage', color: 'cyan' },
  { id: 'customs', icon: ShieldCheck, titleKey: 'customDuty', pageKey: 'customDutyPage', color: 'gold' },
  { id: 'finance', icon: WalletCards, titleKey: 'finance', pageKey: 'financePage', color: 'indigo' },
  { id: 'reports', icon: FileBarChart, titleKey: 'reports', pageKey: 'reportsPage', color: 'orange' },
]

function getModuleFromHash() {
  const id = window.location.hash.replace('#/', '')
  return moduleDefinitions.find(module => module.id === id) || null
}

export default function DashboardPage({ language, onLanguageChange, session, profile, onSignOut }) {
  const text = getTranslation(language)
  const role = profile?.role || 'driver'
  const displayName = profile?.full_name || session?.user?.email?.split('@')[0] || 'User'
  const [activeModule, setActiveModule] = useState(getModuleFromHash)
  const ActiveModuleIcon = activeModule?.icon

  useEffect(() => {
    const updatePage = () => setActiveModule(getModuleFromHash())
    window.addEventListener('hashchange', updatePage)
    window.addEventListener('popstate', updatePage)
    return () => {
      window.removeEventListener('hashchange', updatePage)
      window.removeEventListener('popstate', updatePage)
    }
  }, [])

  function openModule(module) {
    window.history.pushState('', document.title, `#/${module.id}`)
    setActiveModule(module)
  }

  function closeModule() {
    window.history.pushState('', document.title, `${window.location.pathname}${window.location.search}`)
    setActiveModule(null)
  }

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <Brand text={text} />
        <div className="header-actions">
          <LanguageSwitch language={language} onChange={onLanguageChange} />
          <div className="user-chip"><span className="avatar">{displayName.charAt(0).toUpperCase()}</span><span><strong>{displayName}</strong><small>{text.roles[role] || text.roles.driver}</small></span></div>
          <button className="logout-button" onClick={onSignOut} title={text.signOut}><Icon name="logout" size={18} /><span>{text.signOut}</span></button>
        </div>
      </header>

      {activeModule && role === 'president' ? (
        <section className="module-page">
          <button className="module-back" onClick={closeModule}><Icon name="back" size={17} /> {text.presidentDashboard}</button>
          <div className={`module-shell ${activeModule.id === 'branches' ? 'branch-shell' : ''}`}>
            {activeModule.id !== 'branches' && <div className="module-heading">
              <div className={`module-icon ${activeModule.color}`}><ActiveModuleIcon size={38} strokeWidth={1.8} /></div>
              <div><span className="section-label">{text.managementModule}</span><h1>{text[activeModule.titleKey]}</h1><p>{text[activeModule.pageKey]}</p></div>
            </div>}
            {activeModule.id === 'branches' ? <BranchesPage language={language} /> : activeModule.id === 'vehicles' ? <VehiclesPage language={language} /> : <div className="empty-state">
              <div className="empty-state-mark"><Icon name="layers" size={27} /></div>
              <h2>{text.readyTitle}</h2>
              <p>{text.readyText}</p>
            </div>}
          </div>
        </section>
      ) : (
        <section className="dashboard-content">
          {role === 'president' ? (
            <div className="module-grid">
              {moduleDefinitions.map(module => {
                const ModuleIcon = module.icon
                return (
                  <button className="module-card" key={module.id} onClick={() => openModule(module)}>
                    <span className={`module-card-icon ${module.color}`}><ModuleIcon size={34} strokeWidth={1.8} /></span>
                    <strong>{text[module.titleKey]}</strong>
                  </button>
                )
              })}
            </div>
          ) : (
            <h1 className="role-title">{text.roles[role] || text.roles.driver}</h1>
          )}
        </section>
      )}
    </main>
  )
}
