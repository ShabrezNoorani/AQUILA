// #/tags: lists type and place tags, adds new ones, and deletes them after confirmation.

import { useEffect, useState, type FormEvent } from 'react'
import { countListingsWithTag, createTag, deleteTag, fetchTags } from '../api'
import { hrefFor } from '../router'
import { TAG_KINDS, type Tag, type TagKind } from '../types'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, FormError, Page, TextField, inputClass } from '../ui'
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
    <form onSubmit={handleSubmit} noValidate aria-label="Add tag"
      className="space-y-4 rounded-card border border-line bg-surface p-6 shadow-sm shadow-ink/5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-ink">Add a tag</h2>
        <p className="text-sm text-ink-3">A name that already exists for the same kind is reused, not duplicated.</p>
      </div>
      <TextField id="tag-name" label="Tag name *" value={name} onChange={setName} error={error ?? undefined} />
      <Field id="tag-kind" label="Kind">
        <select id="tag-kind" value={kind} className={inputClass}
          onChange={(e) => setKind(e.target.value as TagKind)}>
          {TAG_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Add tag'}
        </Button>
      </div>
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
    <Page title="Tags" back={{ href: hrefFor.listings(), label: '← All listings' }}>
      {loadError && <FormError>Could not load tags: {loadError}</FormError>}
      {!loadError && !tags && <p className="text-sm text-ink-3">Loading…</p>}
      {notice && (
        <p role="status" className="rounded-card border border-line bg-surface px-3 py-2 text-sm text-ink-2">{notice}</p>
      )}
      {countError && <FormError>Could not check tag use: {countError}</FormError>}

      {tags && (
        <div className="grid items-start gap-6 lg:grid-cols-[20rem_1fr]">
          <AddTagForm onAdded={added} />
          <div className="grid items-start gap-6 md:grid-cols-2">
            {TAG_KINDS.map((kind) => {
              const list = tagsOfKind(tags, kind)
              return (
                <Card key={kind} padded={false}>
                  <div className="flex items-center justify-between border-b border-line px-6 py-3">
                    <h2 className="text-base font-semibold text-ink">{KIND_TITLES[kind]}</h2>
                    <Badge>{list.length}</Badge>
                  </div>
                  {list.length === 0 && (
                    <div className="p-4"><EmptyState compact title="None yet." /></div>
                  )}
                  <ul aria-label={KIND_TITLES[kind]} className="divide-y divide-line">
                    {list.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 px-6 py-2.5 hover:bg-paper/60">
                        <span className="text-sm text-ink">{t.name}</span>
                        <Button size="sm" variant="ghost" className="text-negative-deep hover:bg-negative/8 hover:text-negative-deep"
                          onClick={() => askToDelete(t)} aria-label={`Delete ${t.name}`}>
                          Delete
                        </Button>
                        {confirm?.tag.id === t.id && (
                          <ConfirmDialog
                            label={`Confirm delete tag ${t.name}`}
                            title="Delete tag?"
                            message={`Delete the ${t.kind} tag “${t.name}”? It is used by ${plural(confirm.count, 'listing', 'listings')}${confirm.count ? ', which will lose this tag' : ''}. This can’t be undone.`}
                            confirmLabel="Yes, delete tag"
                            onConfirm={() => confirmDelete(t)}
                            onCancel={() => setConfirm(null)} />
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </Page>
  )
}
