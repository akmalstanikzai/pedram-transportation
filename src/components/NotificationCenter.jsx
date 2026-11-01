import { lazy, Suspense, useId, useState } from 'react'
import { Bell, CircleAlert } from 'lucide-react'
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
        title={
          alerts.error
            ? t(
                'Notifications could not be loaded. Open to retry.',
                'اعلان‌ها بارگیری نشد. برای کوشش مجدد باز کنید.',
              )
            : t('Notifications', 'اعلان‌ها')
        }
        aria-busy={alerts.loading}
        onClick={() => {
          setOpen(true)
          alerts.refresh()
        }}
      >
        <Bell size={20} />
        {alerts.error && (
          <span
            className="notification-load-warning"
            role="img"
            aria-label={t('Notifications could not be loaded', 'اعلان‌ها بارگیری نشد')}
          >
            <CircleAlert size={13} />
          </span>
        )}
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
