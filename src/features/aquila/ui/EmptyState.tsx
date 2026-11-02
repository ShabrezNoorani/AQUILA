import type { ReactNode } from 'react'

/** A quiet placeholder for "nothing here yet", with an optional next step. */
export function EmptyState({ title, description, action, compact }: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  /** Smaller padding, for use inside a card. */
  compact?: boolean
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-surface text-center ${compact ? 'px-4 py-6' : 'px-6 py-12'}`}>
      <div aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-paper text-ink-3 ring-1 ring-line">
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.6">
          <rect x="3.5" y="4.5" width="13" height="11" rx="2" />
          <path d="M3.5 8.5h13" />
        </svg>
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-3">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
