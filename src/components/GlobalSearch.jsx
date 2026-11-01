import { useEffect, useId, useRef, useState } from 'react'
import { ArrowUpRight, Search, X } from 'lucide-react'
import { client } from '../lib/api'
import { categoryLabel, searchCategories } from '../lib/workspaceTools'
import { errorText } from '../lib/operations'

export default function GlobalSearch({ language, role }) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [response, setResponse] = useState({ key: '', results: [], error: null })
  const wrapper = useRef(null)
  const input = useRef(null)
  const listId = useId()
  const term = query.trim()
  const key = `${category}:${term}`
  const eligible = term.length >= 2
  const current = response.key === key
  const results = current ? response.results : []
  useEffect(() => {
    if (!eligible) return undefined
    let active = true
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await client()
          .rpc('search_workspace', { p_query: term, p_category: category, p_limit: 30 })
          .abortSignal(controller.signal)
        if (error) throw error
        if (active) setResponse({ key, results: data || [], error: null })
      } catch (error) {
        if (active) setResponse({ key, results: [], error })
      }
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [eligible, term, category, key, attempt])
  useEffect(() => {
    const close = (event) => {
      if (!wrapper.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  useEffect(() => {
    if (open && results.length)
      document
        .getElementById(`${listId}-${Math.min(activeIndex, results.length - 1)}`)
        ?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex, results.length, listId])
  function navigate(result) {
    setOpen(false)
    setQuery('')
    // Destinations are restricted to this workspace, even if a response is malformed.
    if (
      /^#\/(vehicles|owners|drivers|branches|bookings|cashbook)(\/|\?|$)/.test(result.destination)
    )
      window.location.hash = result.destination
  }
  function keyboard(event) {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) =>
        results.length
          ? (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length
          : 0,
      )
    }
    if (event.key === 'Enter' && open && results.length) {
      event.preventDefault()
      navigate(results[Math.min(activeIndex, results.length - 1)])
    }
  }
  return (
    <div className="global-search" ref={wrapper}>
      <div className="global-search-field">
        <Search size={18} />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-label={t('Search Pedram', 'جستجو در پدرام')}
          placeholder={t('Search Pedram…', 'جستجو در پدرام…')}
          autoComplete="off"
          maxLength={100}
          value={query}
          aria-autocomplete="list"
          aria-expanded={open && eligible}
          aria-controls={listId}
          aria-activedescendant={
            open && results.length
              ? `${listId}-${Math.min(activeIndex, results.length - 1)}`
              : undefined
          }
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            setActiveIndex(0)
          }}
          onKeyDown={keyboard}
        />
        {query && (
          <button
            type="button"
            className="search-clear"
            aria-label={t('Clear search', 'پاک‌کردن جستجو')}
            onClick={() => {
              setQuery('')
              setOpen(false)
              input.current.focus()
            }}
          >
            <X size={14} />
          </button>
        )}
        <select
          aria-label={t('Search category', 'نوع جستجو')}
          value={category}
          onChange={(event) => {
            setCategory(event.target.value)
            setOpen(true)
            setActiveIndex(0)
            input.current.focus()
          }}
        >
          {searchCategories(role).map((item) => (
            <option key={item} value={item}>
              {categoryLabel(item, language)}
            </option>
          ))}
        </select>
      </div>
      {open && eligible && (
        <div className="global-search-results">
          <div className="global-search-caption">
            {t('SEARCH RESULTS', 'نتایج جستجو')}
            <span>{categoryLabel(category, language)}</span>
          </div>
          {!current ? (
            <p role="status">{t('Searching…', 'در حال جستجو…')}</p>
          ) : response.error ? (
            <div className="search-error" role="alert">
              <p>{errorText(response.error, language)}</p>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setResponse({ key: '', results: [], error: null })
                  setAttempt((value) => value + 1)
                }}
              >
                {t('Try again', 'کوشش مجدد')}
              </button>
            </div>
          ) : !results.length ? (
            <p role="status">
              {t(
                'No matching records. Try another name, plate, phone or booking number.',
                'سابقه‌ای یافت نشد. نام، پلیت، شماره تماس یا شماره بوکینگ دیگری را جستجو کنید.',
              )}
            </p>
          ) : (
            <>
              <div role="listbox" id={listId} aria-label={t('Search results', 'نتایج جستجو')}>
                {results.map((result, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    id={`${listId}-${index}`}
                    tabIndex={-1}
                    className={index === activeIndex ? 'active' : ''}
                    key={`${result.category}:${result.id}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => navigate(result)}
                  >
                    <span className="search-result-category">
                      {categoryLabel(result.category, language)}
                    </span>
                    <span className="search-result-text">
                      <strong>{result.label}</strong>
                      <small>{result.detail}</small>
                    </span>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
              {results.length === 30 && (
                <p className="search-limit">
                  {t(
                    'Showing 30 matches. Refine your search for more precise results.',
                    '30 نتیجه نمایش داده شد. برای نتایج دقیق‌تر جستجو را محدود کنید.',
                  )}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
