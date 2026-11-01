export function normalizeLogin(value) {
  const login = value.trim().toLowerCase()
  if (!login || login.length > 254) throw new Error('INVALID_LOGIN')
  if (login.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)) throw new Error('INVALID_LOGIN')
    return { email: login, username: null }
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(login)) throw new Error('INVALID_LOGIN')
  return { email: `${login}@users.pedram.local`, username: login }
}
export const normalizePlate = (value) => value.trim().replace(/\s+/g, '').toUpperCase()
export const clean = (data) =>
  Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim() : value,
    ]),
  )
export const canOperate = (role) => ['president', 'vice_president', 'branch_manager'].includes(role)
export const canAccess = (role, module) =>
  module === 'overview' ||
  (module === 'branches'
    ? ['president', 'vice_president', 'branch_manager'].includes(role)
    : module === 'cashbook'
      ? ['president', 'branch_manager'].includes(role)
      : ['vehicles', 'owners', 'drivers', 'bookings'].includes(module)
        ? canOperate(role) || (role === 'driver' && module === 'bookings')
        : role === 'president')
const messages = {
  STORAGE_UNAVAILABLE: [
    'Your browser could not save these preferences. Allow site storage and try again.',
    'مرورگر نتوانست تنظیمات را ثبت کند. ذخیره‌سازی سایت را فعال و دوباره کوشش کنید.',
  ],
  CONFIGURATION: [
    'The connection is not configured. Contact your administrator.',
    'اتصال تنظیم نشده است. با مسئول سیستم تماس بگیرید.',
  ],
  ACCESS_DENIED: [
    'Your account does not have permission for this action.',
    'حساب شما اجازه این کار را ندارد.',
  ],
  ACCOUNT_DISABLED: [
    'This account is disabled. Contact your administrator.',
    'این حساب غیرفعال است. با مسئول سیستم تماس بگیرید.',
  ],
  PROFILE_MISSING: [
    'Your staff profile could not be loaded. Retry or contact your administrator.',
    'پروفایل کاری بارگیری نشد. دوباره کوشش کنید یا با مسئول سیستم تماس بگیرید.',
  ],
  INVALID_LOGIN: [
    'Enter a valid email, or a username with 3–64 letters, digits, dots, hyphens or underscores.',
    'ایمیل معتبر یا نام کاربری 3 تا 64 حرفی با حروف انگلیسی، عدد، نقطه، خط تیره یا زیرخط وارد کنید.',
  ],
  INVALID_CREDENTIALS: [
    'The login or password is incorrect.',
    'نام کاربری یا رمز عبور نادرست است.',
  ],
  REQUIRED_FIELDS: ['Complete all required fields.', 'تمام خانه‌های ضروری را تکمیل کنید.'],
  INVALID_CAPACITY: ['Enter a positive vehicle capacity.', 'ظرفیت مثبت واسطه را وارد کنید.'],
  CAPACITY_EXCEEDED: [
    'The cargo exceeds the selected vehicle capacity.',
    'وزن بار از ظرفیت واسطه بیشتر است.',
  ],
  CAPACITY_REQUIRED: [
    'Set the vehicle capacity before booking by weight.',
    'پیش از ثبت وزن بار، ظرفیت واسطه را تعیین کنید.',
  ],
  RESOURCE_UNAVAILABLE: [
    'The vehicle, owner or driver is inactive, archived, or unavailable.',
    'واسطه، مالک یا راننده غیرفعال، بایگانی یا غیرقابل استفاده است.',
  ],
  RESOURCE_CONFLICT: [
    'This vehicle or driver already has a booking during those dates.',
    'این واسطه یا راننده در این تاریخ‌ها بوکینگ دیگری دارد.',
  ],
  DOCUMENT_EXPIRED: [
    'The vehicle permit or driver licence expires before the journey ends.',
    'جواز واسطه یا لایسنس راننده پیش از پایان سفر منقضی می‌شود.',
  ],
  INVALID_DATES: [
    'Check the booking, departure and expected arrival dates.',
    'تاریخ بوکینگ، حرکت و رسیدن را بررسی کنید.',
  ],
  INVALID_MEASUREMENT: [
    'Enter positive weight or volume, with up to three decimal places.',
    'وزن یا حجم مثبت با حداکثر سه رقم اعشار وارد کنید.',
  ],
  INVALID_TRANSITION: [
    'That booking status change is not allowed.',
    'این تغییر وضعیت بوکینگ مجاز نیست.',
  ],
  RECORD_LOCKED: [
    'Only confirmed bookings can be edited. Completed and cancelled records are retained.',
    'فقط بوکینگ تأییدشده قابل ویرایش است. سوابق تکمیل و لغوشده حفظ می‌شوند.',
  ],
  RECORD_IN_USE: [
    'This record is used by active bookings or fleet records. Resolve those first.',
    'این سابقه در بوکینگ‌ها یا وسایط فعال استفاده می‌شود. ابتدا آن موارد را بررسی کنید.',
  ],
  STALE_RECORD: [
    'Someone changed this record. Close the form, refresh and try again.',
    'این سابقه تغییر کرده است. فورم را بسته، فهرست را تازه و دوباره کوشش کنید.',
  ],
  REQUEST_CONFLICT: [
    'This saved request has different details. Refresh before trying again.',
    'معلومات این درخواست تغییر کرده است. ابتدا فهرست را تازه‌سازی کنید.',
  ],
  INVALID_FILE: [
    'Choose an accepted document up to 20 MB.',
    'یک سند با نوع مجاز و حداکثر حجم 20 مگابایت انتخاب کنید.',
  ],
  MANAGER_ASSIGNED: [
    'That manager already manages another active branch.',
    'این مدیر مسئول شعبه فعال دیگری است.',
  ],
  DUPLICATE_RECORD: [
    'A record with this plate, login or identifier already exists.',
    'سابقه‌ای با این پلیت، نام کاربری یا شناسه موجود است.',
  ],
  NETWORK_ERROR: [
    'The request could not be confirmed. Check your connection and retry the same request.',
    'درخواست تأیید نشد. اتصال را بررسی و همان درخواست را دوباره ارسال کنید.',
  ],
  SCHEMA_REQUIRED: [
    'The app and Supabase database are on different versions. An administrator must apply the pending database migrations, then refresh this page.',
    'نسخه برنامه و دیتابیس یکسان نیست. مسئول سیستم باید به‌روزرسانی‌های دیتابیس را اجرا کند؛ سپس این صفحه را تازه‌سازی کنید.',
  ],
  PASSWORD_MISMATCH: [
    'Passwords must match and contain at least 8 characters.',
    'رمزهای عبور باید یکسان و حداقل 8 حرف باشند.',
  ],
  PROVISIONING_REVIEW_REQUIRED: [
    'Account setup could not be confirmed. Contact your administrator with this request before creating another account.',
    'ایجاد حساب تأیید نشد. پیش از ایجاد حساب دیگر، با مسئول سیستم تماس بگیرید.',
  ],
  UNKNOWN_ERROR: [
    'The operation failed. Try again or contact your administrator.',
    'عملیات انجام نشد. دوباره کوشش کنید یا با مسئول سیستم تماس بگیرید.',
  ],
}
export function errorCode(error) {
  const message = typeof error === 'string' ? error : error?.message || ''
  const known = Object.keys(messages).find((key) => message.includes(key))
  if (known) return known
  if (['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error?.code))
    return 'SCHEMA_REQUIRED'
  if (error?.code === '23505') return 'DUPLICATE_RECORD'
  if (['23514', '22P02', '22007', '22008', '22003'].includes(error?.code)) return 'REQUIRED_FIELDS'
  if (error?.code === '23503') return 'RESOURCE_UNAVAILABLE'
  if (error?.code === '42501') return 'ACCESS_DENIED'
  if (/fetch|network|timeout|FunctionsFetchError/i.test(message)) return 'NETWORK_ERROR'
  return 'UNKNOWN_ERROR'
}
export const errorText = (error, language) => messages[errorCode(error)][language === 'fa' ? 1 : 0]
export const fileTypes = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
}
export function validateFile(file) {
  const extension = file.name.split('.').pop().toLowerCase()
  if (
    !fileTypes[extension] ||
    !file.size ||
    file.size > 20 * 1024 * 1024 ||
    (file.type && file.type !== fileTypes[extension])
  )
    throw new Error('INVALID_FILE')
  return fileTypes[extension]
}

export function isPublicSupabaseKey(key) {
  if (key.startsWith('sb_publishable_')) return true
  try {
    return JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'
  } catch {
    return false
  }
}
