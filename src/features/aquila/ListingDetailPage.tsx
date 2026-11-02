import { useEffect, useState, type FormEvent } from 'react'
import {
  countReviews,
  countSnapshots,
  deleteListing,
  fetchListing,
  fetchListingTagIds,
  fetchTags,
  setListingTags,
  updateListing,
} from './api'
import { Field, TextField, inputClass } from './fields'
import { listingFormToRow } from './mapping'
import ReviewsSection from './reviews/ReviewsSection'
import { hrefFor, navigate } from './router'
import SnapshotForm from './SnapshotForm'
import SnapshotList from './SnapshotList'
import { listingTagsError } from './tags/tagMapping'
import TagPicker, { TagChips } from './tags/TagPicker'
import { LISTING_SOURCES, type Listing, type ListingSource, type Tag } from './types'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

type EditForm = { name: string; source: ListingSource; url: string; competitor_name: string; active: boolean }

/** Edits name, source, URL, competitor name and active. Own/competitor is not editable here. */
function EditListingForm({ listing, onSaved, onCancel }: {
  listing: Listing
  onSaved: (updated: Listing) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<EditForm>({
    name: listing.name,
    source: listing.source,
    url: listing.url ?? '',
    competitor_name: listing.competitor_name ?? '',
    active: listing.active,
  })
  const [errors, setErrors] = useState<Partial<Record<keyof EditForm, string>>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]) => setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaveError(null)
    // Same checks as a new listing: name required, known source, http(s) URL.
    const mapped = listingFormToRow({ ...form, is_own: listing.is_own })
    if (!mapped.ok) {
      setErrors(mapped.errors)
      return
    }
    setErrors({})
    setBusy(true)
    try {
      const { name, source, url, competitor_name } = mapped.row
      onSaved(await updateListing(listing.id, { name, source, url, competitor_name, active: form.active }))
    } catch (err) {
      setSaveError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Edit listing" className="max-w-lg space-y-3 rounded border border-slate-700 p-4">
      <h2 className="text-xl font-semibold">Edit listing</h2>
      <TextField id="edit-listing-name" label="Name *" value={form.name}
        onChange={(v) => set('name', v)} error={errors.name} />
      <Field id="edit-listing-source" label="Source" error={errors.source}>
        <select id="edit-listing-source" value={form.source} className={inputClass}
          onChange={(e) => set('source', e.target.value as ListingSource)}>
          {LISTING_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <TextField id="edit-listing-url" label="URL" value={form.url}
        onChange={(v) => set('url', v)} error={errors.url} />
      <TextField id="edit-listing-competitor-name" label="Competitor name" value={form.competitor_name}
        onChange={(v) => set('competitor_name', v)} />
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
        Active
      </label>
      {saveError && <p role="alert" className="text-sm text-red-400">Could not save: {saveError}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="rounded bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50">
          {busy ? 'Saving…' : 'Save listing'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}
          className="rounded border border-slate-500 px-3 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  )
}

/** Shows a listing's tags and edits them. Saving needs exactly one type tag and at least one place tag. */
function ListingTagsSection({ listingId }: { listingId: string }) {
  const [tags, setTags] = useState<Tag[] | null>(null)
  const [saved, setSaved] = useState<string[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>([])
  const [ruleError, setRuleError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    Promise.all([fetchTags(), fetchListingTagIds(listingId)])
      .then(([all, ids]) => {
        if (!live) return
        setTags(all)
        setSaved(ids)
      })
      .catch((e: Error) => live && setLoadError(e.message))
    return () => {
      live = false
    }
  }, [listingId])

  const byId = new Map((tags ?? []).map((t) => [t.id, t]))
  const current = saved.map((id) => byId.get(id)).filter((t): t is Tag => !!t)

  function startEditing() {
    // Only ids of known tags are carried into the editor.
    setDraft(current.map((t) => t.id))
    setRuleError(null)
    setSaveError(null)
    setEditing(true)
  }

  async function save() {
    if (!tags) return
    setSaveError(null)
    const problem = listingTagsError(draft, tags)
    setRuleError(problem)
    if (problem) return
    setBusy(true)
    try {
      await setListingTags(listingId, draft)
      setSaved(draft)
      setEditing(false)
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Tags" className="space-y-2">
      <h2 className="text-xl font-semibold">Tags</h2>
      {loadError && <p role="alert" className="text-sm text-red-400">Could not load tags: {loadError}</p>}
      {!loadError && !tags && <p className="text-sm">Loading tags…</p>}
      {tags && !editing && (
        <div className="flex flex-wrap items-center gap-3">
          <TagChips tags={current} />
          <button type="button" onClick={startEditing}
            className="rounded border border-slate-500 px-3 py-1 text-sm">
            Edit tags
          </button>
        </div>
      )}
      {tags && editing && (
        <div className="max-w-lg space-y-3 rounded border border-slate-700 p-4">
          <TagPicker idPrefix="edit-listing" tags={tags} selected={draft} error={ruleError} disabled={busy}
            onChange={(ids) => {
              setDraft(ids)
              setRuleError(null)
            }} />
          {saveError && <p role="alert" className="text-sm text-red-400">Could not save tags: {saveError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy}
              className="rounded bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50">
              {busy ? 'Saving…' : 'Save tags'}
            </button>
            <button type="button" onClick={() => setEditing(false)} disabled={busy}
              className="rounded border border-slate-500 px-3 py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export default function ListingDetailPage({ id }: { id: string }) {
  const [listing, setListing] = useState<Listing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [confirmCount, setConfirmCount] = useState<{ snapshots: number; reviews: number } | null>(null)
  const [editing, setEditing] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function askToDelete() {
    setDeleteError(null)
    setDeleteBusy(true)
    try {
      const [snapshots, reviews] = await Promise.all([countSnapshots(id), countReviews(id)])
      setConfirmCount({ snapshots, reviews })
    } catch (e) {
      setDeleteError((e as Error).message)
    } finally {
      setDeleteBusy(false)
    }
  }

  async function confirmDelete() {
    setDeleteError(null)
    setDeleteBusy(true)
    try {
      await deleteListing(id)
      navigate(hrefFor.listings())
    } catch (e) {
      setDeleteError((e as Error).message)
      setDeleteBusy(false)
    }
  }

  useEffect(() => {
    let live = true
    fetchListing(id)
      .then((row) => live && setListing(row))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [id])

  return (
    <section className="space-y-8">
      <a href={hrefFor.listings()} className="text-sm underline">← All listings</a>
      {error && <p role="alert" className="text-red-400">Could not load listing: {error}</p>}
      {!error && !listing && <p>Loading…</p>}
      {listing && (
        <>
          <header>
            <h1 className="text-2xl font-bold">{listing.name}</h1>
            <p className="text-sm text-slate-400">
              {listing.is_own ? 'Own' : 'Competitor'} · {listing.source} ·{' '}
              {listing.active ? 'Active' : 'Inactive'}
              {listing.competitor_name && <> · {listing.competitor_name}</>}
            </p>
            {listing.url && (
              <a href={listing.url} target="_blank" rel="noreferrer" className="text-sm underline break-all">
                {listing.url}
              </a>
            )}
            <a href={hrefFor.importPage(listing.id)} className="block text-sm underline">Import from page</a>
          </header>
          <ListingTagsSection listingId={listing.id} />
          {editing ? (
            <EditListingForm listing={listing} onCancel={() => setEditing(false)}
              onSaved={(updated) => {
                setListing(updated)
                setEditing(false)
              }} />
          ) : (
            <button type="button" onClick={() => setEditing(true)}
              className="rounded border border-slate-500 px-3 py-2 text-sm">
              Edit listing
            </button>
          )}
          <div className="space-y-2">
            {confirmCount === null ? (
              <button type="button" onClick={askToDelete} disabled={deleteBusy}
                className="rounded border border-red-500 px-3 py-2 text-sm text-red-400 disabled:opacity-50">
                Delete listing
              </button>
            ) : (
              <div role="alertdialog" aria-label="Confirm delete" className="space-y-2 rounded border border-red-500 p-4">
                <p>
                  Delete “{listing.name}”? This will also delete{' '}
                  {plural(confirmCount.snapshots, 'snapshot', 'snapshots')} and{' '}
                  {plural(confirmCount.reviews, 'review', 'reviews')}. This can’t be undone.
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={confirmDelete} disabled={deleteBusy}
                    className="rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {deleteBusy ? 'Deleting…' : 'Yes, delete listing'}
                  </button>
                  <button type="button" onClick={() => setConfirmCount(null)} disabled={deleteBusy}
                    className="rounded border border-slate-500 px-3 py-2 text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {deleteError && <p role="alert" className="text-sm text-red-400">Could not delete: {deleteError}</p>}
          </div>
          <SnapshotForm listingId={listing.id} onSaved={() => setRefreshKey((k) => k + 1)} />
          <SnapshotList listingId={listing.id} refreshKey={refreshKey} />
          <ReviewsSection listingId={listing.id} />
        </>
      )}
    </section>
  )
}
