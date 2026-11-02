// Chooses a listing's tags: one type (radio buttons) and any number of places (checkboxes).
// Tags come from mt_tags; none are written in code.

import { hrefFor } from '../router'
import type { Tag } from '../types'
import { Badge } from '../ui'
import { tagsOfKind } from './tagMapping'

type Props = {
  /** Prefix for input ids and names, so two pickers on one page don't clash. */
  idPrefix: string
  tags: Tag[]
  selected: string[]
  onChange: (ids: string[]) => void
  error?: string | null
  disabled?: boolean
}

/** A selectable pill: the native input stays visible for clarity and keyboard use. */
const pill = (on: boolean) =>
  `flex cursor-pointer items-center gap-2 rounded-card border px-3 py-1.5 text-sm transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${
    on ? 'border-ink-2 bg-paper font-medium text-ink' : 'border-line bg-surface text-ink-2 hover:bg-paper hover:text-ink'}`

export default function TagPicker({ idPrefix, tags, selected, onChange, error, disabled }: Props) {
  const types = tagsOfKind(tags, 'type')
  const places = tagsOfKind(tags, 'place')
  const typeIds = new Set(types.map((t) => t.id))
  const chosen = new Set(selected)

  const pickType = (id: string) => onChange([...selected.filter((s) => !typeIds.has(s)), id])
  const togglePlace = (id: string, on: boolean) =>
    onChange(on ? [...selected.filter((s) => s !== id), id] : selected.filter((s) => s !== id))

  const empty = (what: string) => (
    <p className="text-sm text-ink-3">
      No {what} tags yet. <a href={hrefFor.tags()} className="font-medium text-accent hover:underline">Add them on the Tags page</a>.
    </p>
  )

  return (
    <div className="space-y-4" aria-describedby={error ? `${idPrefix}-tags-error` : undefined}>
      <fieldset className="space-y-1">
        <legend className="mb-1.5 text-sm font-medium text-ink">Type * (exactly one)</legend>
        {types.length === 0 ? empty('type') : (
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <label key={t.id} className={pill(chosen.has(t.id))}>
                <input type="radio" className="accent-ink" name={`${idPrefix}-type`} value={t.id} disabled={disabled}
                  checked={chosen.has(t.id)} onChange={() => pickType(t.id)} />
                {t.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="mb-1.5 text-sm font-medium text-ink">Places * (at least one)</legend>
        {places.length === 0 ? empty('place') : (
          <div className="flex flex-wrap gap-2">
            {places.map((t) => (
              <label key={t.id} className={pill(chosen.has(t.id))}>
                <input type="checkbox" className="accent-ink" value={t.id} disabled={disabled}
                  checked={chosen.has(t.id)} onChange={(e) => togglePlace(t.id, e.target.checked)} />
                {t.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {error && <p role="alert" id={`${idPrefix}-tags-error`} className="text-sm text-negative-deep">{error}</p>}
    </div>
  )
}

/** Small read-only chips showing a listing's tags. */
export function TagChips({ tags }: { tags: Tag[] }) {
  if (!tags.length) return <span className="text-sm text-ink-3">No tags</span>
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <Badge key={t.id} data-kind={t.kind} tone={t.kind === 'type' ? 'strong' : 'neutral'}>{t.name}</Badge>
      ))}
    </span>
  )
}
