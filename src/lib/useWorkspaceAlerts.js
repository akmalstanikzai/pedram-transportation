import { useCallback, useEffect, useState } from 'react'
import { client } from './api'

export default function useWorkspaceAlerts(days) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ key: '', items: [], error: null })
  const key = `${days}:${attempt}`
  const refresh = useCallback(() => setAttempt((value) => value + 1), [])
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    async function load() {
      try {
        const { data, error } = await client()
          .rpc('workspace_alerts', { p_days: days })
          .abortSignal(controller.signal)
        if (error) throw error
        if (active) setState({ key, items: data || [], error: null })
      } catch (error) {
        if (active) setState({ key, items: [], error })
      }
    }
    void load()
    return () => {
      active = false
      controller.abort()
    }
  }, [days, key])
  useEffect(() => {
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])
  return {
    items: state.key === key ? state.items : [],
    error: state.key === key ? state.error : null,
    loading: state.key !== key,
    refresh,
  }
}
