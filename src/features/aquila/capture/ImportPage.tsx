import { useState, type FormEvent } from 'react'
import { TextField } from '../fields'
import type { SnapshotField, SnapshotForm } from '../mapping'
import { hrefFor } from '../router'
import { BOOKMARKLET, parseBookmarkPayload } from './bookmarklet'
import { saveAssistedSnapshot } from './captureApi'
import { computeStatus, parseViatorListing, type MissingField, type ParseResult } from './viatorParser'

type FieldDef = { key: keyof SnapshotForm; label: string; multiline?: boolean }

const FIELDS: FieldDef[] = [
  { key: 'title', label: 'Title' },
  { key: 'overview', label: 'Overview (one paragraph per line)', multiline: true },
  { key: 'duration', label: 'Duration' },
  { key: 'languages', label: 'Languages (comma-separated)' },
  { key: 'group_type', label: 'Group type' },
  { key: 'highlights', label: 'Highlights (one per line)', multiline: true },
  { key: 'inclusions', label: 'Inclusions', multiline: true },
  { key: 'exclusions', label: 'Exclusions', multiline: true },
  { key: 'why_this', label: 'Why this', multiline: true },
  { key: 'itinerary', label: 'Itinerary (one step per line)', multiline: true },
  { key: 'options', label: 'Options (one per line: name | description | price)', multiline: true },
  { key: 'rating', label: 'Rating (0–5)' },
  { key: 'review_count', label: 'Review count' },
  { key: 'urgency_text', label: 'Urgency text' },
]

const LABELS: Record<MissingField, string> = {
  ...(Object.fromEntries(FIELDS.map((f) => [f.key, f.label.replace(/ \(.*\)$/, '')])) as Record<keyof SnapshotForm, string>),
  option_prices: 'Option prices',
}

type Parsed = { result: ParseResult; html: string }

function BookmarkSection() {
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(BOOKMARKLET)
      setCopied('ok')
    } catch {
      setCopied('failed')
    }
  }

  return (
    <section className="space-y-2 rounded border border-slate-700 p-4">
      <h2 className="text-xl font-semibold">1. The bookmark</h2>
      <p className="text-sm text-slate-300">
        Copy this code, create a new bookmark in your browser, and paste the code as its URL. Then open a
        Viator product page, click the bookmark, come back here and paste. The bookmark only copies the page’s
        URL and HTML to your clipboard.
      </p>
      <label htmlFor="bookmark-code" className="block text-sm font-medium">Bookmark code</label>
      <div className="flex gap-2">
        <input id="bookmark-code" readOnly value={BOOKMARKLET}
          onFocus={(e) => e.target.select()}
          className="w-full rounded bg-slate-800 px-3 py-2 font-mono text-xs" />
        <button type="button" onClick={copy}
          className="shrink-0 rounded bg-white px-3 py-2 font-semibold text-slate-900">
          Copy bookmark
        </button>
      </div>
      {copied === 'ok' && <p className="text-sm text-green-400">Copied.</p>}
      {copied === 'failed' && <p className="text-sm text-red-400">Could not copy. Select the code and copy it by hand.</p>}
    </section>
  )
}

function Preview({ result, status }: { result: ParseResult; status: string }) {
  return (
    <section aria-label="Preview" className="space-y-3 rounded border border-slate-700 p-4">
      <h2 className="text-xl font-semibold">3. Preview</h2>
      <p className="text-sm break-all text-slate-400">{result.url}</p>
      <p>Status: <strong>{status}</strong></p>
      <div>
        <h3 className="font-semibold">Missing</h3>
        {result.missing.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing missing.</p>
        ) : (
          <ul aria-label="Missing fields" className="list-disc pl-5 text-sm text-amber-300">
            {result.missing.map((m) => <li key={m}>{LABELS[m]}</li>)}
          </ul>
        )}
      </div>
      <dl className="grid gap-2 text-sm md:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <dt className="text-slate-400">{LABELS[f.key]}</dt>
            <dd className="whitespace-pre-line">{result.fields[f.key] || '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default function ImportPage({ listingId, onSaved }: { listingId: string; onSaved: () => void }) {
  const [pasted, setPasted] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [form, setForm] = useState<SnapshotForm | null>(null)
  const [errors, setErrors] = useState<Partial<Record<SnapshotField, string>>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function handleParse() {
    setParsed(null)
    setForm(null)
    setErrors({})
    setSaveError(null)
    const payload = parseBookmarkPayload(pasted)
    if (!payload.ok) {
      setParseError(payload.error)
      return
    }
    const result = parseViatorListing(payload.html, payload.url)
    if (!result.fields.title && !result.fields.options) {
      setParseError('No Viator product was found in that page. Open the product page itself and click the bookmark again.')
      return
    }
    setParseError(null)
    setParsed({ result, html: payload.html })
    setForm(result.fields)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!parsed || !form) return
    setSaveError(null)
    setBusy(true)
    try {
      const r = await saveAssistedSnapshot(listingId, form, parsed.html, parsed.result.rawText)
      if (!r.ok) {
        setErrors(r.errors)
        return
      }
      setErrors({})
      onSaved()
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-6">
      <a href={hrefFor.listing(listingId)} className="text-sm underline">← Back to listing</a>
      <h1 className="text-2xl font-bold">Import from page</h1>

      <BookmarkSection />

      <section className="space-y-2 rounded border border-slate-700 p-4">
        <h2 className="text-xl font-semibold">2. Paste</h2>
        <TextField id="bookmark-output" label="Bookmark output" value={pasted} onChange={setPasted}
          multiline rows={4} placeholder='{"url": "https://www.viator.com/…", "html": "…"}' />
        {parseError && <p role="alert" className="text-red-400">{parseError}</p>}
        <button type="button" onClick={handleParse}
          className="rounded bg-white px-3 py-2 font-semibold text-slate-900">
          Parse
        </button>
      </section>

      {parsed && form && (
        <>
          <Preview result={parsed.result} status={parsed.result.status} />

          <form onSubmit={handleSave} noValidate className="space-y-4 rounded border border-slate-700 p-4">
            <h2 className="text-xl font-semibold">4. Check and edit, then save</h2>
            <p className="text-sm">Will be saved as: <strong>{computeStatus(form)}</strong></p>
            <div className="grid gap-4 md:grid-cols-2">
              {FIELDS.map((f) => (
                <TextField key={f.key} id={`import-${f.key}`} label={f.label} value={form[f.key]}
                  multiline={f.multiline} error={errors[f.key]}
                  onChange={(v) => setForm((prev) => (prev ? { ...prev, [f.key]: v } : prev))} />
              ))}
            </div>
            {errors.listing_id && <p role="alert" className="text-red-400">{errors.listing_id}</p>}
            {saveError && <p role="alert" className="text-red-400">Could not save: {saveError}</p>}
            <button type="submit" disabled={busy}
              className="rounded bg-white px-3 py-2 font-semibold text-slate-900 disabled:opacity-50">
              {busy ? 'Saving…' : 'Save snapshot'}
            </button>
          </form>
        </>
      )}
    </section>
  )
}
