import { useState, type FormEvent } from 'react'
import { createSnapshot } from './api'
import { TextField } from './fields'
import { emptySnapshotForm, snapshotFormToRow, type SnapshotField, type SnapshotForm as Form } from './mapping'

type Errors = Partial<Record<SnapshotField, string>>

type FieldDef = { key: keyof Form; label: string; multiline?: boolean; placeholder?: string }

const FIELDS: FieldDef[] = [
  { key: 'title', label: 'Title' },
  { key: 'duration', label: 'Duration', placeholder: 'e.g. 6 hours' },
  { key: 'languages', label: 'Languages (comma-separated)', placeholder: 'English, Arabic' },
  { key: 'group_type', label: 'Group type', placeholder: 'e.g. Shared, Private' },
  { key: 'highlights', label: 'Highlights (one per line)', multiline: true },
  { key: 'inclusions', label: 'Inclusions', multiline: true },
  { key: 'exclusions', label: 'Exclusions', multiline: true },
  { key: 'why_this', label: 'Why this', multiline: true },
  { key: 'itinerary', label: 'Itinerary (one step per line)', multiline: true },
  {
    key: 'options',
    label: 'Options (one per line: name | description | price)',
    multiline: true,
    placeholder: 'Shared | Group transfer | 150',
  },
  { key: 'rating', label: 'Rating (0–5)' },
  { key: 'review_count', label: 'Review count' },
  { key: 'urgency_text', label: 'Urgency text', placeholder: 'e.g. Likely to sell out' },
]

export default function SnapshotForm({ listingId, onSaved }: { listingId: string; onSaved: () => void }) {
  const [form, setForm] = useState<Form>(emptySnapshotForm)
  const [errors, setErrors] = useState<Errors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaveError(null)
    const mapped = snapshotFormToRow(listingId, form)
    if (!mapped.ok) {
      setErrors(mapped.errors)
      return
    }
    setErrors({})
    setBusy(true)
    try {
      await createSnapshot(mapped.row)
      setForm(emptySnapshotForm())
      onSaved()
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <h2 className="text-xl font-semibold">Add snapshot (manual)</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {FIELDS.map((f) => (
          <TextField key={f.key} id={`snapshot-${f.key}`} label={f.label} value={form[f.key]}
            multiline={f.multiline} placeholder={f.placeholder} error={errors[f.key]}
            onChange={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))} />
        ))}
      </div>
      {errors.listing_id && <p role="alert" className="text-red-400">{errors.listing_id}</p>}
      {saveError && <p role="alert" className="text-red-400">Could not save: {saveError}</p>}
      <button type="submit" disabled={busy}
        className="rounded bg-white px-3 py-2 font-semibold text-slate-900 disabled:opacity-50">
        {busy ? 'Saving…' : 'Save snapshot'}
      </button>
    </form>
  )
}
