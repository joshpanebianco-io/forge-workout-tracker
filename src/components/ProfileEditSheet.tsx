import * as React from "react"
import { Loader2 } from "lucide-react"
import { Sheet } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { updateProfile, type Profile } from "@/lib/api"

const GOALS = ["Strength", "Hypertrophy", "Endurance", "General fitness"]

export function ProfileEditSheet({
  open, onOpenChange, profile, onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  profile: Profile | null
  onSaved: () => void
}) {
  const { user } = useAuth()
  const [name, setName] = React.useState("")
  const [handle, setHandle] = React.useState("")
  const [bodyweight, setBodyweight] = React.useState("")
  const [goal, setGoal] = React.useState<string>("Strength")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setName(profile?.name ?? "")
    setHandle(profile?.handle?.replace(/^@/, "") ?? "")
    setBodyweight(profile?.weight ? String(profile.weight) : "")
    setGoal(profile?.goal ?? "Strength")
    setError(null)
  }, [open, profile])

  const save = async () => {
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      const bw = bodyweight ? Number(bodyweight) : null
      await updateProfile(user.id, {
        name: name.trim() || undefined,
        handle: handle.trim() ? `@${handle.replace(/^@/, "")}` : undefined,
        bodyweight_kg: bw,
        goal,
      })
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      setError(e?.message ?? "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Edit profile">
      <div className="flex flex-col gap-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </Field>
        <Field label="Handle">
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">@</span>
            <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="joshp" />
          </div>
        </Field>
        <Field label="Bodyweight (kg)">
          <Input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={bodyweight}
            onChange={(e) => setBodyweight(e.target.value)}
            placeholder="80.0"
          />
        </Field>
        <Field label="Goal">
          <div className="grid grid-cols-2 gap-2">
            {GOALS.map((g) => (
              <button
                key={g}
                onClick={() => setGoal(g)}
                className={`rounded-xl px-3 py-2.5 text-xs font-semibold ring-inset-border transition-colors ${
                  goal === g
                    ? "bg-primary/10 text-primary ring-2 ring-primary"
                    : "bg-card hover:bg-secondary/40"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </Field>

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

        <Button onClick={save} disabled={saving} size="lg" className="mt-2 w-full">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
      </div>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
