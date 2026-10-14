import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, ['VITE_', 'NEXT_PUBLIC_', 'SUPABASE_'])

  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    env.VITE_SUPABASE_URL ||
    env.NEXT_PUBLIC_SUPABASE_URL ||
    env.SUPABASE_URL

  const key =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY

  const define: Record<string, string> = {}
  if (url) {
    define['import.meta.env.VITE_SUPABASE_URL'] = JSON.stringify(url)
  }
  if (key) {
    define['import.meta.env.VITE_SUPABASE_ANON_KEY'] = JSON.stringify(key)
  }

  return {
    plugins: [react()],
    envDir: __dirname,
    envPrefix: ['VITE_', 'NEXT_PUBLIC_', 'SUPABASE_'],
    define
  }
})
