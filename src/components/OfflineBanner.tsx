import { CloudOff } from "lucide-react"
import { useNetworkStatus } from "@/lib/network"

export function OfflineBanner() {
  const { online } = useNetworkStatus()
  if (online) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center px-3 pt-[max(env(safe-area-inset-top),8px)]">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-sm">
        <CloudOff className="h-3.5 w-3.5" />
        <span>Offline — changes will sync when you reconnect</span>
      </div>
    </div>
  )
}
