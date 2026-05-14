import * as React from "react"

/**
 * Phone-frame wrapper. On desktop, renders a bezeled device viewport
 * centered on screen. On mobile/installed PWA, fills the screen.
 */
export function DeviceFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] w-full text-foreground" style={{ background: "hsl(var(--app-bg))" }}>
      {/* Ambient backdrop */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full bg-blue-400/20 blur-[120px]" />
        <div className="absolute -right-32 top-1/3 h-[420px] w-[420px] rounded-full bg-indigo-400/20 blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 h-[420px] w-[420px] rounded-full bg-sky-300/15 blur-[120px]" />
      </div>

      {/* Mobile: full screen, no frame */}
      <div className="md:hidden relative h-[100dvh] w-full overflow-hidden bg-background">{children}</div>

      {/* Desktop: device frame */}
      <div className="hidden md:flex relative min-h-screen items-center justify-center px-6 py-10">
        <div
          className="relative"
          style={{ width: 412, height: 880 }}
        >
          {/* Bezel */}
          <div className="absolute inset-0 rounded-[56px] bg-gradient-to-b from-zinc-200 to-zinc-400 p-[4px] shadow-[0_30px_80px_-10px_rgba(15,23,42,0.25),0_0_0_1px_rgba(15,23,42,0.04)] dark:from-zinc-700 dark:to-zinc-900">
            <div className="h-full w-full rounded-[52px] bg-zinc-900 p-[10px] dark:bg-black">
              {/* Screen */}
              <div className="relative h-full w-full overflow-hidden rounded-[44px] bg-background">
                {/* Notch */}
                <div className="pointer-events-none absolute left-1/2 top-2 z-50 flex h-7 w-32 -translate-x-1/2 items-center justify-end gap-1 rounded-full bg-zinc-900 px-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
                  <div className="h-2 w-2 rounded-full bg-zinc-800" />
                </div>
                {children}
              </div>
            </div>
          </div>
          {/* Side buttons */}
          <div className="absolute -left-[3px] top-32 h-8 w-[3px] rounded-l-sm bg-zinc-400" />
          <div className="absolute -left-[3px] top-44 h-14 w-[3px] rounded-l-sm bg-zinc-400" />
          <div className="absolute -left-[3px] top-64 h-14 w-[3px] rounded-l-sm bg-zinc-400" />
          <div className="absolute -right-[3px] top-40 h-20 w-[3px] rounded-r-sm bg-zinc-400" />

          {/* Hint label on desktop */}
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] uppercase tracking-[0.3em] text-zinc-400">
            preview · mobile-first PWA
          </div>
        </div>
      </div>
    </div>
  )
}
