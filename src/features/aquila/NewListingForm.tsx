import { useState, type FormEvent } from 'react'
import { createListing } from './api'
import { Field, TextField, inputClass } from './fields'
import { emptyListingForm, listingFormToRow, type ListingForm } from './mapping'
import { LISTING_SOURCES, type ListingSource } from './types'

type Errors = Partial<Record<keyof ListingForm, string>>

export default function NewListingForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [form, setForm] = useState<ListingForm>(emptyListingForm)
  const [errors, setErrors] = useState<Errors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof ListingForm>(key: K, value: ListingForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaveError(null)
    const mapped = listingFormToRow(form)
    if (!mapped.ok) {
      setErrors(mapped.errors)
      return
    }
    setErrors({})
    setBusy(true)
    try {
      const created = await createListing(mapped.row)
      onCreated(created.id)
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">New listing</h1>

      <TextField id="listing-name" label="Name *" value={form.name}
        onChange={(v) => set('name', v)} error={errors.name} />

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Whose listing?</legend>
        <div className="flex gap-6">
          <label className="flex items-center gap-2">
            <input type="radio" name="is_own" checked={form.is_own}
              onChange={() => set('is_own', true)} />
            Own
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="is_own" checked={!form.is_own}
              onChange={() => set('is_own', false)} />
            Competitor
          </label>
        </div>
      </fieldset>

      <Field id="listing-source" label="Source" error={errors.source}>
        <select id="listing-source" value={form.source} className={inputClass}
          onChange={(e) => set('source', e.target.value as ListingSource)}>
          {LISTING_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>

      <TextField id="listing-url" label="URL" value={form.url} placeholder="https://…"
        onChange={(v) => set('url', v)} error={errors.url} />

      <TextField id="listing-competitor-name" label="Competitor name" value={form.competitor_name}
        onChange={(v) => set('competitor_name', v)} error={errors.competitor_name} />

      {saveError && <p role="alert" className="text-red-400">Could not save: {saveError}</p>}

      <button type="submit" disabled={busy}
        className="rounded bg-white px-3 py-2 font-semibold text-slate-900 disabled:opacity-50">
        {busy ? 'Saving…' : 'Create listing'}
      </button>
    </form>
  )
}
