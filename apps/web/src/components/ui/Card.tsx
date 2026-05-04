import type { HTMLAttributes, ReactNode } from "react"

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
}

export function Card({ children, className = "", ...rest }: Props) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-card border border-stone-100 ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="px-6 py-5 border-b border-stone-100 flex items-start justify-between gap-4">
      <div>
        <h2 className="font-serif text-xl text-ink">{title}</h2>
        {subtitle && <p className="text-sm text-ink-muted mt-1">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`p-6 ${className}`}>{children}</div>
}