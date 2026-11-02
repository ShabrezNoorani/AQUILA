// #/ask: choose place tags (and optionally type tags), ask a question, see the answer with the
// listings and capture dates it used, and look back at past answers.

import { useEffect, useState, type FormEvent } from 'react'
import { fetchListings, fetchTags } from '../api'
import { hrefFor } from '../router'
import { tagsOfKind } from '../tags/tagMapping'
import type { Listing, Suggestion, Tag } from '../types'
import { Badge, Button, Card, EmptyState, FormError, Page, TextField } from '../ui'
import { askQuestion, fetchSuggestions } from './askApi'
import {
  buildAskRequest,
  describeTags,
  formatDate,
  listingNames,
  type AskErrors,
  type AskResponse,
} from './askMapping'

const pill = (on: boolean) =>
  `flex cursor-pointer items-center gap-2 rounded-card border px-3 py-1.5 text-sm transition-colors ${
    on ? 'border-ink-2 bg-paper font-medium text-ink' : 'border-line bg-surface text-ink-2 hover:bg-paper hover:text-ink'}`

function TagChoices({ legend, tags, selected, onToggle, error, errorId }: {
  legend: string
  tags: Tag[]
  selected: string[]
  onToggle: (id: string, on: boolean) => void
  error?: string
  errorId: string
}) {
  return (
    <fieldset className="space-y-1.5" aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1.5 text-sm font-medium text-ink">{legend}</legend>
      {tags.length === 0 ? (
        <p className="text-sm text-ink-3">
          None yet. <a href={hrefFor.tags()} className="font-medium text-accent hover:underline">Add them on the Tags page</a>.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <label key={t.id} className={pill(selected.includes(t.id))}>
              <input type="checkbox" className="accent-ink" checked={selected.includes(t.id)}
                onChange={(e) => onToggle(t.id, e.target.checked)} />
              {t.name}
            </label>
          ))}
        </div>
      )}
      {error && <p role="alert" id={errorId} className="text-sm text-negative-deep">{error}</p>}
    </fieldset>
  )
}

function Answer({ result }: { result: AskResponse }) {
  return (
    <Card as="section" aria-label="Answer" title="Answer">
      <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{result.answer}</p>
      <div className="mt-5 border-t border-line pt-4">
        <h3 className="text-xs font-medium uppercase tracking-wide text-ink-3">Based on</h3>
        {result.sources.length === 0 ? (
          <p className="mt-1 text-sm text-ink-3">No listings.</p>
        ) : (
          <ul aria-label="Listings used" className="mt-2 space-y-1.5">
            {result.sources.map((s) => (
              <li key={s.listing_id} className="flex flex-wrap items-center gap-2 text-sm">
                <a href={hrefFor.listing(s.listing_id)} className="font-medium text-ink hover:text-accent hover:underline">{s.name}</a>
                <span className="text-ink-3">
                  {s.snapshot_id ? `captured ${formatDate(s.captured_at)}` : 'no snapshot yet'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!result.saved && (
        <p role="status" className="mt-4 text-sm text-ink-2">
          This answer was not saved to past answers{result.save_error ? `: ${result.save_error}` : '.'}
        </p>
      )}
    </Card>
  )
}

function PastAnswer({ s, tags, listings }: { s: Suggestion; tags: Tag[]; listings: Listing[] }) {
  const t = describeTags(s.tag_ids, tags)
  const used = listingNames(s.listing_ids, listings)
  return (
    <article aria-label={`Past answer: ${s.question}`} className="space-y-3 rounded-card border border-line bg-surface p-6 shadow-sm shadow-ink/5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="font-semibold text-ink">{s.question}</h3>
          <p className="text-xs text-ink-3">{formatDate(s.created_at)} · {s.model}</p>
        </div>
        <Badge tone={s.status === 'error' ? 'negative' : 'positive'}>{s.status === 'error' ? 'Failed' : 'Answered'}</Badge>
      </header>
      <div className="flex flex-wrap gap-1">
        {t.places.map((n) => <Badge key={`p-${n}`}>{n}</Badge>)}
        {t.types.map((n) => <Badge key={`t-${n}`} tone="strong">{n}</Badge>)}
        {t.missing > 0 && <Badge>{t.missing} deleted tag{t.missing === 1 ? '' : 's'}</Badge>}
      </div>
      <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
        {s.answer ?? 'No answer: the AI call failed.'}
      </p>
      {used.length > 0 && (
        <p className="text-sm text-ink-3">
          Used:{' '}
          {used.map((l, i) => (
            <span key={l.id}>
              {i > 0 && ', '}
              {l.exists ? <a href={hrefFor.listing(l.id)} className="text-ink hover:text-accent hover:underline">{l.name}</a> : <span>{l.name}</span>}
            </span>
          ))}
        </p>
      )}
    </article>
  )
}

export default function AskPage() {
  const [tags, setTags] = useState<Tag[] | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [placeIds, setPlaceIds] = useState<string[]>([])
  const [typeIds, setTypeIds] = useState<string[]>([])
  const [question, setQuestion] = useState('')
  const [errors, setErrors] = useState<AskErrors>({})
  const [askError, setAskError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AskResponse | null>(null)
  const [past, setPast] = useState<Suggestion[] | null>(null)
  const [pastError, setPastError] = useState<string | null>(null)
  const [pastKey, setPastKey] = useState(0)

  useEffect(() => {
    let live = true
    Promise.all([fetchTags(), fetchListings()])
      .then(([t, l]) => {
        if (!live) return
        setTags(t)
        setListings(l)
      })
      .catch((e: Error) => live && setLoadError(e.message))
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    let live = true
    fetchSuggestions()
      .then((rows) => {
        if (!live) return
        setPastError(null)
        setPast(rows)
      })
      .catch((e: Error) => live && setPastError(e.message))
    return () => {
      live = false
    }
  }, [pastKey])

  const toggle = (set: (f: (ids: string[]) => string[]) => void) => (id: string, on: boolean) =>
    set((ids) => (on ? [...ids.filter((x) => x !== id), id] : ids.filter((x) => x !== id)))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!tags) return
    setAskError(null)
    const built = buildAskRequest({ question, placeIds, typeIds }, tags)
    if (!built.ok) {
      setErrors(built.errors)
      return
    }
    setErrors({})
    setBusy(true)
    try {
      setResult(await askQuestion(built.request))
    } catch (err) {
      setResult(null)
      setAskError((err as Error).message)
    } finally {
      setBusy(false)
      // A failed call is saved too, so refresh past answers either way.
      setPastKey((k) => k + 1)
    }
  }

  return (
    <Page title="Ask AI" narrow>
      {loadError && <FormError>Could not load tags: {loadError}</FormError>}
      {!loadError && !tags && <p className="text-sm text-ink-3">Loading…</p>}

      {tags && (
        <Card as="section" aria-label="Ask a question">
          <form onSubmit={handleSubmit} noValidate aria-label="Ask a question" className="space-y-5">
            <TagChoices legend="Places * (one or more)" tags={tagsOfKind(tags, 'place')} selected={placeIds}
              onToggle={(id, on) => {
                toggle(setPlaceIds)(id, on)
                setErrors((e) => ({ ...e, places: undefined }))
              }}
              error={errors.places} errorId="ask-places-error" />
            <TagChoices legend="Types (optional)" tags={tagsOfKind(tags, 'type')} selected={typeIds}
              onToggle={toggle(setTypeIds)} errorId="ask-types-error" />
            <TextField id="ask-question" label="Question *" value={question} multiline rows={3}
              placeholder="e.g. How do competitor prices for 2 travelers compare with ours?"
              help="The answer only uses your saved listings, snapshots, timing rules and reviews for these tags."
              onChange={setQuestion} error={errors.question} />
            {askError && <FormError>Could not get an answer: {askError}</FormError>}
            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Asking…' : 'Ask'}</Button>
            </div>
          </form>
        </Card>
      )}

      {result && <Answer result={result} />}

      <section aria-label="Past answers" className="space-y-4">
        <h2 className="text-base font-semibold text-ink">Past answers</h2>
        {pastError && <FormError>Could not load past answers: {pastError}</FormError>}
        {!pastError && !past && <p className="text-sm text-ink-3">Loading…</p>}
        {past && past.length === 0 && <EmptyState compact title="No past answers yet." />}
        {past?.map((s) => <PastAnswer key={s.id} s={s} tags={tags ?? []} listings={listings} />)}
      </section>
    </Page>
  )
}
