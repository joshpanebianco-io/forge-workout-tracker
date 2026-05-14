import { cn } from "@/lib/utils"

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white ring-2 ring-blue-500/15",
        className
      )}
    >
      {initials}
    </div>
  )
}
