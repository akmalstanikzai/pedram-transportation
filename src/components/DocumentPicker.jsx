import {
  BookOpen,
  Camera,
  FileBadge,
  FileCheck2,
  FileSignature,
  FileText,
  HeartPulse,
  IdCard,
  Upload,
  X,
} from 'lucide-react'
import { documentAccept, documentCategories } from '../lib/fleetDocuments'
import { validateFile } from '../lib/operations'

const icons = {
  photos: Camera,
  permit: FileBadge,
  card: IdCard,
  booklet: BookOpen,
  international: FileCheck2,
  identity: IdCard,
  licence: IdCard,
  health: HeartPulse,
  contract: FileSignature,
}

export default function DocumentPicker({
  kind,
  language,
  jobs,
  onChange,
  onError,
  disabled = false,
  expiryDefaults = {},
  registration = false,
  onManage,
}) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const categories = documentCategories[kind]
  return (
    <section className="document-upload-section">
      <div className="document-section-heading">
        <span className="document-section-icon">
          <FileText size={23} />
        </span>
        <div>
          <h3>{t('Documents', 'اسناد')}</h3>
          <p>
            {registration
              ? t(
                  'Choose files here. They will upload when you save this record.',
                  'فایل‌ها را اینجا انتخاب کنید. هنگام ثبت سابقه آپلود می‌شوند.',
                )
              : t(
                  'Choose the document type below, then upload your selected files.',
                  'نوع سند را در پایین انتخاب و فایل‌های انتخاب‌شده را آپلود کنید.',
                )}
          </p>
        </div>
        {onManage && (
          <button
            type="button"
            className="registry-secondary"
            disabled={disabled || jobs.length > 0}
            onClick={onManage}
          >
            <FileText size={16} />
            {t('Manage uploaded documents', 'مدیریت اسناد آپلودشده')}
          </button>
        )}
      </div>
      <p className="document-format-note">
        {t(
          'Documents are optional. PDF or images · up to 20 MB per file.',
          'اسناد اختیاری‌اند. PDF یا تصویر · حداکثر 20 مگابایت برای هر فایل.',
        )}
      </p>
      <div className="document-category-grid">
        {categories.map(([category, en, fa, helpEn, helpFa]) => {
          const Icon = icons[category] || FileText
          const count = jobs.filter((job) => job.category === category).length
          return (
            <div className={`document-category-card ${count ? 'has-files' : ''}`} key={category}>
              <Icon size={22} aria-hidden="true" />
              <h4>{t(en, fa)}</h4>
              <p>{t(helpEn, helpFa)}</p>
              <label className={`document-add-files ${disabled ? 'disabled' : ''}`}>
                <Upload size={15} />
                {t('Add files', 'افزودن فایل‌ها')}
                <input
                  type="file"
                  multiple
                  accept={documentAccept}
                  disabled={disabled}
                  aria-label={`${t('Add', 'افزودن')} ${t(en, fa)}`}
                  onChange={(event) => {
                    try {
                      const files = Array.from(event.target.files || [])
                      files.forEach(validateFile)
                      onChange([
                        ...jobs,
                        ...files.map((file) => ({
                          id: crypto.randomUUID(),
                          file,
                          category,
                          expiry: expiryDefaults[category] || '',
                        })),
                      ])
                      onError(null)
                    } catch (failure) {
                      onError(failure)
                    }
                    event.target.value = ''
                  }}
                />
              </label>
              {count > 0 && (
                <small>
                  {count} {t('selected', 'انتخاب‌شده')}
                </small>
              )}
            </div>
          )
        })}
      </div>
      {jobs.length > 0 && (
        <div className="document-selected-files">
          <h4>
            {t('Selected files', 'فایل‌های انتخاب‌شده')} <span>({jobs.length})</span>
          </h4>
          {jobs.map((job) => {
            const category = categories.find(([key]) => key === job.category)
            const label = category?.[language === 'fa' ? 2 : 1] || job.category
            return (
              <div className="document-selected-row" key={job.id}>
                <FileText size={20} aria-hidden="true" />
                <div className="document-selected-name">
                  <strong>{job.file.name}</strong>
                  <small>
                    {label} · {Math.max(1, Math.ceil(job.file.size / 1024))} KB
                  </small>
                </div>
                <label className="document-selected-expiry">
                  <span>{t('Expiry (optional)', 'تاریخ ختم (اختیاری)')}</span>
                  <input
                    type="date"
                    value={job.expiry}
                    disabled={disabled}
                    aria-label={`${t('Expiry for', 'تاریخ ختم')} ${job.file.name}`}
                    onChange={(event) =>
                      onChange(
                        jobs.map((item) =>
                          item.id === job.id ? { ...item, expiry: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="icon-button"
                  disabled={disabled}
                  aria-label={`${t('Remove selected file', 'حذف فایل انتخاب‌شده')} ${job.file.name}`}
                  onClick={() => onChange(jobs.filter((item) => item.id !== job.id))}
                >
                  <X size={17} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
