import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
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
      workbox: {
        // Precache the app shell (JS, CSS, HTML) so cold starts work offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2}'],
        // Don't let the SW intercept SPA navigations to /api/* style URLs —
        // we don't have any today, but the broader concern is that the
        // built-in nav fallback can shadow runtime caches for HTML.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^https?:\/\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Supabase REST/Postgrest GETs — primary read path. Network-first
            // so the user gets fresh data when online but never sees a
            // failure when briefly offline (cache served instead).
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              /\.supabase\.co$/i.test(url.hostname) &&
              (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/storage/')),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 6,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30d
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Auth endpoints — never cache. We use NetworkOnly so a stale
            // 200 can't impersonate a valid session.
            urlPattern: ({ url }) =>
              /\.supabase\.co$/i.test(url.hostname) && url.pathname.startsWith('/auth/'),
            handler: 'NetworkOnly',
          },
          {
            // Google Fonts — cache aggressively, they're versioned by URL.
            urlPattern: ({ url }) =>
              url.hostname === 'fonts.googleapis.com' ||
              url.hostname === 'fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 365 * 24 * 60 * 60,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Same-origin static assets not in precache (e.g. dynamic images).
            urlPattern: ({ sameOrigin, request }) =>
              sameOrigin && (request.destination === 'image' || request.destination === 'font'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
})
