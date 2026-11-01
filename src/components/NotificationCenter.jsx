import { lazy, Suspense, useId, useState } from 'react'
import { Bell } from 'lucide-react'
import { visibleAlerts } from '../lib/workspaceTools'
const NotificationDrawer = lazy(() => import('./NotificationDrawer'))

export default function NotificationCenter(props) {
  const { language, alerts, preferences } = props
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const [open, setOpen] = useState(false)
  const id = useId()
  const unread = visibleAlerts(alerts.items, { ...preferences, unreadOnly: true }).length
  return (
    <>
      <button
        type="button"
        className="icon-button notification-bell"
        aria-label={t('Open notifications', 'بازکردن اعلان‌ها')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={t('Notifications', 'اعلان‌ها')}
        onClick={() => {
          setOpen(true)
          alerts.refresh()
        }}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span
            className="notification-count"
            aria-label={t(`${unread} unread notifications`, `${unread} اعلان خوانده‌نشده`)}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <Suspense
          fallback={
            <span className="sr-only" role="status">
              {t('Loading notifications…', 'در حال بارگیری اعلان‌ها…')}
            </span>
          }
        >
          <NotificationDrawer {...props} id={id} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
