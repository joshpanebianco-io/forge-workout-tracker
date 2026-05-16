import * as React from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  children: React.ReactNode
}) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 bg-black/60 animate-fade-in"
      />
      <div
        className={cn(
          "relative w-full max-w-md max-h-[85%] overflow-y-auto rounded-t-3xl sm:rounded-3xl glass ring-inset-border animate-slide-up phone-scroll"
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between bg-card/95 px-5 py-4 ring-inset-border">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary/80 hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body
  )
}
