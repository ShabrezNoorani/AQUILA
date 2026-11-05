// Chooses a listing's tags: any number of types and any number of places (checkboxes).
// Tags come from mt_tags; none are written in code. A new tag can be added inline.

import { useState, type KeyboardEvent } from 'react'
import { createTag } from '../api'
import { hrefFor } from '../router'
import { TAG_KINDS, type Tag, type TagKind } from '../types'
import { Badge, Button, inputClass } from '../ui'
import { tagFormToRow, tagsOfKind } from './tagMapping'

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

const KIND_LABEL: Record<TagKind, string> = { type: 'Type', place: 'Place' }

export default function TagPicker({ idPrefix, tags, selected, onChange, error, disabled, onTagCreated }: Props) {
  const chosen = new Set(selected)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<TagKind>('type')
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...selected.filter((s) => s !== id), id] : selected.filter((s) => s !== id))

  const empty = (what: string) => (
    <p className="text-sm text-ink-3">
      No {what} tags yet. {onTagCreated ? 'Add one below, or ' : ''}
      <a href={hrefFor.tags()} className="font-medium text-accent hover:underline">
        {onTagCreated ? 'manage them on the Tags page' : 'Add them on the Tags page'}
      </a>.
    </p>
  )

  async function addTag() {
    // Same rule as the Tags page: same kind and same name (ignoring case and spaces) is the same tag.
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

  // Enter in the name box adds the tag instead of submitting the surrounding listing form.
  const onNameKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void addTag()
    }
  }

  const group = (kind: TagKind, legend: string) => {
    const list = tagsOfKind(tags, kind)
    return (
      <fieldset className="space-y-1">
        <legend className="mb-1.5 text-sm font-medium text-ink">{legend}</legend>
        {list.length === 0 ? empty(kind) : (
          <div className="flex flex-wrap gap-2">
            {list.map((t) => (
              <label key={t.id} className={pill(chosen.has(t.id))}>
                <input type="checkbox" className="accent-ink" value={t.id} disabled={disabled}
                  checked={chosen.has(t.id)} onChange={(e) => toggle(t.id, e.target.checked)} />
                {t.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
    )
  }

  return (
    <div className="space-y-4" aria-describedby={error ? `${idPrefix}-tags-error` : undefined}>
      {group('type', 'Types * (at least one)')}
      {group('place', 'Places * (at least one)')}

      {onTagCreated && (
        <div role="group" aria-label="Add a tag" className="space-y-1.5 border-t border-line pt-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1 space-y-1.5">
              <label htmlFor={`${idPrefix}-new-tag-name`} className="block text-sm font-medium text-ink">New tag</label>
              <input id={`${idPrefix}-new-tag-name`} className={inputClass} value={newName} disabled={disabled || adding}
                onChange={(e) => setNewName(e.target.value)} onKeyDown={onNameKey} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${idPrefix}-new-tag-kind`} className="block text-sm font-medium text-ink">Kind</label>
              <select id={`${idPrefix}-new-tag-kind`} className={inputClass} value={newKind} disabled={disabled || adding}
                onChange={(e) => setNewKind(e.target.value as TagKind)}>
                {TAG_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </div>
            <Button onClick={addTag} disabled={disabled || adding}>{adding ? 'Adding…' : 'Add'}</Button>
          </div>
          {addError && <p role="alert" className="text-sm text-negative-deep">{addError}</p>}
        </div>
      )}

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
