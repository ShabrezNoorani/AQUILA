// Pure helpers for the Ask page: turning chosen tags and a question into the function request,
// reading the function's reply, and describing past answers.

import type { Listing, Tag } from '../types'

/** What the page sends to the aquila-ask function. */
export type AskRequest = { question: string; tag_ids: string[] }

export type AskSource = { listing_id: string; name: string; snapshot_id: string | null; captured_at: string | null }

/** What the aquila-ask function returns. */
export type AskResponse = {
  suggestion_id: string | null
  answer: string
  model: string
  listing_ids: string[]
  snapshot_ids: string[]
  sources: AskSource[]
  saved: boolean
  save_error?: string
}

export type AskForm = { question: string; placeIds: string[]; typeIds: string[] }

export const MAX_QUESTION = 2000

export type AskErrors = Partial<Record<'question' | 'places', string>>

/**
 * Builds the request: one or more place tags, any number of type tags, and a question.
 * Place and type ids go together in tag_ids (places first). Ids that are not tags of the
 * right kind are dropped.
 */
export function buildAskRequest(form: AskForm, tags: Tag[]):
  | { ok: true; request: AskRequest }
  | { ok: false; errors: AskErrors } {
  const kindOf = new Map(tags.map((t) => [t.id, t.kind]))
  const places = [...new Set(form.placeIds)].filter((id) => kindOf.get(id) === 'place')
  const types = [...new Set(form.typeIds)].filter((id) => kindOf.get(id) === 'type')
  const question = form.question.trim()

  const errors: AskErrors = {}
  if (places.length === 0) errors.places = 'Choose at least one place tag.'
  if (!question) errors.question = 'Type a question.'
  else if (question.length > MAX_QUESTION) errors.question = `Keep the question under ${MAX_QUESTION} characters.`
  if (Object.keys(errors).length) return { ok: false, errors }

  return { ok: true, request: { question, tag_ids: [...places, ...types] } }
}

/** Checks the function's reply has the fields the page shows. */
export function parseAskResponse(data: unknown): AskResponse {
  const d = (data ?? {}) as Partial<AskResponse>
  if (typeof d.answer !== 'string') throw new Error('Ask AI sent back no answer.')
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  return {
    suggestion_id: typeof d.suggestion_id === 'string' ? d.suggestion_id : null,
    answer: d.answer,
    model: typeof d.model === 'string' ? d.model : '',
    listing_ids: list(d.listing_ids),
    snapshot_ids: list(d.snapshot_ids),
    sources: Array.isArray(d.sources)
      ? d.sources.filter((s): s is AskSource => !!s && typeof s.listing_id === 'string' && typeof s.name === 'string')
      : [],
    saved: d.saved !== false,
    ...(typeof d.save_error === 'string' ? { save_error: d.save_error } : {}),
  }
}

/** Tag names for a past answer, split by kind. Unknown (deleted) tags are counted, not named. */
export function describeTags(tagIds: string[] | null, tags: Tag[]) {
  const byId = new Map(tags.map((t) => [t.id, t]))
  const ids = tagIds ?? []
  const known = ids.map((id) => byId.get(id)).filter((t): t is Tag => !!t)
  return {
    places: known.filter((t) => t.kind === 'place').map((t) => t.name),
    types: known.filter((t) => t.kind === 'type').map((t) => t.name),
    missing: ids.length - known.length,
  }
}

/** Names for the listings a past answer used, in order. Deleted listings show as "(deleted listing)". */
export function listingNames(listingIds: string[] | null, listings: Listing[]): { id: string; name: string; exists: boolean }[] {
  const byId = new Map(listings.map((l) => [l.id, l]))
  return (listingIds ?? []).map((id) => {
    const l = byId.get(id)
    return { id, name: l?.name ?? '(deleted listing)', exists: !!l }
  })
}

/** A capture date as a short local date, or the raw text if it can't be read. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'no capture date'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
