import { useCallback, useEffect, useState } from 'react'
import { client } from './api'

export default function useWorkspaceAlerts(days) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ key: '', days: null, items: [], error: null })
  const key = `${days}:${attempt}`
  const refresh = useCallback(() => setAttempt((value) => value + 1), [])
  useEffect(() => {
    let active = true
    let timedOut = false
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 15000)
    async function load() {
      try {
        const { data, error } = await client()
          .rpc('workspace_alerts', { p_days: days })
          .abortSignal(controller.signal)
        if (error) throw error
        if (active) setState({ key, days, items: data || [], error: null })
      } catch (error) {
        if (active)
          setState({ key, days, items: [], error: timedOut ? new Error('NETWORK_ERROR') : error })
      } finally {
        clearTimeout(timeout)
      }
    }
    void load()
    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [days, key])
  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const interval = window.setInterval(refreshVisible, 60000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [refresh])
  return {
    // Preserve the known unread count while refreshing the same date range.
    items: state.days === days && !state.error ? state.items : [],
    error: state.key === key ? state.error : null,
    loading: state.key !== key,
    refresh,
  }
}
