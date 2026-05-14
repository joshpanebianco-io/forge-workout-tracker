import * as React from "react"
import { BottomNav, type Tab } from "./BottomNav"
import { DeviceFrame } from "./DeviceFrame"

export function AppShell({
  active,
  onChange,
  children,
}: {
  active: Tab
  onChange: (t: Tab) => void
  children: React.ReactNode
}) {
  return (
    <DeviceFrame>
      <div className="flex h-full flex-col">
        {/* Status bar spacer (notch area on mobile) */}
        <div className="h-[env(safe-area-inset-top)] shrink-0 md:h-9" />
        {/* Scrollable content */}
        <main
          className="phone-scroll relative flex-1 overflow-y-auto"
          style={{ paddingBottom: "calc(7rem + env(safe-area-inset-bottom))" }}
        >
          <div key={active} className="animate-fade-in">
            {children}
          </div>
        </main>
        <BottomNav active={active} onChange={onChange} />
      </div>
    </DeviceFrame>
  )
}
