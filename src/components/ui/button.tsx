import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "gradient-primary text-primary-foreground shadow-soft hover:brightness-110",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70 ring-inset-border",
        ghost: "hover:bg-secondary/70 text-foreground",
        outline: "ring-inset-border bg-transparent hover:bg-secondary/50",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/15",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3 text-xs",
        lg: "h-14 px-6 text-base",
        icon: "h-10 w-10",
        pill: "h-8 px-3 text-xs rounded-full",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
)
Button.displayName = "Button"
export { buttonVariants }
