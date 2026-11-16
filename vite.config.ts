import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import { Readable } from 'node:stream'
import { validateSupabaseUrl, isPrivilegedCredential } from './config/supabaseUrl.ts'
import { createPhotoHandler } from './server/photoAssist.ts'

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

  // Server-only configuration: never add these values to `define` or envPrefix.
  const serverEnv = loadEnv(mode, __dirname, ['GEMINI_API_KEY', 'PHOTO_ASSIST_ENABLED'])
  const photoHandler = createPhotoHandler({ env: () => ({ ...process.env, ...env, ...serverEnv }) })

  return {
    plugins: [react(), {
      name: 'lostlink-photo-api',
      configureServer(server) {
        server.middlewares.use('/api/photo-assist', async (req, res) => {
          const controller = new AbortController()
          res.on('close', () => { if (!res.writableEnded) controller.abort() })
          try {
            const headers = new Headers()
            for (const [key, value] of Object.entries(req.headers)) {
              if (typeof value === 'string') headers.set(key, value)
            }
            const init: RequestInit & { duplex: 'half' } = {
              method: req.method, headers, signal: controller.signal, duplex: 'half',
            }
            if (req.method !== 'GET' && req.method !== 'HEAD') init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>
            const response = await photoHandler(new Request('http://localhost/api/photo-assist', init))
            res.writeHead(response.status, Object.fromEntries(response.headers))
            res.end(await response.text())
          } catch {
            res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
            res.end(JSON.stringify({ error: 'Photo suggestions are temporarily unavailable.' }))
          }
        })
      },
    }],
    envDir: __dirname,
    envPrefix: [],
    build: {
      sourcemap: false
    },
    define
  }
})
