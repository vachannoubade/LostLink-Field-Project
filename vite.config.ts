import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import { validateSupabaseUrl } from './config/supabaseUrl.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const isServiceRoleKey = (key: string | undefined): boolean => {
  if (!key) return false
  if (key.startsWith('sb_secret_')) return true

  const parts = key.split('.')
  if (parts.length !== 3) return false

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      role?: unknown
    }
    return payload.role === 'service_role' || payload.role === 'supabase_service_role'
  } catch {
    return false
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY'
  ])

  const rawSupabaseUrl = env.VITE_SUPABASE_URL?.trim()
  let supabaseUrl: string | undefined
  if (rawSupabaseUrl) {
    const validation = validateSupabaseUrl(rawSupabaseUrl, {
      allowLocalhost: mode === 'development'
    })
    if (!validation.valid) {
      throw new Error(`[LostLink] ${validation.error}`)
    }
    supabaseUrl = validation.url
  }

  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY?.trim()
  const supabasePublishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

  if (isServiceRoleKey(supabaseAnonKey) || isServiceRoleKey(supabasePublishableKey)) {
    throw new Error(
      '[LostLink] Refusing to build with a Supabase service-role or secret key in a public VITE_ variable. ' +
        'Use only the anon or publishable key in the browser.'
    )
  }

  const define: Record<string, string> = {}
  if (supabaseUrl) {
    define['import.meta.env.VITE_SUPABASE_URL'] = JSON.stringify(supabaseUrl)
  }
  if (supabaseAnonKey) {
    define['import.meta.env.VITE_SUPABASE_ANON_KEY'] = JSON.stringify(supabaseAnonKey)
  }
  if (supabasePublishableKey) {
    define['import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY'] = JSON.stringify(supabasePublishableKey)
  }

  return {
    plugins: [react()],
    envDir: __dirname,
    envPrefix: [],
    define
  }
})
