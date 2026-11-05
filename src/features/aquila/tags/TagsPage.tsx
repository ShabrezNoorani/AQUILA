// #/tags: lists tags grouped by kind, adds new ones (of an existing or new kind), and deletes them after confirmation.

import { useEffect, useState, type FormEvent } from 'react'
import { countListingsWithTag, createTag, deleteTag, fetchTags } from '../api'
import { hrefFor } from '../router'
import type { Tag } from '../types'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, FormError, Page, TextField, inputClass } from '../ui'
import { groupByKind, kindLabel, kindsOf, tagFormToRow } from './tagMapping'

const kindTitle = (kind: string) => `${kindLabel(kind)} tags`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function AddTagForm({ kinds, onAdded }: { kinds: string[]; onAdded: (tag: Tag, existed: boolean) => void }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState(() => kinds[0] ?? '')
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
      <Field id="tag-kind" label="Kind" help="Pick an existing kind or type a new one, for example place or food.">
        <input id="tag-kind" value={kind} className={inputClass} list="tag-kinds" autoComplete="off"
          aria-describedby="tag-kind-help" onChange={(e) => setKind(e.target.value)} />
        <datalist id="tag-kinds">
          {kinds.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
        </datalist>
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
          <AddTagForm kinds={kindsOf(tags)} onAdded={added} />
          <div className="grid items-start gap-6 md:grid-cols-2">
            {tags.length === 0 && <EmptyState compact title="No tags yet." description="Add the first one here." />}
            {groupByKind(tags).map(({ kind, tags: list }) => {
              return (
                <Card key={kind} padded={false}>
                  <div className="flex items-center justify-between border-b border-line px-6 py-3">
                    <h2 className="text-base font-semibold text-ink">{kindTitle(kind)}</h2>
                    <Badge>{list.length}</Badge>
                  </div>
                  <ul aria-label={kindTitle(kind)} className="divide-y divide-line">
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
