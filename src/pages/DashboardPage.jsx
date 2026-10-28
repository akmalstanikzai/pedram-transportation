import { useEffect, useState } from 'react'
import Brand from '../components/Brand'
import Icon from '../components/Icon'
import { getTranslation } from '../lib/i18n'
import { LanguageSwitch } from './LoginPage'

const moduleDefinitions = [
  { id: 'branches', icon: 'building', titleKey: 'branches', pageKey: 'branchesPage', color: 'blue' },
  { id: 'custom-duty', icon: 'customs', titleKey: 'customDuty', pageKey: 'customDutyPage', color: 'gold' },
  { id: 'transports', icon: 'transport', titleKey: 'transports', pageKey: 'transportsPage', color: 'red' },
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
          <div className="module-shell">
            <div className="module-heading">
              <div className={`module-icon ${activeModule.color}`}><Icon name={activeModule.icon} size={38} /></div>
              <div><span className="section-label">{text.managementModule}</span><h1>{text[activeModule.titleKey]}</h1><p>{text[activeModule.pageKey]}</p></div>
            </div>
            <div className="empty-state">
              <div className="empty-state-mark"><Icon name="layers" size={27} /></div>
              <h2>{text.readyTitle}</h2>
              <p>{text.readyText}</p>
            </div>
          </div>
        </section>
      ) : (
        <section className="dashboard-content">
          {role === 'president' ? (
            <div className="module-grid">
              {moduleDefinitions.map(module => (
                <button className="module-card" key={module.id} onClick={() => openModule(module)}>
                  <span className={`module-card-icon ${module.color}`}><Icon name={module.icon} size={34} /></span>
                  <strong>{text[module.titleKey]}</strong>
                </button>
              ))}
            </div>
          ) : (
            <h1 className="role-title">{text.roles[role] || text.roles.driver}</h1>
          )}
        </section>
      )}
    </main>
  )
}
