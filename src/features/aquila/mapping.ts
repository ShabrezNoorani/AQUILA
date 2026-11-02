// Maps form state to database rows, with validation.

import {
  commaListToArray,
  linesToArray,
  parseOptions,
  parseRating,
  parseReviewCount,
} from './parse'
import { LISTING_SOURCES, type ListingInsert, type ListingSource, type SnapshotInsert } from './types'

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
      status: 'complete',
      title: textOrNull(form.title),
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
