import { useEffect, useState, type FormEvent } from 'react'
import { createCompany, createListingWithTags, fetchCompanies, fetchTags, setCompanyOwn } from './api'
import CompanyField from './companies/CompanyField'
import { emptyListingForm, findCompanyByName, listingFormToRow, type ListingForm } from './mapping'
import { withTag } from './tags/tagMapping'
import TagPicker from './tags/TagPicker'
import { LISTING_SOURCES, SOURCE_LABELS, type Company, type ListingSource, type Tag } from './types'
import { Button, Card, Field, FormError, Page, TextField, inputClass } from './ui'

type Errors = Partial<Record<keyof ListingForm, string>>

export default function NewListingForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [form, setForm] = useState<ListingForm>(emptyListingForm)
  const [errors, setErrors] = useState<Errors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tags, setTags] = useState<Tag[] | null>(null)
  const [tagLoadError, setTagLoadError] = useState<string | null>(null)
  const [tagIds, setTagIds] = useState<string[]>([])
  const [companies, setCompanies] = useState<Company[]>([])

  useEffect(() => {
    let live = true
    fetchTags()
      .then((rows) => live && setTags(rows))
      .catch((e: Error) => live && setTagLoadError(e.message))
    // Suggestions only: if they fail to load, the name is still matched when saving.
    fetchCompanies()
      .then((rows) => live && setCompanies(rows))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const set = <K extends keyof ListingForm>(key: K, value: ListingForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaveError(null)
    const mapped = listingFormToRow(form, { requireCompany: true })
    // Tags are optional: any number of tags of any kind.
    setErrors(mapped.ok ? {} : mapped.errors)
    if (!mapped.ok) return
    setBusy(true)
    try {
      // Reuse the company with the same name (ignoring capitals, extra spaces and trailing dots),
      // or create it. OWN belongs to the company: a new one gets the tick, an existing one is
      // updated if the tick differs.
      const found = await createCompany(form.company, form.is_own)
      const company = found.existed && found.company.is_own !== form.is_own
        ? await setCompanyOwn(found.company.id, form.is_own)
        : found.company
      const created = await createListingWithTags({ ...mapped.row, company_id: company.id }, tagIds)
      onCreated(created.id)
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page title="New listing" narrow>
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card title="Details" description="What it is and where it’s listed." className="space-y-5">
          <TextField id="listing-name" label="Name *" value={form.name}
            onChange={(v) => set('name', v)} error={errors.name} />

          <CompanyField id="listing-company" label="Company *" value={form.company} companies={companies}
            help="Pick an existing company or type a new one."
            onChange={(v) => {
              set('company', v)
              const match = findCompanyByName(companies, v)
              if (match) set('is_own', match.is_own)
            }} error={errors.company} />

          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input type="checkbox" className="h-4 w-4 accent-ink" checked={form.is_own}
              onChange={(e) => set('is_own', e.target.checked)} />
            This is ours (OWN)
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="listing-source" label="Source" error={errors.source}>
              <select id="listing-source" value={form.source} className={inputClass}
                onChange={(e) => set('source', e.target.value as ListingSource)}>
                {LISTING_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
              </select>
            </Field>

            <TextField id="listing-competitor-name" label="Competitor name" value={form.competitor_name}
              onChange={(v) => set('competitor_name', v)} error={errors.competitor_name} />
          </div>

          <TextField id="listing-url" label="URL" value={form.url} placeholder="https://…"
            help="The public product page, starting with http:// or https://."
            onChange={(v) => set('url', v)} error={errors.url} />
        </Card>

        <Card title="Tags" description="Optional. Any number of tags, of any kind.">
          {tagLoadError && <FormError>Could not load tags: {tagLoadError}</FormError>}
          {!tagLoadError && !tags && <p className="text-sm text-ink-3">Loading tags…</p>}
          {tags && (
            <TagPicker idPrefix="new-listing" tags={tags} selected={tagIds}
              onTagCreated={(tag) => setTags((prev) => withTag(prev ?? [], tag))}
              onChange={setTagIds} />
          )}
        </Card>

        {saveError && <FormError>Could not save: {saveError}</FormError>}

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Create listing'}
          </Button>
        </div>
      </form>
    </Page>
  )
}
