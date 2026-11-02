import type { HTMLAttributes, ReactNode } from 'react'

type CardProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  /** Optional heading, shown as an h2 at the top of the card. */
  title?: ReactNode
  /** Optional short text under the title. */
  description?: ReactNode
  /** Optional controls shown on the right of the title. */
  actions?: ReactNode
  /** The element to render. Use "article" for list items, "section" for page sections. */
  as?: 'div' | 'section' | 'article' | 'form'
  padded?: boolean
}

/** A white surface with a soft border and shadow. */
export function Card({ title, description, actions, as = 'div', padded = true, className = '', children, ...rest }: CardProps) {
  const Tag = as
  return (
    <Tag className={`rounded-card border border-line bg-surface shadow-sm shadow-ink/5 ${padded ? 'p-6' : ''} ${className}`.trim()} {...rest}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {description && <p className="text-sm text-ink-3">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  )
}
