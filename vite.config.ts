import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'path'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

const PATCH_BASELINE_COMMITS = 9

let commitCount = 0
try {
  commitCount = parseInt(execSync('git rev-list --count HEAD').toString().trim(), 10) || 0
} catch {
  commitCount = 0
}
const patch = Math.max(0, commitCount - PATCH_BASELINE_COMMITS)
const [major, minor] = pkg.version.split('.').map((n) => parseInt(n, 10) || 0)
const APP_VERSION = `${major}.${minor}.${patch}`

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'apple-touch-icon-precomposed.png'],
      manifest: {
        name: 'Forge — Workout Tracker',
        short_name: 'Forge',
        description: 'Track workouts, routines, PRs and progress.',
        theme_color: '#eef2f7',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
