import * as React from "react"
import { Dumbbell, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { useAuth } from "@/lib/auth"

type Mode = "signin" | "signup"

export function Login() {
  const { signInWithPassword, signUpWithPassword, signInWithGoogle } = useAuth()
  const [mode, setMode] = React.useState<Mode>("signin")
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [info, setInfo] = React.useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)
    const { error } =
      mode === "signin"
        ? await signInWithPassword(email, password)
        : await signUpWithPassword(email, password, name || undefined)
    setLoading(false)
    if (error) setError(error)
    else if (mode === "signup") setInfo("Check your email to confirm your account.")
  }

  const google = async () => {
    setError(null)
    setLoading(true)
    const { error } = await signInWithGoogle()
    if (error) setError(error)
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="gradient-primary flex h-14 w-14 items-center justify-center rounded-2xl shadow-soft">
            <Dumbbell className="h-7 w-7 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Forge</h1>
            <p className="text-sm text-muted-foreground">Track every rep.</p>
          </div>
        </div>

        <Card className="p-5">
          <div className="mb-4 flex rounded-lg bg-secondary/60 p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
                mode === "signin" ? "bg-card text-foreground shadow-card" : "text-muted-foreground"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
                mode === "signup" ? "bg-card text-foreground shadow-card" : "text-muted-foreground"
              }`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            {mode === "signup" && (
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>
            )}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Password
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
              />
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            {info && (
              <p className="tint-blue rounded-lg px-3 py-2 text-xs">{info}</p>
            )}

            <Button type="submit" disabled={loading} className="mt-1">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button type="button" variant="outline" onClick={google} disabled={loading} className="w-full">
            <GoogleIcon /> Continue with Google
          </Button>
        </Card>

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Forge · v{__APP_VERSION__}
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.7 4.2-5.5 4.2-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.5 14.7 2.5 12 2.5 6.7 2.5 2.5 6.8 2.5 12s4.2 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"/>
    </svg>
  )
}
