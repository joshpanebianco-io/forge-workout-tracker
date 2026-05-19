import * as React from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "./supabase"
import { dropUserCache, dropAllCache } from "./cache"
import { clearMemoryCache } from "./api"

type AuthContextValue = {
  session: Session | null
  user: User | null
  loading: boolean
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signUpWithPassword: (email: string, password: string, name?: string) => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [loading, setLoading] = React.useState(true)
  const lastUserIdRef = React.useRef<string | null | undefined>(undefined)

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      lastUserIdRef.current = data.session?.user.id ?? null
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      const nextUserId = s?.user.id ?? null
      const prevUserId = lastUserIdRef.current

      // Flush all persisted caches when:
      //   - the user explicitly signs out (SIGNED_OUT)
      //   - or the active user id changes (different account on same device)
      // This guarantees we never render user A's cached data while user B is
      // signed in. We intentionally do NOT clear on token refresh.
      if (event === "SIGNED_OUT") {
        clearMemoryCache()
        // Drop everything — we don't know which user the cache belonged to.
        dropAllCache().catch(() => { /* ignore */ })
      } else if (
        prevUserId !== undefined &&
        prevUserId !== nextUserId &&
        prevUserId !== null
      ) {
        clearMemoryCache()
        dropUserCache(prevUserId).catch(() => { /* ignore */ })
      }

      lastUserIdRef.current = nextUserId
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    async signInWithPassword(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error?.message ?? null }
    },
    async signUpWithPassword(email, password, name) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: name ? { name } : undefined },
      })
      return { error: error?.message ?? null }
    },
    async signInWithGoogle() {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      })
      return { error: error?.message ?? null }
    },
    async signOut() {
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
