// Shared button looks, so non-<Button> elements (dialog buttons, links) can match.

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md'

const base =
  'inline-flex items-center justify-center gap-1.5 rounded-card font-medium whitespace-nowrap transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-surface shadow-sm shadow-ink/5 hover:bg-accent-deep active:bg-accent-deep',
  secondary: 'border border-line bg-surface text-ink shadow-sm shadow-ink/5 hover:bg-paper',
  danger: 'border border-negative/25 bg-surface text-negative-deep shadow-sm shadow-ink/5 hover:bg-negative/8',
  ghost: 'text-ink-3 hover:bg-paper hover:text-ink',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-sm',
}

/** Classes for a button-looking element. */
export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra = '') {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`.trim()
}

/** A solid "danger" button for the final step of a destructive action. */
export const dangerSolidClass = (size: ButtonSize = 'md') =>
  `${base} ${sizes[size]} bg-negative text-surface shadow-sm shadow-ink/5 hover:bg-negative-deep active:bg-negative-deep`
