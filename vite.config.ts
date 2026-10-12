import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { lostLinkAuthPlugin } from './server/authPlugin.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), lostLinkAuthPlugin()],
})
