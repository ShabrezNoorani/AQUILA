import type { HTMLAttributes } from 'react'

/**
 * neutral: quiet grey label. strong: the same, with darker text, to set one kind apart.
 * positive / negative: good or bad status. Gold is not used here: it is kept for actions,
 * the active navigation item and key numbers.
 */
export type BadgeTone = 'neutral' | 'strong' | 'positive' | 'negative'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-paper text-ink-2 ring-line',
  strong: 'bg-surface font-semibold text-ink ring-ink-3/40',
  positive: 'bg-positive/10 text-positive-deep ring-positive/25',
  negative: 'bg-negative/8 text-negative-deep ring-negative/25',
}

/** A small rounded label for status, kind or tag. */
export function Badge({ tone = 'neutral', className = '', ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]} ${className}`.trim()}
      {...rest} />
  )
}
