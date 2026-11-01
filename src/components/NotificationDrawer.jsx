import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, RefreshCw, Settings, X } from 'lucide-react'
import { visibleAlerts } from '../lib/workspaceTools'
import { EmptyState, Loading, Notice } from './Workspace'
import NotificationItems from './NotificationItems'

export default function NotificationDrawer({
  id,
  language,
  alerts,
  preferences,
  onPreferencesChange,
  onClose,
}) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const dialogRef = useRef(null)
  const [tab, setTab] = useState('inbox')
  const [category, setCategory] = useState('all')
  const [menu, setMenu] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => {
    const dialog = dialogRef.current
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [])
  const items = visibleAlerts(alerts.items, preferences, { archived: tab === 'archived', category })
  function change(patch) {
    try {
      onPreferencesChange(patch)
      setError(null)
    } catch (failure) {
      setError(failure)
    }
  }
  return (
    <dialog
      ref={dialogRef}
      id={id}
      className="notification-drawer"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          const rect = dialogRef.current.getBoundingClientRect()
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose()
        }
      }}
    >
      <div className="notification-drawer-header">
        <h2 id={`${id}-title`}>{t('Notifications', 'اعلان‌ها')}</h2>
        <div className="notification-drawer-controls">
          <button
            type="button"
            className="icon-button"
            aria-label={t('Refresh notifications', 'تازه‌سازی اعلان‌ها')}
            onClick={alerts.refresh}
            disabled={alerts.loading}
          >
            <RefreshCw size={17} />
          </button>
          <div
            className="notification-options-menu"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setMenu(false)
            }}
          >
            <button
              type="button"
              className="icon-button"
              aria-label={t('Notification options', 'گزینه‌های اعلان')}
              aria-expanded={menu}
              onClick={() => setMenu((value) => !value)}
            >
              <MoreHorizontal size={19} />
            </button>
            {menu && (
              <a href="#/settings/notifications" onClick={onClose}>
                {t('Notification Settings', 'تنظیمات اعلان‌ها')}
                <Settings size={16} />
              </a>
            )}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={t('Close notifications', 'بستن اعلان‌ها')}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
      </div>
      <nav className="notification-tabs" aria-label={t('Notification folders', 'پوشه‌های اعلان')}>
        {[
          ['inbox', t('Inbox', 'صندوق ورودی')],
          ['archived', t('Archived', 'بایگانی')],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={tab === value}
            className={tab === value ? 'active' : ''}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="notification-drawer-body">
        <div className="notification-filters" aria-label={t('Notification types', 'نوع اعلان')}>
          {[
            ['all', t('All Activity', 'تمام فعالیت‌ها')],
            ['documents', t('Documents', 'اسناد')],
            ['bookings', t('Bookings', 'بوکینگ‌ها')],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <Notice error={error || alerts.error} language={language} />
        {alerts.loading ? (
          <Loading language={language} />
        ) : alerts.error ? (
          <div className="notification-retry">
            <button type="button" className="registry-secondary" onClick={alerts.refresh}>
              {t('Try again', 'کوشش مجدد')}
            </button>
          </div>
        ) : !items.length ? (
          <EmptyState
            title={
              tab === 'archived'
                ? t('No archived notifications', 'اعلان بایگانی‌شده موجود نیست')
                : t('You’re all caught up', 'تمام اعلان‌ها بررسی شده‌اند')
            }
            description={t(
              'No alerts match this folder and your notification preferences.',
              'اعلانی مطابق این پوشه و تنظیمات شما موجود نیست.',
            )}
          />
        ) : (
          <NotificationItems
            items={items}
            language={language}
            preferences={preferences}
            onChange={change}
            onNavigate={onClose}
          />
        )}
        <p className="notification-storage-note">
          {t(
            'Read and archive status are saved in this browser.',
            'وضعیت خواندن و بایگانی در این مرورگر ثبت می‌شود.',
          )}
        </p>
      </div>
    </dialog>
  )
}
