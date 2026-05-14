import * as React from "react"
import { Loader2, Trash2 } from "lucide-react"
import { Sheet } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { updateSet, deleteSet } from "@/lib/api"
import type { SetEntry } from "@/lib/types"

export function SetEditorSheet({
  set, exerciseName, onOpenChange, onSaved,
}: {
  set: SetEntry | null
  exerciseName: string
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const open = set !== null
  const [weight, setWeight] = React.useState("")
  const [reps, setReps] = React.useState("")
  const [rest, setRest] = React.useState("")
  const [rpe, setRpe] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!set) return
    setWeight(set.weight ? String(set.weight) : "")
    setReps(set.reps ? String(set.reps) : "")
    setRest(set.rest ? String(set.rest) : "")
    setRpe(set.rpe ? String(set.rpe) : "")
    setError(null)
  }, [set])

  const save = async () => {
    if (!set) return
    setSaving(true)
    setError(null)
    try {
      await updateSet(set.id, {
        weight: Number(weight) || 0,
        reps: Number(reps) || 0,
        rest: rest ? Math.max(0, Math.round(Number(rest))) : null,
        rpe: rpe ? Number(rpe) : null,
      })
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      setError(e?.message ?? "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    if (!set) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteSet(set.id)
      setConfirmDelete(false)
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      setDeleteError(e?.message ?? "Failed to delete")
    } finally {
      setDeleting(false)
    }
  }

  const adjust = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    delta: number,
    min = 0,
  ) => {
    setter((cur) => {
      const n = Math.max(min, (Number(cur) || 0) + delta)
      return n % 1 === 0 ? String(n) : n.toFixed(1)
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={exerciseName || "Edit set"}>
      <div className="flex flex-col gap-4">
        <FieldStepper
          label="Weight (kg)"
          value={weight}
          onChange={setWeight}
          onMinus={() => adjust(setWeight, -2.5)}
          onPlus={() => adjust(setWeight, 2.5)}
        />
        <FieldStepper
          label="Reps"
          value={reps}
          onChange={setReps}
          onMinus={() => adjust(setReps, -1)}
          onPlus={() => adjust(setReps, 1)}
          integer
        />
        <FieldStepper
          label="Rest (seconds, optional)"
          value={rest}
          onChange={setRest}
          onMinus={() => adjust(setRest, -15)}
          onPlus={() => adjust(setRest, 15)}
          integer
        />
        <FieldStepper
          label="RIR (optional)"
          value={rpe}
          onChange={setRpe}
          onMinus={() => adjust(setRpe, -0.5)}
          onPlus={() => adjust(setRpe, 0.5)}
        />

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

        <div className="flex flex-col gap-2 pt-1">
          <Button size="lg" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
          <Button variant="destructive" onClick={() => setConfirmDelete(true)} disabled={deleting}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <><Trash2 className="h-4 w-4" /> Delete set</>
            )}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => { setConfirmDelete(o); if (!o) setDeleteError(null) }}
        title="Delete this set?"
        description="This set will be permanently removed from the workout."
        confirmLabel="Delete"
        busy={deleting}
        error={deleteError}
        onConfirm={doDelete}
      />
    </Sheet>
  )
}

function FieldStepper({
  label, value, onChange, onMinus, onPlus, integer = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onMinus: () => void
  onPlus: () => void
  integer?: boolean
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button
          onClick={onMinus}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-lg font-bold ring-inset-border hover:bg-secondary/70 active:scale-95"
        >
          −
        </button>
        <Input
          type="number"
          inputMode="decimal"
          step={integer ? "1" : "0.5"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="num h-12 flex-1 text-center text-xl font-bold"
        />
        <button
          onClick={onPlus}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-lg font-bold ring-inset-border hover:bg-secondary/70 active:scale-95"
        >
          +
        </button>
      </div>
    </div>
  )
}
