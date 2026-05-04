import { forwardRef } from "react"
import type { ButtonHTMLAttributes } from "react"

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger"
  size?: "sm" | "md" | "lg"
  loading?: boolean
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "primary",
    size = "md",
    loading,
    fullWidth,
    disabled,
    className = "",
    children,
    ...rest
  },
  ref
) {
  const base =
    "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-rust active:scale-[0.98]"
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-5 py-2.5 text-sm",
    lg: "px-6 py-3 text-base",
  }
  const variants = {
    primary: "bg-ink text-cream hover:bg-ink-light shadow-card",
    secondary:
      "bg-cream-dark text-ink hover:bg-stone-200 border border-stone-200/80",
    ghost: "text-ink-muted hover:text-ink hover:bg-cream-dark",
    danger: "bg-red-50 text-red-700 hover:bg-red-100",
  }
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${
        fullWidth ? "w-full" : ""
      } ${className}`}
      {...rest}
    >
      {loading ? (
        <>
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
          Please wait
        </>
      ) : (
        children
      )}
    </button>
  )
})