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
import { listingFormToRow } from './mapping'
import ReviewsSection from './reviews/ReviewsSection'
import { hrefFor, navigate } from './router'
import SnapshotForm from './SnapshotForm'
import SnapshotList from './SnapshotList'
import { listingTagsError } from './tags/tagMapping'
import TagPicker, { TagChips } from './tags/TagPicker'
import { LISTING_SOURCES, SOURCE_LABELS, type Listing, type ListingSource, type Tag } from './types'
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Dialog,
  Field,
  FormError,
  Page,
  Tabs,
  TextField,
  buttonClass,
  dangerSolidClass,
  inputClass,
} from './ui'

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
    <Card title="Edit listing">
      <form onSubmit={handleSubmit} noValidate aria-label="Edit listing" className="space-y-5">
        <TextField id="edit-listing-name" label="Name *" value={form.name}
          onChange={(v) => set('name', v)} error={errors.name} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="edit-listing-source" label="Source" error={errors.source}>
            <select id="edit-listing-source" value={form.source} className={inputClass}
              onChange={(e) => set('source', e.target.value as ListingSource)}>
              {LISTING_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
            </select>
          </Field>
          <TextField id="edit-listing-competitor-name" label="Competitor name" value={form.competitor_name}
            onChange={(v) => set('competitor_name', v)} />
        </div>
        <TextField id="edit-listing-url" label="URL" value={form.url}
          onChange={(v) => set('url', v)} error={errors.url} />
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4 accent-ink" checked={form.active}
            onChange={(e) => set('active', e.target.checked)} />
          Active
        </label>
        {saveError && <FormError>Could not save: {saveError}</FormError>}
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save listing'}
          </Button>
        </div>
      </form>
    </Card>
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
    <Card as="section" aria-label="Tags" title="Tags"
      actions={tags && !editing ? <Button size="sm" onClick={startEditing}>Edit tags</Button> : undefined}>
      {loadError && <FormError>Could not load tags: {loadError}</FormError>}
      {!loadError && !tags && <p className="text-sm text-ink-3">Loading tags…</p>}
      {tags && !editing && <TagChips tags={current} />}
      {tags && editing && (
        <div className="space-y-4">
          <TagPicker idPrefix="edit-listing" tags={tags} selected={draft} error={ruleError} disabled={busy}
            onChange={(ids) => {
              setDraft(ids)
              setRuleError(null)
            }} />
          {saveError && <FormError>Could not save tags: {saveError}</FormError>}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save tags'}
            </Button>
          </div>
        </div>
      )}
    </Card>
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

  if (error) {
    return (
      <Page title="Listing" back={{ href: hrefFor.listings(), label: '← All listings' }}>
        <FormError>Could not load listing: {error}</FormError>
      </Page>
    )
  }

  if (!listing) {
    return (
      <Page title="Listing" back={{ href: hrefFor.listings(), label: '← All listings' }}>
        <p className="text-sm text-ink-3">Loading…</p>
      </Page>
    )
  }

  return (
    <Page title={listing.name} back={{ href: hrefFor.listings(), label: '← All listings' }}
      meta={(
        <>
          <Badge tone={listing.is_own ? 'strong' : 'neutral'}>{listing.is_own ? 'Own' : 'Competitor'}</Badge>
          <Badge tone={listing.active ? 'positive' : 'neutral'}>{listing.active ? 'Active' : 'Inactive'}</Badge>
          <span>{SOURCE_LABELS[listing.source] ?? listing.source}</span>
          {listing.competitor_name && <span>· {listing.competitor_name}</span>}
        </>
      )}
      actions={(
        <>
          <ButtonLink href={hrefFor.importPage(listing.id)}>Import from page</ButtonLink>
          {!editing && <Button onClick={() => setEditing(true)}>Edit listing</Button>}
          <Button variant="danger" onClick={askToDelete} disabled={deleteBusy}>Delete listing</Button>
        </>
      )}>
      {listing.url && (
        <a href={listing.url} target="_blank" rel="noreferrer"
          className="block truncate text-sm font-medium text-accent hover:underline">
          {listing.url}
        </a>
      )}

      {confirmCount !== null && (
        <Dialog label="Confirm delete" title="Delete listing?"
          onClose={deleteBusy ? undefined : () => setConfirmCount(null)}
          actions={(
            <>
              <button type="button" onClick={confirmDelete} disabled={deleteBusy} className={dangerSolidClass()}>
                {deleteBusy ? 'Deleting…' : 'Yes, delete listing'}
              </button>
              <button type="button" onClick={() => setConfirmCount(null)} disabled={deleteBusy}
                className={buttonClass('secondary')}>
                Cancel
              </button>
            </>
          )}>
          <p className="text-ink">
            Delete “{listing.name}”? This will also delete{' '}
            {plural(confirmCount.snapshots, 'snapshot', 'snapshots')} and{' '}
            {plural(confirmCount.reviews, 'review', 'reviews')}. This can’t be undone.
          </p>
          {deleteError && <p role="alert" className="text-sm text-negative-deep">Could not delete: {deleteError}</p>}
        </Dialog>
      )}
      {confirmCount === null && deleteError && <FormError>Could not delete: {deleteError}</FormError>}

      {editing && (
        <EditListingForm listing={listing} onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setListing(updated)
            setEditing(false)
          }} />
      )}

      <Tabs label="Listing sections" tabs={[
        {
          id: 'overview',
          label: 'Overview',
          content: <ListingTagsSection listingId={listing.id} />,
        },
        {
          id: 'snapshots',
          label: 'Snapshots',
          content: (
            <div className="space-y-6">
              <Card>
                <SnapshotForm listingId={listing.id} onSaved={() => setRefreshKey((k) => k + 1)} />
              </Card>
              <SnapshotList listingId={listing.id} refreshKey={refreshKey} />
            </div>
          ),
        },
        { id: 'reviews', label: 'Reviews', content: <ReviewsSection listingId={listing.id} /> },
      ]} />
    </Page>
  )
}
