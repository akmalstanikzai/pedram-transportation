import { useRef, useState } from 'react'
import { Bell, Check, KeyRound, Palette, RefreshCw, UserRound } from 'lucide-react'
import { client, rpc } from '../lib/api'
import { getTranslation } from '../lib/i18n'
import { visibleAlerts } from '../lib/workspaceTools'
import NotificationItems from '../components/NotificationItems'
import {
  EmptyState,
  FormField,
  FormSection,
  Loading,
  Notice,
  PageHeading,
} from '../components/Workspace'

export default function SettingsPage({
  language,
  onLanguageChange,
  session,
  profile,
  tab = 'profile',
  preferences,
  onPreferencesChange,
  onProfileUpdated,
  alerts,
}) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const tabs = [
    ['profile', UserRound, t('User Profile', 'پروفایل کاربر')],
    ['notifications', Bell, t('Notification Settings', 'تنظیمات اعلان‌ها')],
    ['security', KeyRound, t('Login & Password', 'ورود و رمز عبور')],
    ['appearance', Palette, t('Appearance & Theme', 'ظاهر و رنگ‌بندی')],
  ]
  const active = tabs.some(([id]) => id === tab) ? tab : 'profile'
  return (
    <>
      <PageHeading
        title={t('Settings', 'تنظیمات')}
        description={t(
          'Manage your personal account and workspace preferences.',
          'حساب شخصی و تنظیمات محیط کاری خود را مدیریت کنید.',
        )}
      />
      <div className="account-settings">
        <nav className="settings-tabs" aria-label={t('Settings sections', 'بخش‌های تنظیمات')}>
          {tabs.map(([id, Icon, label]) => (
            <a
              key={id}
              href={`#/settings/${id}`}
              className={active === id ? 'active' : ''}
              aria-current={active === id ? 'page' : undefined}
            >
              <Icon size={18} />
              {label}
            </a>
          ))}
        </nav>
        <section className="surface-card settings-panel" key={active}>
          {active === 'profile' ? (
            <ProfileSettings
              language={language}
              session={session}
              profile={profile}
              onProfileUpdated={onProfileUpdated}
            />
          ) : active === 'security' ? (
            <SecuritySettings language={language} session={session} profile={profile} />
          ) : active === 'notifications' ? (
            <NotificationSettings
              language={language}
              preferences={preferences}
              onChange={onPreferencesChange}
              alerts={alerts}
            />
          ) : (
            <AppearanceSettings
              language={language}
              onLanguageChange={onLanguageChange}
              preferences={preferences}
              onChange={onPreferencesChange}
            />
          )}
        </section>
      </div>
    </>
  )
}

function ProfileSettings({ language, session, profile, onProfileUpdated }) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const [name, setName] = useState(profile.full_name || '')
  const [phone, setPhone] = useState(profile.phone || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const guard = useRef(false)
  async function save(event) {
    event.preventDefault()
    if (guard.current) return
    guard.current = true
    setBusy(true)
    setSaved(false)
    setError(null)
    try {
      const result = await rpc('update_my_profile', {
        p_full_name: name.trim(),
        p_phone: phone.trim(),
      })
      if (result?.id !== profile.id) throw new Error('ACCESS_DENIED')
      onProfileUpdated(result)
      setName(result.full_name)
      setPhone(result.phone || '')
      setSaved(true)
    } catch (failure) {
      setError(failure)
    } finally {
      guard.current = false
      setBusy(false)
    }
  }
  return (
    <>
      <div className="settings-heading">
        <h2>{t('User Profile', 'پروفایل کاربر')}</h2>
        <p>
          {t(
            'Keep your name and contact details up to date.',
            'نام و مشخصات تماس خود را تازه نگه دارید.',
          )}
        </p>
      </div>
      <div className="account-summary">
        <span className="account-avatar">{(name.trim() || 'U').charAt(0).toUpperCase()}</span>
        <div>
          <strong>{profile.full_name}</strong>
          <small>{session.user.email}</small>
        </div>
      </div>
      <form onSubmit={save}>
        <fieldset disabled={busy}>
          <FormSection title={t('Personal details', 'مشخصات شخصی')}>
            <FormField
              required
              label={t('Full name', 'نام کامل')}
              value={name}
              maxLength={160}
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
            />
            <FormField
              label={t('Phone number', 'شماره تماس')}
              type="tel"
              maxLength={40}
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            <div className="account-fact">
              <span>{t('Role', 'نقش')}</span>
              <strong>{getTranslation(language).roles[profile.role]}</strong>
            </div>
            <div className="account-fact">
              <span>{t('Login', 'شناسه ورود')}</span>
              <strong>{profile.username || session.user.email}</strong>
            </div>
          </FormSection>
        </fieldset>
        <Notice
          error={error}
          message={saved ? t('Your profile has been updated.', 'پروفایل شما تازه شد.') : null}
          language={language}
        />
        <div className="form-actions">
          <button className="registry-primary" disabled={busy}>
            {busy ? t('Saving…', 'در حال ثبت…') : t('Save profile', 'ثبت پروفایل')}
          </button>
        </div>
      </form>
    </>
  )
}

function SecuritySettings({ language, session, profile }) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' })
  const [email, setEmail] = useState({ current: '', next: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState('')
  const guard = useRef(false)
  const managedLogin = session.user.email?.endsWith('@users.pedram.local')
  async function verify(currentPassword) {
    const { data, error: failure } = await client().auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    })
    if (failure) throw new Error('INVALID_CREDENTIALS')
    if (data.user?.id !== session.user.id) {
      await client().auth.signOut({ scope: 'local' })
      throw new Error('ACCESS_DENIED')
    }
  }
  async function save(event, kind) {
    event.preventDefault()
    if (guard.current) return
    guard.current = true
    setBusy(true)
    setError(null)
    setSaved('')
    try {
      if (
        kind === 'password' &&
        (password.next !== password.confirm ||
          password.next.length < 8 ||
          password.next.length > 128)
      )
        throw new Error('PASSWORD_MISMATCH')
      await verify(kind === 'password' ? password.current : email.current)
      const { data: updated, error: failure } = await client().auth.updateUser(
        kind === 'password'
          ? { password: password.next, current_password: password.current }
          : { email: email.next.trim() },
      )
      if (failure) throw failure
      setSaved(
        kind === 'email' && updated.user.email === email.next.trim() ? 'email-updated' : kind,
      )
      if (kind === 'password') setPassword({ current: '', next: '', confirm: '' })
      else setEmail({ current: '', next: '' })
    } catch (failure) {
      setError(failure)
    } finally {
      guard.current = false
      setBusy(false)
    }
  }
  return (
    <>
      <div className="settings-heading">
        <h2>{t('Login & Password', 'ورود و رمز عبور')}</h2>
        <p>
          {t(
            'Confirm your current password before changing login details.',
            'پیش از تغییر مشخصات ورود، رمز عبور فعلی را تأیید کنید.',
          )}
        </p>
      </div>
      <div className="account-fact">
        <span>{t('Current email / login', 'ایمیل یا شناسه ورود فعلی')}</span>
        <strong>
          {profile.username ||
            (managedLogin ? session.user.email.split('@')[0] : session.user.email)}
        </strong>
      </div>
      <Notice
        error={error}
        message={
          saved === 'password'
            ? t('Your password has been changed.', 'رمز عبور شما تغییر کرد.')
            : saved === 'email'
              ? t(
                  'Check your email for any required confirmation. Your login changes after confirmation.',
                  'ایمیل خود را برای تأیید بررسی کنید. شناسه ورود پس از تأیید تغییر می‌کند.',
                )
              : saved === 'email-updated'
                ? t('Your login email has been updated.', 'ایمیل ورود شما تغییر کرد.')
                : null
        }
        language={language}
      />
      <form
        aria-label={t('Change password', 'تغییر رمز عبور')}
        onSubmit={(event) => save(event, 'password')}
      >
        <fieldset disabled={busy}>
          <FormSection title={t('Change password', 'تغییر رمز عبور')}>
            <FormField
              required
              type="password"
              label={t('Current password', 'رمز عبور فعلی')}
              autoComplete="current-password"
              value={password.current}
              onChange={(event) =>
                setPassword((current) => ({ ...current, current: event.target.value }))
              }
              wide
            />
            <FormField
              required
              type="password"
              label={t('New password', 'رمز عبور جدید')}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={password.next}
              onChange={(event) =>
                setPassword((current) => ({ ...current, next: event.target.value }))
              }
            />
            <FormField
              required
              type="password"
              label={t('Confirm new password', 'تأیید رمز عبور جدید')}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={password.confirm}
              onChange={(event) =>
                setPassword((current) => ({ ...current, confirm: event.target.value }))
              }
            />
          </FormSection>
        </fieldset>
        <div className="form-actions">
          <button className="registry-primary" disabled={busy}>
            {t('Update password', 'ثبت رمز عبور')}
          </button>
        </div>
      </form>
      {managedLogin ? (
        <p className="form-help">
          {t(
            'Your username is managed by your administrator. You can change your password here.',
            'نام کاربری توسط مسئول سیستم مدیریت می‌شود. رمز عبور را می‌توانید اینجا تغییر دهید.',
          )}
        </p>
      ) : (
        <form
          aria-label={t('Change email', 'تغییر ایمیل')}
          onSubmit={(event) => save(event, 'email')}
        >
          <fieldset disabled={busy}>
            <FormSection title={t('Change login email', 'تغییر ایمیل ورود')}>
              <FormField
                required
                type="password"
                label={t('Current password', 'رمز عبور فعلی')}
                autoComplete="current-password"
                value={email.current}
                onChange={(event) =>
                  setEmail((current) => ({ ...current, current: event.target.value }))
                }
              />
              <FormField
                required
                type="email"
                label={t('New email address', 'ایمیل جدید')}
                maxLength={254}
                autoComplete="email"
                value={email.next}
                onChange={(event) =>
                  setEmail((current) => ({ ...current, next: event.target.value }))
                }
              />
            </FormSection>
          </fieldset>
          <div className="form-actions">
            <button className="registry-primary" disabled={busy}>
              {t('Update email', 'ثبت ایمیل')}
            </button>
          </div>
        </form>
      )}
    </>
  )
}

function AppearanceSettings({ language, onLanguageChange, preferences, onChange }) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const [error, setError] = useState(null)
  function change(patch) {
    try {
      onChange(patch)
      setError(null)
    } catch (failure) {
      setError(failure)
    }
  }
  return (
    <>
      <div className="settings-heading">
        <h2>{t('Appearance & Theme', 'ظاهر و رنگ‌بندی')}</h2>
        <p>
          {t(
            'Choose how this workspace looks on your browser. Changes are saved automatically.',
            'ظاهر محیط کاری را در این مرورگر انتخاب کنید. تغییرات خودکار ثبت می‌شوند.',
          )}
        </p>
      </div>
      <Notice error={error} language={language} />
      <FormSection title={t('Color theme', 'رنگ‌بندی')}>
        <fieldset className="theme-choices span-full">
          <legend className="sr-only">{t('Color theme', 'رنگ‌بندی')}</legend>
          {[
            ['light', t('Light', 'روشن')],
            ['dark', t('Dark', 'تیره')],
            ['system', t('System', 'سیستم')],
          ].map(([value, label]) => (
            <label
              key={value}
              className={`theme-choice theme-${value} ${preferences.theme === value ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="theme"
                value={value}
                checked={preferences.theme === value}
                onChange={() => change({ theme: value })}
              />
              <span className="theme-preview">
                <i />
                <i />
                <i />
              </span>
              <strong>{label}</strong>
              {preferences.theme === value && <Check size={16} />}
            </label>
          ))}
        </fieldset>
      </FormSection>
      <FormSection title={t('Workspace preferences', 'تنظیمات محیط کاری')}>
        <FormField label={t('Spacing', 'فاصله‌گذاری')}>
          <select
            value={preferences.density}
            onChange={(event) => change({ density: event.target.value })}
          >
            <option value="comfortable">{t('Comfortable', 'معمولی')}</option>
            <option value="compact">{t('Compact', 'فشرده')}</option>
          </select>
        </FormField>
        <FormField label={t('Language', 'زبان')}>
          <select value={language} onChange={(event) => onLanguageChange(event.target.value)}>
            <option value="en">English</option>
            <option value="fa">دری</option>
          </select>
        </FormField>
      </FormSection>
    </>
  )
}

function NotificationSettings({ language, preferences, onChange, alerts }) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const [error, setError] = useState(null)
  function change(patch) {
    try {
      onChange(patch)
      setError(null)
    } catch (failure) {
      setError(failure)
    }
  }
  const items = visibleAlerts(alerts.items, preferences)
  return (
    <>
      <div className="settings-heading">
        <h2>{t('Notification Settings', 'تنظیمات اعلان‌ها')}</h2>
        <p>
          {t(
            'Choose the in-app alerts shown here. Preferences and read status are saved on this browser.',
            'اعلان‌های داخل برنامه را انتخاب کنید. تنظیمات و وضعیت خواندن در این مرورگر ثبت می‌شوند.',
          )}
        </p>
      </div>
      <Notice error={error || alerts.error} language={language} />
      <div className="notification-options">
        <label className="settings-switch">
          <span>
            <strong>{t('Document expiry alerts', 'اعلان ختم اسناد')}</strong>
            <small>
              {t(
                'Expired documents and documents approaching their expiry date.',
                'اسناد منقضی‌شده و اسنادی که به تاریخ ختم نزدیک‌اند.',
              )}
            </small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={preferences.documentAlerts}
            onChange={(event) => change({ documentAlerts: event.target.checked })}
          />
        </label>
        <label className="settings-switch">
          <span>
            <strong>{t('Upcoming booking alerts', 'اعلان بوکینگ‌های آینده')}</strong>
            <small>
              {t(
                'Confirmed and in-transit bookings with a scheduled departure.',
                'بوکینگ‌های تأییدشده و در مسیر با تاریخ حرکت مشخص.',
              )}
            </small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={preferences.bookingAlerts}
            onChange={(event) => change({ bookingAlerts: event.target.checked })}
          />
        </label>
        <FormField label={t('Look ahead', 'بازه زمانی')}>
          <select
            value={preferences.notificationDays}
            onChange={(event) => change({ notificationDays: Number(event.target.value) })}
          >
            {[7, 14, 30].map((days) => (
              <option key={days} value={days}>
                {days} {t('days', 'روز')}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <div className="notification-list-heading">
        <h3>{t('Your alerts', 'اعلان‌های شما')}</h3>
        <div>
          <label className="notification-unread">
            <input
              type="checkbox"
              checked={preferences.unreadOnly}
              onChange={(event) => change({ unreadOnly: event.target.checked })}
            />
            {t('Unread only', 'فقط خوانده‌نشده')}
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label={t('Refresh alerts', 'تازه‌سازی اعلان‌ها')}
            onClick={alerts.refresh}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
      {alerts.loading ? (
        <Loading language={language} />
      ) : alerts.error ? null : !items.length ? (
        <EmptyState
          title={t('No alerts to show', 'اعلانی برای نمایش موجود نیست')}
          description={t(
            'There are no matching alerts for your current preferences.',
            'اعلانی مطابق تنظیمات فعلی موجود نیست.',
          )}
        />
      ) : (
        <NotificationItems
          items={items}
          language={language}
          preferences={preferences}
          onChange={change}
        />
      )}
    </>
  )
}
