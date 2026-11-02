// Maps form state to database rows, with validation.

import {
  commaListToArray,
  linesToArray,
  parseOptions,
  parseRating,
  parseReviewCount,
} from './parse'
import { LISTING_SOURCES, type ListingInsert, type ListingSource, type Snapshot, type SnapshotInsert } from './types'

export type Mapped<Row, Field extends string> =
  | { ok: true; row: Row }
  | { ok: false; errors: Partial<Record<Field, string>> }

const textOrNull = (s: string) => s.trim() || null

// ---------- listings ----------

export type ListingForm = {
  name: string
  is_own: boolean
  source: ListingSource
  url: string
  competitor_name: string
}

export const emptyListingForm = (): ListingForm => ({
  name: '',
  is_own: true,
  source: 'manual',
  url: '',
  competitor_name: '',
})

export function listingFormToRow(form: ListingForm): Mapped<ListingInsert, keyof ListingForm> {
  const errors: Partial<Record<keyof ListingForm, string>> = {}
  const name = form.name.trim()
  const url = form.url.trim()

  if (!name) errors.name = 'Name is required'
  if (!LISTING_SOURCES.includes(form.source)) errors.source = 'Choose viator, tripadvisor or manual'
  if (url && !/^https?:\/\/\S+$/i.test(url)) errors.url = 'URL must start with http:// or https://'

  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    row: {
      name,
      is_own: form.is_own,
      source: form.source,
      url: url || null,
      competitor_name: textOrNull(form.competitor_name),
      active: true,
    },
  }
}

// ---------- snapshots ----------

export type SnapshotForm = {
  title: string
  overview: string
  duration: string
  languages: string
  group_type: string
  highlights: string
  inclusions: string
  exclusions: string
  why_this: string
  itinerary: string
  options: string
  rating: string
  review_count: string
  urgency_text: string
}

export const emptySnapshotForm = (): SnapshotForm => ({
  title: '',
  overview: '',
  duration: '',
  languages: '',
  group_type: '',
  highlights: '',
  inclusions: '',
  exclusions: '',
  why_this: '',
  itinerary: '',
  options: '',
  rating: '',
  review_count: '',
  urgency_text: '',
})

export type SnapshotField = keyof SnapshotForm | 'listing_id'

export type CaptureStatus = 'complete' | 'partial'

/** Text fields that must all be found for a capture to count as complete. */
export const CORE_FIELDS = ['title', 'duration', 'languages', 'rating', 'review_count'] as const

/**
 * complete = title, duration, languages, rating and review count are all filled in,
 * and at least one option has a price. Anything less is partial.
 */
export function computeStatus(form: SnapshotForm): CaptureStatus {
  const textOk = CORE_FIELDS.every((k) => form[k].trim() !== '')
  const options = parseOptions(form.options)
  const pricedOption = options.ok && options.value.some((o) => o.price !== null)
  return textOk && pricedOption ? 'complete' : 'partial'
}

export function snapshotFormToRow(
  listingId: string,
  form: SnapshotForm,
): Mapped<SnapshotInsert, SnapshotField> {
  const errors: Partial<Record<SnapshotField, string>> = {}
  if (!listingId) errors.listing_id = 'Missing listing'

  const options = parseOptions(form.options)
  const rating = parseRating(form.rating)
  const reviewCount = parseReviewCount(form.review_count)
  if (!options.ok) errors.options = options.error
  if (!rating.ok) errors.rating = rating.error
  if (!reviewCount.ok) errors.review_count = reviewCount.error

  if (!options.ok || !rating.ok || !reviewCount.ok || errors.listing_id) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    row: {
      listing_id: listingId,
      method: 'manual',
      status: computeStatus(form),
      title: textOrNull(form.title),
      overview: textOrNull(form.overview),
      duration: textOrNull(form.duration),
      languages: commaListToArray(form.languages),
      group_type: textOrNull(form.group_type),
      highlights: linesToArray(form.highlights),
      inclusions: textOrNull(form.inclusions),
      exclusions: textOrNull(form.exclusions),
      why_this: textOrNull(form.why_this),
      itinerary: linesToArray(form.itinerary),
      options: options.value,
      rating: rating.value,
      review_count: reviewCount.value,
      urgency_text: textOrNull(form.urgency_text),
    },
  }
}

/**
 * Turns a saved snapshot back into form text, so it can be edited in the snapshot form.
 * snapshotFormToRow(listingId, snapshotRowToForm(row)) gives back the same values.
 */
export function snapshotRowToForm(row: Snapshot): SnapshotForm {
  const text = (v: string | null | undefined) => v ?? ''
  const list = (v: string[] | null | undefined, sep: string) => (v ?? []).join(sep)
  const num = (v: number | null | undefined) => (v == null ? '' : String(v))
  return {
    title: text(row.title),
    overview: text(row.overview),
    duration: text(row.duration),
    languages: list(row.languages, ', '),
    group_type: text(row.group_type),
    highlights: list(row.highlights, '\n'),
    inclusions: text(row.inclusions),
    exclusions: text(row.exclusions),
    why_this: text(row.why_this),
    itinerary: list(row.itinerary, '\n'),
    options: (row.options ?? [])
      .map((o) => {
        const name = o.name.replace(/\|/g, '/')
        const description = (o.description ?? '').replace(/\|/g, '/')
        if (o.price == null && !description) return name
        return `${name} | ${description} | ${o.price ?? ''}`
      })
      .join('\n'),
    rating: num(row.rating),
    review_count: num(row.review_count),
    urgency_text: text(row.urgency_text),
  }
}
