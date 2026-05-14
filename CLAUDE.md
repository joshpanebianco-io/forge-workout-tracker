# Forge — Workout Tracker PWA

Mobile-first PWA for tracking workouts, routines, history, stats, and personal records. Currently runs on **mock data only** — Supabase backend is the next step.

## Stack

- **Vite** + **React 18** + **TypeScript**
- **Tailwind v3** with custom design tokens (HSL CSS vars in `src/index.css`)
- **Hand-rolled shadcn-style primitives** in `src/components/ui/` (no Radix dep yet — Button, Card, Badge, Progress, Input, Avatar, Tabs, Sheet)
- **Recharts** for stats charts
- **lucide-react** for icons
- **vite-plugin-pwa** for installable PWA + manifest

## Design

- **Light mode**, professional, blue/indigo accent palette
- Primary gradient: `#3b82f6 → #6366f1` (blue-500 → indigo-500), exposed via `.gradient-primary` utility
- Background: `#eef2f7` (soft slate-blue), cards on white with `.shadow-card`
- Numerics use Space Grotesk + tabular-nums via `.num` utility
- **Device-frame layout**: on desktop (`md:`+), app renders inside a 412×880 phone bezel with notch + side buttons (`DeviceFrame.tsx`). On mobile/installed PWA it fills the screen.

## File layout

```
src/
  main.tsx                  entry, mounts <App>
  App.tsx                   tab state, screen routing
  index.css                 design tokens + base layer
  lib/
    utils.ts                cn(), formatWeight, relativeDay
    types.ts                Exercise, SetEntry, Workout, Routine, PR types
    mock-data.ts            ALL data is mocked here — REPLACE WITH SUPABASE
  components/
    AppShell.tsx            wraps screen content w/ DeviceFrame + BottomNav
    DeviceFrame.tsx         phone bezel on desktop, fullscreen on mobile
    BottomNav.tsx           5-tab bottom nav (home/workout/history/stats/profile)
    ScreenHeader.tsx        page title + subtitle + optional right slot
    ui/                     shadcn-style primitives
  screens/
    Home.tsx                streak, today's workout, stat tiles, routines, recent PRs
    Workout.tsx             active session: sets/reps/weight, rest timer, finish
    History.tsx             past sessions list
    Stats.tsx               volume bar chart, 1RM line chart, PR list (Tabs)
    Profile.tsx             user card, body stats, settings rows
public/
  favicon.svg, pwa-192.svg, pwa-512.svg   blue dumbbell logo
```

## Conventions

- Path alias `@/*` → `src/*` (configured in `vite.config.ts` + tsconfig)
- All colors via Tailwind tokens (`bg-primary`, `text-foreground`, `ring-inset-border`) — avoid raw hex
- Phone-frame scroll containers use `.phone-scroll` to hide scrollbars
- Numerics: `<span className="num">` for tabular weight/reps
- Bottom nav reserves `pb-28` on main content area
- No comments inside files unless explaining non-obvious *why*

## Running

```bash
npm run dev      # vite dev server on :5173
npm run build    # production build
```

## ⚡ NEXT STEP — Supabase Integration

User has already created a Supabase project. The plan:

### 1. Install Supabase MCP server first
This gives Claude direct DB/auth tools (run SQL, list tables, debug RLS) for the rest of the implementation.

Official package: `@supabase/mcp-server-supabase`

Add to `.claude/settings.local.json` `mcpServers` block (user's home `.claude` dir is `C:\Users\61411\.claude\`):

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest", "--access-token", "<SUPABASE_ACCESS_TOKEN>"]
    }
  }
}
```

User generates a personal access token at https://supabase.com/dashboard/account/tokens. After install, restart Claude Code, verify with `/mcp` that supabase tools appear.

### 2. Schema migration (write once, run via MCP)

Tables (all with `user_id uuid references auth.users(id)` + RLS `user_id = auth.uid()`):
- `exercises` (seed with the 13 from `mock-data.ts`, also user-creatable)
- `routines` (id, name, description, schedule, color, user_id)
- `routine_exercises` (routine_id, exercise_id, order, target_sets, target_reps)
- `workouts` (id, title, started_at, ended_at, duration_min, volume_kg, routine_id, user_id)
- `workout_exercises` (workout_id, exercise_id, order, notes)
- `sets` (workout_exercise_id, set_number, weight_kg, reps, rpe, done, is_pr)
- `personal_records` (user_id, exercise_id, weight_kg, reps, estimated_1rm, achieved_at) — could also be a view

### 3. Client wiring

- `npm i @supabase/supabase-js`
- `.env.local` with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (gitignored)
- `src/lib/supabase.ts` — singleton client
- `src/lib/api/` — typed queries per table
- `src/lib/auth.tsx` — AuthProvider context + `useAuth()` hook + session listener
- Add a `<Login />` screen (email + password to start) gated above `<AppShell>` when no session

### 4. Replace mock data

`src/lib/mock-data.ts` → swap each export for React Query (or SWR) hooks fetching from Supabase. Keep the same shape so screens don't need rewrites.

Auth preference (to confirm with user): **email + password** as the default, magic link / OAuth optional later.

## Memory / behavior notes

- User prefers showing UI before backend wiring — built the visual layer first with mocks, then layered persistence.
- User went with light mode + blue palette after first seeing dark/emerald version.
- Project owner: Josh Panebianco — MNQ futures trader by day (see global memory). Workout tracker is a personal side project.
