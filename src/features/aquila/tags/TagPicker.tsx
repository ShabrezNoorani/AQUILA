// Chooses a listing's tags: one type (radio buttons) and any number of places (checkboxes).
// Tags come from mt_tags; none are written in code.

import { hrefFor } from '../router'
import type { Tag } from '../types'
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

export default function TagPicker({ idPrefix, tags, selected, onChange, error, disabled }: Props) {
  const types = tagsOfKind(tags, 'type')
  const places = tagsOfKind(tags, 'place')
  const typeIds = new Set(types.map((t) => t.id))
  const chosen = new Set(selected)

  const pickType = (id: string) => onChange([...selected.filter((s) => !typeIds.has(s)), id])
  const togglePlace = (id: string, on: boolean) =>
    onChange(on ? [...selected.filter((s) => s !== id), id] : selected.filter((s) => s !== id))

  const empty = (what: string) => (
    <p className="text-sm text-slate-400">
      No {what} tags yet. <a href={hrefFor.tags()} className="underline">Add them on the Tags page</a>.
    </p>
  )

  return (
    <div className="space-y-3" aria-describedby={error ? `${idPrefix}-tags-error` : undefined}>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Type * (exactly one)</legend>
        {types.length === 0 ? empty('type') : (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {types.map((t) => (
              <label key={t.id} className="flex items-center gap-2">
                <input type="radio" name={`${idPrefix}-type`} value={t.id} disabled={disabled}
                  checked={chosen.has(t.id)} onChange={() => pickType(t.id)} />
                {t.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Places * (at least one)</legend>
        {places.length === 0 ? empty('place') : (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {places.map((t) => (
              <label key={t.id} className="flex items-center gap-2">
                <input type="checkbox" value={t.id} disabled={disabled}
                  checked={chosen.has(t.id)} onChange={(e) => togglePlace(t.id, e.target.checked)} />
                {t.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {error && <p role="alert" id={`${idPrefix}-tags-error`} className="text-sm text-red-400">{error}</p>}
    </div>
  )
}

/** Small read-only chips showing a listing's tags. */
export function TagChips({ tags }: { tags: Tag[] }) {
  if (!tags.length) return <span className="text-slate-500">No tags</span>
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t.id} data-kind={t.kind}
          className={`rounded px-2 py-0.5 text-xs ${t.kind === 'type' ? 'bg-sky-800' : 'bg-emerald-800'}`}>
          {t.name}
        </span>
      ))}
    </span>
  )
}
