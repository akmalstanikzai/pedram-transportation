import Brand from '../components/Brand'
import Icon from '../components/Icon'
import { getDashboardTitle, roleLabels } from '../lib/roles'

export default function DashboardPage({ session, profile, onSignOut }) {
  const role = profile?.role || 'driver'
  const displayName = profile?.full_name || session?.user?.email?.split('@')[0] || 'User'

  return <main className="dashboard"><header className="dashboard-header"><Brand /><div className="header-actions"><div className="user-chip"><span className="avatar">{displayName.charAt(0).toUpperCase()}</span><span><strong>{displayName}</strong><small>{roleLabels[role]}</small></span></div><button className="logout-button" onClick={onSignOut}><Icon name="logout" size={17} /> Sign out</button></div></header><section className="dashboard-content"><h1>{getDashboardTitle(role)}</h1></section></main>
}
