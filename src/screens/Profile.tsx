import * as React from "react"
import {
  Settings, Bell, Sun, Moon, Monitor, Download, Share2, LogOut, ChevronRight, Weight, Target, Calendar, Loader2, RefreshCw,
} from "lucide-react"
import { ScreenHeader } from "@/components/ScreenHeader"
import { Card } from "@/components/ui/card"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useAuth } from "@/lib/auth"
import { useProfile, useStats, usePersonalRecords, clearMyData } from "@/lib/api"
import { APP_VERSION } from "@/lib/version"
import { ProfileEditSheet } from "@/components/ProfileEditSheet"
import { AppearanceSheet } from "@/components/AppearanceSheet"
import { useTheme } from "@/lib/theme"
import { useSwUpdate } from "@/lib/sw-update"

export function Profile() {
  const { signOut, user } = useAuth()
  const { data: profile, refetch: refetchProfile } = useProfile()
  const { data: stats, refetch: refetchStats } = useStats()
  const { data: prs, refetch: refetchPrs } = usePersonalRecords()
  const [editing, setEditing] = React.useState(false)
  const [appearanceOpen, setAppearanceOpen] = React.useState(false)
  const [confirmClear, setConfirmClear] = React.useState(false)
  const [clearing, setClearing] = React.useState(false)
  const [clearError, setClearError] = React.useState<string | null>(null)
  const { checking: checkingUpdate, triggerCheck: checkForUpdates } = useSwUpdate()
  const { mode } = useTheme()
  const appearanceIcon = mode === "dark" ? <Moon /> : mode === "light" ? <Sun /> : <Monitor />
  const appearanceLabel = mode === "dark" ? "Dark" : mode === "light" ? "Light" : "System"

  const doClearData = async () => {
    if (!user) return
    setClearing(true)
    setClearError(null)
    try {
      await clearMyData(user.id)
      setConfirmClear(false)
      refetchStats()
      refetchPrs()
    } catch (e: any) {
      setClearError(e?.message ?? "Failed to clear data")
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Profile" right={
        <button
          onClick={() => setEditing(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary ring-inset-border"
        >
          <Settings className="h-4 w-4" />
        </button>
      } />

      {/* User card */}
      <div className="px-5">
        <Card className="overflow-hidden p-0">
          <div className="px-5 pb-5 pt-5">
            <div className="flex items-center justify-between">
              <Avatar name={profile?.name ?? ""} className="h-20 w-20 text-2xl shadow-soft" />
              <Badge variant="default">PRO</Badge>
            </div>
            <h2 className="mt-3 font-display text-xl font-bold">{profile?.name ?? "—"}</h2>
            <p className="text-xs text-muted-foreground">
              {profile?.handle} {profile?.joined && `· joined ${profile.joined}`}
            </p>

            <div className="mt-4 grid grid-cols-3 divide-x divide-border rounded-xl bg-secondary/60 py-3">
              <Mini label="Workouts" value={`${stats.totalWorkouts}`} />
              <Mini label="Streak" value={`${stats.streak}w`} />
              <Mini label={<span className="normal-case">PRs</span>} value={`${prs.length}`} />
            </div>
          </div>
        </Card>
      </div>

      {/* Body & goal */}
      <div className="px-5">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setEditing(true)} className="text-left">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Weight className="h-3 w-3" /> Bodyweight
              </div>
              <p className="num mt-2 text-2xl font-bold">
                {profile?.weight || "—"}
                {profile?.weight ? <span className="text-sm text-muted-foreground"> kg</span> : null}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {profile?.weight ? "Tap to update" : "Tap to add"}
              </p>
            </Card>
          </button>
          <button onClick={() => setEditing(true)} className="text-left">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Target className="h-3 w-3" /> Goal
              </div>
              <p className="mt-2 text-base font-bold">{profile?.goal ?? "—"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Tap to change</p>
            </Card>
          </button>
        </div>
      </div>

      {/* Settings list */}
      <div className="px-5 pb-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Settings
        </h2>
        <Card className="divide-y divide-border/60 p-0">
          <Row icon={<Bell />} label="Notifications" hint="Coming soon" disabled />
          <Row
            icon={appearanceIcon}
            label="Appearance"
            hint={appearanceLabel}
            onClick={() => setAppearanceOpen(true)}
          />
          <Row icon={<Calendar />} label="Week starts on" hint="Monday" disabled />
          <Row icon={<Download />} label="Export data" hint="Coming soon" disabled />
          <Row icon={<Share2 />} label="Share profile" hint="Coming soon" disabled />
          <Row
            icon={<RefreshCw />}
            label="Check for updates"
            hint={checkingUpdate ? "Checking…" : undefined}
            onClick={checkForUpdates}
            disabled={checkingUpdate}
          />
        </Card>

        <Card className="mt-5 p-0">
          <Row icon={<LogOut />} label="Sign out" variant="destructive" onClick={signOut} />
        </Card>

        <Button
          variant="destructive"
          onClick={() => { setClearError(null); setConfirmClear(true) }}
          disabled={clearing}
          className="mt-5 w-full"
        >
          {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Clear My Data"}
        </Button>

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Forge · v{APP_VERSION}
        </p>
      </div>

      <ProfileEditSheet
        open={editing}
        onOpenChange={setEditing}
        profile={profile}
        onSaved={refetchProfile}
      />

      <AppearanceSheet open={appearanceOpen} onOpenChange={setAppearanceOpen} />

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={(o) => { if (!o) { setConfirmClear(false); setClearError(null) } }}
        title="Clear all your data?"
        description="This permanently deletes your workouts, routines, custom exercises, and any renamed exercise names. Your profile (name, bodyweight, goal) is kept. This can't be undone."
        confirmLabel="Clear everything"
        busy={clearing}
        error={clearError}
        onConfirm={doClearData}
      />

    </div>
  )
}

function Mini({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <p className="num text-base font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  )
}

function Row({
  icon, label, hint, variant, onClick, disabled,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  variant?: "default" | "destructive"
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-secondary/50 disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
          variant === "destructive" ? "bg-destructive/10 text-destructive" : "tint-blue"
        }`}
      >
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      </span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  )
}
