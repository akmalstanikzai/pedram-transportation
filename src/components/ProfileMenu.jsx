import { useEffect, useId, useRef, useState } from 'react'
import { Bell, ChevronDown, KeyRound, LogOut, Palette, UserRound } from 'lucide-react'

export default function ProfileMenu({ name, email, roleLabel, language, onSignOut, signingOut }) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const trigger = useRef(null)
  const menuId = useId()
  useEffect(() => {
    if (!open) return undefined
    ref.current.querySelector('[role=menuitem]')?.focus()
    const close = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  function keyboard(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      trigger.current.focus()
      return
    }
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    if (!open) {
      setOpen(true)
      return
    }
    const controls = [...ref.current.querySelectorAll('[role=menuitem]:not(:disabled)')]
    const current = controls.indexOf(document.activeElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? controls.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length
    controls[next]?.focus()
  }
  const items = [
    ['profile', UserRound, t('User Profile', 'پروفایل کاربر')],
    ['notifications', Bell, t('Notification Settings', 'تنظیمات اعلان‌ها')],
    ['security', KeyRound, t('Login & Password', 'ورود و رمز عبور')],
    ['appearance', Palette, t('Appearance & Theme', 'ظاهر و رنگ‌بندی')],
  ]
  return (
    <div
      className="profile-menu"
      ref={ref}
      onKeyDown={keyboard}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="profile-trigger"
        aria-label={t('Open profile menu', 'بازکردن فهرست پروفایل')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="workspace-avatar">{name.charAt(0).toUpperCase()}</span>
        <span className="profile-trigger-name">
          <strong>{name}</strong>
          <small>{roleLabel}</small>
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          className="profile-dropdown"
          id={menuId}
          role="menu"
          aria-label={t('Account menu', 'فهرست حساب')}
        >
          <div className="profile-dropdown-summary">
            <span className="workspace-avatar">{name.charAt(0).toUpperCase()}</span>
            <span>
              <strong>{name}</strong>
              <small>{email}</small>
            </span>
          </div>
          {items.map(([path, Icon, label]) => (
            <a
              key={path}
              role="menuitem"
              href={`#/settings/${path}`}
              onClick={() => setOpen(false)}
            >
              <span>{label}</span>
              <Icon size={17} />
            </a>
          ))}
          <div className="profile-dropdown-divider" />
          <button
            type="button"
            role="menuitem"
            disabled={signingOut}
            onClick={() => {
              setOpen(false)
              void onSignOut()
            }}
          >
            <span>{signingOut ? t('Logging out…', 'در حال خروج…') : t('Log Out', 'خروج')}</span>
            <LogOut size={17} />
          </button>
        </div>
      )}
    </div>
  )
}
