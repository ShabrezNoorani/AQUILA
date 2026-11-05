// Chooses a listing's tags: any number of tags of any kind, shown in one group per kind.
// Tags and kinds come from mt_tags; none are written in code. A new tag, of an existing or a
// new kind, can be added inline.

import { useState, type KeyboardEvent } from 'react'
import { createTag } from '../api'
import { hrefFor } from '../router'
import type { Tag } from '../types'
import { Badge, Button, inputClass } from '../ui'
import { groupByKind, kindLabel, kindsOf, tagFormToRow } from './tagMapping'

type Props = {
  /** Prefix for input ids and names, so two pickers on one page don't clash. */
  idPrefix: string
  tags: Tag[]
  selected: string[]
  onChange: (ids: string[]) => void
  error?: string | null
  disabled?: boolean
  /**
   * Called with a tag added inline (new, or an existing one with the same kind and name).
   * Without it, the inline "Add tag" row is not shown.
   */
  onTagCreated?: (tag: Tag) => void
}

/** A selectable pill: the native input stays visible for clarity and keyboard use. */
const pill = (on: boolean) =>
  `flex cursor-pointer items-center gap-2 rounded-card border px-3 py-1.5 text-sm transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${
    on ? 'border-ink-2 bg-paper font-medium text-ink' : 'border-line bg-surface text-ink-2 hover:bg-paper hover:text-ink'}`

export default function TagPicker({ idPrefix, tags, selected, onChange, error, disabled, onTagCreated }: Props) {
  const chosen = new Set(selected)
  const kinds = kindsOf(tags)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState(() => kinds[0] ?? '')
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...selected.filter((s) => s !== id), id] : selected.filter((s) => s !== id))

  async function addTag() {
    // Same rule as the Tags page: same kind and same name (ignoring case and spaces) is the same tag.
    // A kind that does not exist yet is created with the tag.
    const checked = tagFormToRow(newName, newKind)
    if (!checked.ok) {
      setAddError(checked.error)
      return
    }
    setAddError(null)
    setAdding(true)
    try {
      const { tag } = await createTag(checked.row.name, checked.row.kind)
      onTagCreated?.(tag)
      if (!chosen.has(tag.id)) onChange([...selected, tag.id])
      setNewName('')
    } catch (e) {
      setAddError((e as Error).message)
    } finally {
      setAdding(false)
    }
  }

  // Enter in the add row adds the tag instead of submitting the surrounding listing form.
  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void addTag()
    }
  }

  return (
    <div className="space-y-4" aria-describedby={error ? `${idPrefix}-tags-error` : undefined}>
      {tags.length === 0 && (
        <p className="text-sm text-ink-3">
          No tags yet. {onTagCreated ? 'Add one below, or ' : ''}
          <a href={hrefFor.tags()} className="font-medium text-accent hover:underline">
            {onTagCreated ? 'manage them on the Tags page' : 'Add them on the Tags page'}
          </a>.
        </p>
      )}

      {groupByKind(tags).map(({ kind, tags: list }) => (
        <fieldset key={kind} className="space-y-1">
          <legend className="mb-1.5 text-sm font-medium text-ink">{kindLabel(kind)}</legend>
          <div className="flex flex-wrap gap-2">
            {list.map((t) => (
              <label key={t.id} className={pill(chosen.has(t.id))}>
                <input type="checkbox" className="accent-ink" value={t.id} disabled={disabled}
                  checked={chosen.has(t.id)} onChange={(e) => toggle(t.id, e.target.checked)} />
                {t.name}
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      {onTagCreated && (
        <div role="group" aria-label="Add a tag" className="space-y-1.5 border-t border-line pt-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1 space-y-1.5">
              <label htmlFor={`${idPrefix}-new-tag-name`} className="block text-sm font-medium text-ink">New tag</label>
              <input id={`${idPrefix}-new-tag-name`} className={inputClass} value={newName} disabled={disabled || adding}
                onChange={(e) => setNewName(e.target.value)} onKeyDown={onEnter} />
            </div>
            <div className="w-40 space-y-1.5">
              <label htmlFor={`${idPrefix}-new-tag-kind`} className="block text-sm font-medium text-ink">Kind</label>
              <input id={`${idPrefix}-new-tag-kind`} className={inputClass} value={newKind} disabled={disabled || adding}
                list={`${idPrefix}-kinds`} autoComplete="off" placeholder="e.g. place"
                onChange={(e) => setNewKind(e.target.value)} onKeyDown={onEnter} />
              <datalist id={`${idPrefix}-kinds`}>
                {kinds.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
              </datalist>
            </div>
            <Button onClick={addTag} disabled={disabled || adding}>{adding ? 'Adding…' : 'Add'}</Button>
          </div>
          <p className="text-xs text-ink-3">Pick an existing kind or type a new one.</p>
          {addError && <p role="alert" className="text-sm text-negative-deep">{addError}</p>}
        </div>
      )}

      {error && <p role="alert" id={`${idPrefix}-tags-error`} className="text-sm text-negative-deep">{error}</p>}
    </div>
  )
}

/** Small read-only chips showing a listing's tags, each titled with its kind. */
export function TagChips({ tags }: { tags: Tag[] }) {
  if (!tags.length) return <span className="text-sm text-ink-3">No tags</span>
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <Badge key={t.id} data-kind={t.kind} title={`${kindLabel(t.kind)}: ${t.name}`}>{t.name}</Badge>
      ))}
    </span>
  )
}
