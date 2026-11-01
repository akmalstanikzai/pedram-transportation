import { createClient } from '@supabase/supabase-js'
import { isPublicSupabaseKey } from './operations'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

let configuredClient = null
try {
  if (supabaseUrl && supabaseKey && isPublicSupabaseKey(supabaseKey))
    configuredClient = createClient(supabaseUrl, supabaseKey, {
      global: {
        fetch: (url, options = {}) =>
          fetch(url, {
            ...options,
            signal: AbortSignal.any([options.signal, AbortSignal.timeout(30000)].filter(Boolean)),
          }),
      },
    })
} catch {
  /* Invalid configuration is handled by the login screen. */
}
export const supabase = configuredClient
