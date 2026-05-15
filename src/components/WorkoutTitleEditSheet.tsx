import * as React from "react"
import { Loader2 } from "lucide-react"
import { Sheet } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { updateWorkoutTitle } from "@/lib/api"

export function WorkoutTitleEditSheet({
  open, onOpenChange, workoutId, currentTitle, onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  workoutId: string | null
  currentTitle: string
  onSaved: () => void
}) {
  const [title, setTitle] = React.useState(currentTitle)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setTitle(currentTitle)
      setError(null)
    }
  }, [open, currentTitle])

  const save = async () => {
    if (!workoutId) return
    const trimmed = title.trim()
    if (!trimmed) { setError("Title required"); return }
    if (trimmed === currentTitle) { onOpenChange(false); return }
    setSaving(true)
    setError(null)
    try {
      await updateWorkoutTitle(workoutId, trimmed)
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      setError(e?.message ?? "Failed to rename")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Rename workout">
      <div className="flex flex-col gap-4">
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); save() }
          }}
          placeholder="Workout title"
        />
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        )}
        <Button onClick={save} disabled={saving} size="lg" className="w-full">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
      </div>
    </Sheet>
  )
}
