import { defineConfig, loadEnv } from 'vite'
import { isPublicSupabaseKey } from './src/lib/operations.js'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), 'VITE_')
  const key = environment.VITE_SUPABASE_PUBLISHABLE_KEY
  if (key && !isPublicSupabaseKey(key))
    throw new Error(
      'VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable or anon key. Secret keys must never enter a browser bundle.',
    )
  return {
    plugins: [react(), tailwindcss()],
  }
})
