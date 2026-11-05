// Pure helpers for the Ask page: turning chosen tags and a question into the function request,
// reading the function's reply, and describing past answers.

import { groupByKind, kindLabel } from '../tags/tagMapping'
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

export type AskForm = { question: string; tagIds: string[] }

export const MAX_QUESTION = 2000

export type AskErrors = Partial<Record<'question', string>>

/**
 * Builds the request: a question and any number of tags of any kind. No tags means all
 * listings; with tags, only listings carrying all of them are used. Unknown ids are dropped.
 */
export function buildAskRequest(form: AskForm, tags: Tag[]):
  | { ok: true; request: AskRequest }
  | { ok: false; errors: AskErrors } {
  const known = new Set(tags.map((t) => t.id))
  const tagIds = [...new Set(form.tagIds)].filter((id) => known.has(id))
  const question = form.question.trim()

  const errors: AskErrors = {}
  if (!question) errors.question = 'Type a question.'
  else if (question.length > MAX_QUESTION) errors.question = `Keep the question under ${MAX_QUESTION} characters.`
  if (Object.keys(errors).length) return { ok: false, errors }

  return { ok: true, request: { question, tag_ids: tagIds } }
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

/** Tag names for a past answer, grouped by kind. Unknown (deleted) tags are counted, not named. */
export function describeTags(tagIds: string[] | null, tags: Tag[]) {
  const byId = new Map(tags.map((t) => [t.id, t]))
  const ids = tagIds ?? []
  const known = ids.map((id) => byId.get(id)).filter((t): t is Tag => !!t)
  return {
    groups: groupByKind(known).map((g) => ({ kind: kindLabel(g.kind), names: g.tags.map((t) => t.name) })),
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
