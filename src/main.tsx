import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './lib/auth.tsx'
import { ThemeProvider } from './lib/theme.tsx'
import { WorkoutSessionProvider } from './lib/session.tsx'

// Browser-side portrait lock — only takes effect in installed PWA / fullscreen.
// In a normal browser tab the call will reject; we swallow it.
const screenOrientation = (window.screen as any)?.orientation
if (screenOrientation?.lock) {
  screenOrientation.lock('portrait').catch(() => { /* unsupported / not fullscreen */ })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <WorkoutSessionProvider>
          <App />
        </WorkoutSessionProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
