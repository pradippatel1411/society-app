import { forwardRef } from "react"
import type { InputHTMLAttributes, ReactNode } from "react"

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  error?: string | null
  prefix?: ReactNode
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, prefix, hint, className = "", id, ...rest },
  ref
) {
  const inputId = id || rest.name
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-medium text-ink-light uppercase tracking-wider mb-2"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {prefix && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-ink-muted text-sm pointer-events-none">
            {prefix}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full ${
            prefix ? "pl-12" : "pl-4"
          } pr-4 py-3 bg-white border border-stone-200 rounded-xl text-ink placeholder:text-ink-muted/50 transition-all focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 ${
            error ? "border-red-300 focus:border-red-500 focus:ring-red-100" : ""
          } ${className}`}
          {...rest}
        />
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      {hint && !error && (
        <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>
      )}
    </div>
  )
})