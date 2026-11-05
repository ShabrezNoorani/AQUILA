import { useEffect, useState, type FormEvent } from 'react'
import {
  countReviews,
  countSnapshots,
  createCompany,
  deleteListing,
  setCompanyOwn,
  fetchCompanies,
  fetchListing,
  fetchListingTagIds,
  fetchTags,
  setListingTags,
  updateListing,
} from './api'
import CompanyField from './companies/CompanyField'
import { findCompanyByName, listingFormToRow, listingRowToForm, normaliseCompanyName } from './mapping'
import ReviewsSection from './reviews/ReviewsSection'
import { hrefFor, navigate } from './router'
import SnapshotForm from './SnapshotForm'
import SnapshotList from './SnapshotList'
import { withTag } from './tags/tagMapping'
import TagPicker, { TagChips } from './tags/TagPicker'
import { LISTING_SOURCES, SOURCE_LABELS, type Company, type Listing, type ListingSource, type Tag } from './types'
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

type EditForm = {
  name: string
  source: ListingSource
  url: string
  active: boolean
  company: string
  is_own: boolean
}

/**
 * Edits name, company, OWN, source, URL and active. The company is the only field that says who
 * owns the listing. Only shown once the companies have loaded, so the company box never starts
 * wrongly empty. A listing with no company yet starts with its old competitor_name in the
 * Company box, so one Save links it; that old column is never shown or changed.
 */
function EditListingForm({ listing, companies, onSaved, onCancel }: {
  listing: Listing
  companies: Company[]
  onSaved: (updated: Listing, company: Company | null) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<EditForm>(() => {
    const start = listingRowToForm(listing, companies)
    return {
      name: start.name,
      source: start.source,
      url: start.url,
      active: listing.active,
      company: start.company,
      is_own: start.is_own,
    }
  })
  const [errors, setErrors] = useState<Partial<Record<keyof EditForm, string>>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]) => setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaveError(null)
    // Same checks as a new listing: name required, known source, http(s) URL.
    const mapped = listingFormToRow(form)
    if (!mapped.ok) {
      setErrors(mapped.errors)
      return
    }
    setErrors({})
    setBusy(true)
    try {
      const { name, source, url } = mapped.row
      // An empty company box leaves the listing unassigned. Otherwise the company with the same
      // name (ignoring capitals, extra spaces and trailing dots) is reused, or created with the
      // OWN tick. If the tick differs from an existing company's OWN marker, the company is updated,
      // because OWN belongs to the company.
      let company: Company | null = null
      if (normaliseCompanyName(form.company)) {
        const found = await createCompany(form.company, form.is_own)
        company = found.company
        if (found.existed && found.company.is_own !== form.is_own) company = await setCompanyOwn(company.id, form.is_own)
      }
      const updated = await updateListing(listing.id, {
        name, is_own: form.is_own, source, url, active: form.active, company_id: company?.id ?? null,
      })
      onSaved(updated, company)
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
        <CompanyField id="edit-listing-company" label="Company" value={form.company} companies={companies}
          help="Pick an existing company or type a new one. Leave empty for unassigned."
          onChange={(v) => {
            set('company', v)
            // Picking an existing company shows its OWN marker.
            const match = findCompanyByName(companies, v)
            if (match) set('is_own', match.is_own)
          }} />
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input type="checkbox" className="h-4 w-4 accent-ink" checked={form.is_own} aria-describedby="edit-listing-own-help"
              onChange={(e) => set('is_own', e.target.checked)} />
            This is ours (OWN)
          </label>
          <p id="edit-listing-own-help" className="text-xs text-ink-3">Ticked = our own company. Not ticked = competitor.</p>
        </div>
        <Field id="edit-listing-source" label="Source" error={errors.source}>
          <select id="edit-listing-source" value={form.source} className={inputClass}
            onChange={(e) => set('source', e.target.value as ListingSource)}>
            {LISTING_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
          </select>
        </Field>
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

/** Shows a listing's tags and edits them. Any number of tags of any kind is allowed. */
function ListingTagsSection({ listingId }: { listingId: string }) {
  const [tags, setTags] = useState<Tag[] | null>(null)
  const [saved, setSaved] = useState<string[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>([])
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
    setSaveError(null)
    setEditing(true)
  }

  async function save() {
    if (!tags) return
    setSaveError(null)
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
          <TagPicker idPrefix="edit-listing" tags={tags} selected={draft} disabled={busy}
            onTagCreated={(tag) => setTags((prev) => withTag(prev ?? [], tag))}
            onChange={(ids) => {
              setDraft(ids)
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
  const [companies, setCompanies] = useState<Company[] | null>(null)
  const [companiesError, setCompaniesError] = useState<string | null>(null)

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
    // Loaded separately so the page still opens if companies can't be read.
    fetchCompanies()
      .then((rows) => live && setCompanies(rows))
      .catch((e: Error) => live && setCompaniesError(e.message))
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

  const company = companies?.find((c) => c.id === listing.company_id) ?? null

  return (
    <Page title={listing.name} back={{ href: hrefFor.listings(), label: '← All listings' }}
      meta={(
        <>
          {/* The company, from company_id only, with OWN when it is marked OWN. */}
          {company ? (
            <a href={hrefFor.company(company.id)} className="font-medium text-ink-2 hover:text-accent">
              {company.name}
            </a>
          ) : companies && <span className="text-ink-3">Unassigned</span>}
          {company?.is_own && <Badge tone="strong">OWN</Badge>}
          <Badge tone={listing.active ? 'positive' : 'neutral'}>{listing.active ? 'Active' : 'Inactive'}</Badge>
          <span>{SOURCE_LABELS[listing.source] ?? listing.source}</span>
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

      {editing && companiesError && (
        <Card title="Edit listing">
          <FormError>Could not load companies, so the listing can’t be edited yet: {companiesError}</FormError>
          <div className="mt-4 flex justify-end"><Button onClick={() => setEditing(false)}>Cancel</Button></div>
        </Card>
      )}
      {editing && !companiesError && !companies && (
        <Card title="Edit listing"><p className="text-sm text-ink-3">Loading companies…</p></Card>
      )}
      {editing && companies && (
        <EditListingForm listing={listing} companies={companies} onCancel={() => setEditing(false)}
          onSaved={(updated, saved) => {
            setListing(updated)
            if (saved) setCompanies((prev) => (prev?.some((c) => c.id === saved.id) ? prev : [...(prev ?? []), saved]))
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
