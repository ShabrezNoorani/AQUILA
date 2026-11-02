import { useState, type FormEvent } from 'react'
import type { SnapshotField, SnapshotForm } from '../mapping'
import { hrefFor } from '../router'
import { BOOKMARKLET, parseBookmarkPayload } from './bookmarklet'
import { saveAssistedSnapshot } from './captureApi'
import { Badge, Button, Card, FormError, Page, TextField, inputClass } from '../ui'
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
    <Card as="section" className="space-y-3">
      <h2 className="text-base font-semibold text-ink">1. The bookmark</h2>
      <p className="text-sm text-ink-3">
        Copy this code, create a new bookmark in your browser, and paste the code as its URL. Then open a
        Viator product page, click the bookmark, come back here and paste. The bookmark only copies the page’s
        URL and HTML to your clipboard.
      </p>
      <label htmlFor="bookmark-code" className="block text-sm font-medium text-ink">Bookmark code</label>
      <div className="flex gap-2">
        <input id="bookmark-code" readOnly value={BOOKMARKLET}
          onFocus={(e) => e.target.select()}
          className={`${inputClass} bg-paper font-mono text-xs`} />
        <Button variant="primary" className="shrink-0" onClick={copy}>Copy bookmark</Button>
      </div>
      {copied === 'ok' && <p className="text-sm text-positive-deep">Copied.</p>}
      {copied === 'failed' && <p className="text-sm text-negative-deep">Could not copy. Select the code and copy it by hand.</p>}
    </Card>
  )
}

function Preview({ result, status }: { result: ParseResult; status: string }) {
  return (
    <Card as="section" aria-label="Preview" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-semibold text-ink">3. Preview</h2>
          <p className="text-xs break-all text-ink-3">{result.url}</p>
        </div>
        <p className="flex items-center gap-2 text-sm text-ink-3">
          Status: <Badge tone={status === 'complete' ? 'positive' : 'neutral'}><strong>{status}</strong></Badge>
        </p>
      </div>
      <div className="rounded-card border border-line bg-paper p-3">
        <h3 className="text-sm font-semibold text-ink">Missing</h3>
        {result.missing.length === 0 ? (
          <p className="mt-1 text-sm text-ink-3">Nothing missing.</p>
        ) : (
          <ul aria-label="Missing fields" className="mt-1 list-disc pl-5 text-sm text-ink-2">
            {result.missing.map((m) => <li key={m}>{LABELS[m]}</li>)}
          </ul>
        )}
      </div>
      <dl className="grid gap-x-6 gap-y-4 text-sm md:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-3">{LABELS[f.key]}</dt>
            <dd className="mt-1 whitespace-pre-line text-ink">{result.fields[f.key] || '—'}</dd>
          </div>
        ))}
      </dl>
    </Card>
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
    <Page title="Import from page" back={{ href: hrefFor.listing(listingId), label: '← Back to listing' }}>
      <BookmarkSection />

      <Card as="section" className="space-y-3">
        <h2 className="text-base font-semibold text-ink">2. Paste</h2>
        <TextField id="bookmark-output" label="Bookmark output" value={pasted} onChange={setPasted}
          multiline rows={4} placeholder='{"url": "https://www.viator.com/…", "html": "…"}'
          className="font-mono text-xs" />
        {parseError && <FormError>{parseError}</FormError>}
        <div className="flex justify-end">
          <Button variant="primary" onClick={handleParse}>Parse</Button>
        </div>
      </Card>

      {parsed && form && (
        <>
          <Preview result={parsed.result} status={parsed.result.status} />

          <form onSubmit={handleSave} noValidate className="space-y-5 rounded-card border border-line bg-surface p-6 shadow-sm shadow-ink/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink">4. Check and edit, then save</h2>
              <p className="text-sm text-ink-3">Will be saved as: <strong className="text-ink">{computeStatus(form)}</strong></p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {FIELDS.map((f) => (
                <TextField key={f.key} id={`import-${f.key}`} label={f.label} value={form[f.key]}
                  multiline={f.multiline} error={errors[f.key]}
                  onChange={(v) => setForm((prev) => (prev ? { ...prev, [f.key]: v } : prev))} />
              ))}
            </div>
            {errors.listing_id && <FormError>{errors.listing_id}</FormError>}
            {saveError && <FormError>Could not save: {saveError}</FormError>}
            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save snapshot'}
              </Button>
            </div>
          </form>
        </>
      )}
    </Page>
  )
}
