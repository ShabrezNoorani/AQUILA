// A tag filter grouped by kind: one row per kind ("Type: Walking, Interior", "Place: Paris").
// Several tags can be selected, across any kinds; a listing must carry all of them.

import type { Tag } from '../types'
import { Button } from '../ui'
import { groupByKind, kindLabel } from './tagMapping'

type Props = {
  tags: Tag[]
  selected: string[]
  onChange: (ids: string[]) => void
  /** Accessible name of the whole filter. */
  label?: string
}

export default function TagFilter({ tags, selected, onChange, label = 'Filter by tag' }: Props) {
  if (!tags.length) return null
  const on = new Set(selected)
  const toggle = (id: string) => onChange(on.has(id) ? selected.filter((s) => s !== id) : [...selected, id])
  return (
    <div role="group" aria-label={label} className="space-y-2">
      {groupByKind(tags).map(({ kind, tags: list }) => (
        <div key={kind} role="group" aria-label={kindLabel(kind)} className="flex flex-wrap items-center gap-2">
          <span className="w-20 shrink-0 text-sm font-medium text-ink-3">{kindLabel(kind)}:</span>
          {list.map((t) => (
            <button key={t.id} type="button" aria-pressed={on.has(t.id)} data-kind={t.kind} onClick={() => toggle(t.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                on.has(t.id)
                  ? 'border-accent bg-accent/8 text-accent'
                  : 'border-line bg-surface text-ink-2 hover:bg-paper hover:text-ink'}`}>
              {t.name}
            </button>
          ))}
        </div>
      ))}
      {selected.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-3">Matching all {selected.length} selected tags.</span>
          <Button size="sm" variant="ghost" onClick={() => onChange([])}>Clear</Button>
        </div>
      )}
    </div>
  )
}
