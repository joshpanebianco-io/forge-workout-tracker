import * as React from "react"
import { createPortal } from "react-dom"
import { AlertTriangle, Check } from "lucide-react"
import { Button } from "./button"

export type ConfirmTone = "destructive" | "default" | "info"

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "destructive",
  busy = false,
  error,
  hideCancel = false,
  icon,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
  busy?: boolean
  error?: string | null
  hideCancel?: boolean
  icon?: React.ReactNode
  onConfirm: () => void | Promise<void>
}) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onOpenChange(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, busy, onOpenChange])

  if (!open) return null

  const isDestructive = tone === "destructive"
  const isInfo = tone === "info"

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div
        onClick={() => !busy && onOpenChange(false)}
        className="absolute inset-0 bg-black/60 animate-fade-in"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative w-full max-w-sm rounded-3xl glass ring-inset-border shadow-soft animate-fade-in overflow-hidden"
      >
        <div className="px-6 pt-6 pb-5 flex flex-col items-center text-center gap-3">
          {icon ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              {icon}
            </div>
          ) : isDestructive ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-6 w-6" />
            </div>
          ) : isInfo ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Check className="h-6 w-6" />
            </div>
          ) : null}
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          )}
          {error && (
            <p className="w-full rounded-lg bg-destructive/10 px-3 py-2 text-left text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
        <div className={`grid ${hideCancel ? "grid-cols-1" : "grid-cols-2"} gap-2 px-5 pb-5`}>
          {!hideCancel && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              {cancelLabel}
            </Button>
          )}
          <Button
            variant={isDestructive ? "destructive" : "default"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Please wait…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
