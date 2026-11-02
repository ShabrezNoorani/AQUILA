import { useEffect, useState, type FormEvent } from 'react'
import { createListingWithTags, fetchTags } from './api'
import { emptyListingForm, listingFormToRow, type ListingForm } from './mapping'
import { listingTagsError } from './tags/tagMapping'
import TagPicker from './tags/TagPicker'
import { LISTING_SOURCES, SOURCE_LABELS, type ListingSource, type Tag } from './types'
import { Button, Card, Field, FormError, Page, TextField, inputClass } from './ui'

type Errors = Partial<Record<keyof ListingForm, string>>

/** One half of the Own / Competitor switch. The radio inside stays reachable by keyboard. */
const segment = (on: boolean) =>
  `cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
    on ? 'bg-surface text-ink shadow-sm shadow-ink/5' : 'text-ink-3 hover:text-ink'}`

export default function NewListingForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [form, setForm] = useState<ListingForm>(emptyListingForm)
  const [errors, setErrors] = useState<Errors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tags, setTags] = useState<Tag[] | null>(null)
  const [tagLoadError, setTagLoadError] = useState<string | null>(null)
  const [tagIds, setTagIds] = useState<string[]>([])
  const [tagError, setTagError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetchTags()
      .then((rows) => live && setTags(rows))
      .catch((e: Error) => live && setTagLoadError(e.message))
    return () => {
      live = false
    }
  }, [])

  const set = <K extends keyof ListingForm>(key: K, value: ListingForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaveError(null)
    const mapped = listingFormToRow(form)
    // Exactly one type tag and at least one place tag, or nothing is saved.
    const tagProblem = tags ? listingTagsError(tagIds, tags) : 'Tags have not loaded, so the listing cannot be saved yet'
    setErrors(mapped.ok ? {} : mapped.errors)
    setTagError(tagProblem)
    if (!mapped.ok || tagProblem) return
    setBusy(true)
    try {
      const created = await createListingWithTags(mapped.row, tagIds)
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

          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium text-ink">Whose listing?</legend>
            <div className="inline-flex rounded-card border border-line bg-paper p-1">
              <label className={segment(form.is_own)}>
                <input type="radio" name="is_own" className="sr-only" checked={form.is_own}
                  onChange={() => set('is_own', true)} />
                Own
              </label>
              <label className={segment(!form.is_own)}>
                <input type="radio" name="is_own" className="sr-only" checked={!form.is_own}
                  onChange={() => set('is_own', false)} />
                Competitor
              </label>
            </div>
          </fieldset>

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

        <Card title="Tags" description="Exactly one type and at least one place.">
          {tagLoadError && <FormError>Could not load tags: {tagLoadError}</FormError>}
          {!tagLoadError && !tags && <p className="text-sm text-ink-3">Loading tags…</p>}
          {tags && (
            <TagPicker idPrefix="new-listing" tags={tags} selected={tagIds} error={tagError}
              onChange={(ids) => {
                setTagIds(ids)
                setTagError(null)
              }} />
          )}
          {!tags && tagError && <p role="alert" className="mt-2 text-sm text-negative-deep">{tagError}</p>}
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
