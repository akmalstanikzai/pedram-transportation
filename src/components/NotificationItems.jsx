import { AlertTriangle, Archive, Bell, CalendarClock, RotateCcw } from 'lucide-react'
import { alertKey, alertSeverity } from '../lib/workspaceTools'
import { kabulToday } from '../lib/cashbook'

export default function NotificationItems({ items, language, preferences, onChange, onNavigate }) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const today = kabulToday()
  return (
    <div className="notification-list">
      {items.map((item) => {
        const key = alertKey(item)
        const read = preferences.readAlerts.includes(key)
        const archived = preferences.archivedAlerts.includes(key)
        const severity = alertSeverity(item, today)
        const Icon =
          severity === 'danger' ? AlertTriangle : severity === 'info' ? CalendarClock : Bell
        return (
          <article
            className={`notification-item ${read ? 'read' : ''}`}
            data-severity={severity}
            key={key}
          >
            <span className="notification-type-icon">
              <Icon size={18} />
            </span>
            <div>
              <a
                href={item.destination}
                onClick={() => {
                  if (!read) onChange({ readAlerts: [...preferences.readAlerts, key] })
                  onNavigate?.()
                }}
              >
                <strong>{item.label}</strong>
              </a>
              <p className="notification-event">
                {item.category === 'documents'
                  ? item.event_date < today
                    ? t('Document expired', 'سند منقضی شده')
                    : t('Document expires', 'تاریخ ختم سند')
                  : t('Scheduled departure', 'حرکت برنامه‌ریزی‌شده')}{' '}
                · <bdi dir="ltr">{item.event_date}</bdi>
              </p>
              {item.category === 'bookings' && <small>{item.detail}</small>}
              <div className="notification-item-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    onChange({
                      readAlerts: read
                        ? preferences.readAlerts.filter((value) => value !== key)
                        : [...preferences.readAlerts, key],
                    })
                  }
                >
                  {read ? t('Mark unread', 'خوانده‌نشده') : t('Mark read', 'خواندم')}
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    onChange({
                      archivedAlerts: archived
                        ? preferences.archivedAlerts.filter((value) => value !== key)
                        : [...preferences.archivedAlerts, key],
                    })
                  }
                >
                  {archived ? <RotateCcw size={13} /> : <Archive size={13} />}
                  {archived ? t('Restore', 'بازگرداندن') : t('Archive', 'بایگانی')}
                </button>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
