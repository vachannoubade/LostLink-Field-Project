import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import { validateSupabaseUrl, isPrivilegedCredential } from './config/supabaseUrl.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

  for (const [key, value] of Object.entries(env)) {
    if (isPrivilegedCredential(value)) {
      throw new Error(
        `[LostLink] Refusing to build: privileged credential detected in environment variable "${key}". ` +
          'Never expose service-role keys, database passwords, or secret tokens to the client build.'
      )
    }
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
    build: {
      sourcemap: false
    },
    define
  }
})
