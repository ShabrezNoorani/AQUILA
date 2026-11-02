// #/tags: lists type and place tags, adds new ones, and deletes them after confirmation.

import { useEffect, useState, type FormEvent } from 'react'
import { countListingsWithTag, createTag, deleteTag, fetchTags } from '../api'
import { Field, TextField, inputClass } from '../fields'
import ConfirmDialog from '../reviews/ConfirmDialog'
import { hrefFor } from '../router'
import { TAG_KINDS, type Tag, type TagKind } from '../types'
import { tagFormToRow, tagsOfKind } from './tagMapping'

const KIND_TITLES: Record<TagKind, string> = { type: 'Type tags', place: 'Place tags' }
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function AddTagForm({ onAdded }: { onAdded: (tag: Tag, existed: boolean) => void }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<TagKind>('type')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const checked = tagFormToRow(name, kind)
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    setBusy(true)
    try {
      const { tag, existed } = await createTag(checked.row.name, checked.row.kind)
      setName('')
      onAdded(tag, existed)
    } catch (err) {
      setError(`Could not save: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Add tag" className="max-w-lg space-y-3 rounded border border-slate-700 p-4">
      <h2 className="text-xl font-semibold">Add a tag</h2>
      <TextField id="tag-name" label="Tag name *" value={name} onChange={setName} error={error ?? undefined} />
      <Field id="tag-kind" label="Kind">
        <select id="tag-kind" value={kind} className={inputClass}
          onChange={(e) => setKind(e.target.value as TagKind)}>
          {TAG_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </Field>
      <button type="submit" disabled={busy}
        className="rounded bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50">
        {busy ? 'Saving…' : 'Add tag'}
      </button>
    </form>
  )
}

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ tag: Tag; count: number } | null>(null)
  const [countError, setCountError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetchTags()
      .then((rows) => live && setTags(rows))
      .catch((e: Error) => live && setLoadError(e.message))
    return () => {
      live = false
    }
  }, [])

  function added(tag: Tag, existed: boolean) {
    setNotice(existed
      ? `“${tag.name}” already exists as a ${tag.kind} tag, so no new tag was added.`
      : `Added “${tag.name}”.`)
    setTags((ts) => [...(ts ?? []).filter((t) => t.id !== tag.id), tag])
  }

  async function askToDelete(tag: Tag) {
    setCountError(null)
    setNotice(null)
    try {
      setConfirm({ tag, count: await countListingsWithTag(tag.id) })
    } catch (e) {
      setCountError((e as Error).message)
    }
  }

  async function confirmDelete(tag: Tag) {
    await deleteTag(tag.id)
    setTags((ts) => (ts ?? []).filter((t) => t.id !== tag.id))
    setConfirm(null)
    setNotice(`Deleted “${tag.name}”.`)
  }

  return (
    <section className="space-y-6">
      <a href={hrefFor.listings()} className="text-sm underline">← All listings</a>
      <h1 className="text-2xl font-bold">Tags</h1>
      {loadError && <p role="alert" className="text-red-400">Could not load tags: {loadError}</p>}
      {!loadError && !tags && <p>Loading…</p>}
      {notice && <p role="status" className="text-sm text-slate-300">{notice}</p>}
      {countError && <p role="alert" className="text-sm text-red-400">Could not check tag use: {countError}</p>}

      {tags && (
        <>
          <AddTagForm onAdded={added} />
          {TAG_KINDS.map((kind) => {
            const list = tagsOfKind(tags, kind)
            return (
              <div key={kind} className="space-y-2">
                <h2 className="text-xl font-semibold">{KIND_TITLES[kind]}</h2>
                {list.length === 0 && <p className="text-sm text-slate-400">None yet.</p>}
                <ul aria-label={KIND_TITLES[kind]} className="space-y-2">
                  {list.map((t) => (
                    <li key={t.id} className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span>{t.name}</span>
                        <button type="button" onClick={() => askToDelete(t)} aria-label={`Delete ${t.name}`}
                          className="rounded border border-red-500 px-2 py-0.5 text-xs text-red-400">
                          Delete
                        </button>
                      </div>
                      {confirm?.tag.id === t.id && (
                        <ConfirmDialog
                          label={`Confirm delete tag ${t.name}`}
                          message={`Delete the ${t.kind} tag “${t.name}”? It is used by ${plural(confirm.count, 'listing', 'listings')}${confirm.count ? ', which will lose this tag' : ''}. This can’t be undone.`}
                          confirmLabel="Yes, delete tag"
                          onConfirm={() => confirmDelete(t)}
                          onCancel={() => setConfirm(null)} />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </>
      )}
    </section>
  )
}
