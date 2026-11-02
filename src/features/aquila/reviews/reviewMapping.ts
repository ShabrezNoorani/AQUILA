// Validation and mapping for mt_reviews. No reviewer names are ever stored.

import type { Review, ReviewInsert, ReviewUpdate } from '../types'

export type ReviewForm = {
  star_rating: string
  review_text: string
  review_date: string
}

export type ReviewField = keyof ReviewForm | 'listing_id'
export type ReviewErrors = Partial<Record<ReviewField, string>>

export const emptyReviewForm = (): ReviewForm => ({ star_rating: '', review_text: '', review_date: '' })

/** Checks a review form. Star rating 1–5 (whole stars) and text are required; the date is optional free text. */
export function validateReview(form: ReviewForm): { ok: true; value: ReviewUpdate } | { ok: false; errors: ReviewErrors } {
  const errors: ReviewErrors = {}
  const stars = form.star_rating.trim()
  const text = form.review_text.trim()

  if (!/^[1-5](\.0+)?$/.test(stars)) errors.star_rating = 'Star rating must be a whole number from 1 to 5'
  if (!text) errors.review_text = 'Review text is required'

  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    value: { star_rating: Number(stars), review_text: text, review_date: form.review_date.trim() || null },
  }
}

/** The row to insert for a new review: the validated fields plus listing_id and source 'manual'. */
export function newReviewRow(listingId: string, value: ReviewUpdate): ReviewInsert {
  return { listing_id: listingId, star_rating: value.star_rating, review_text: value.review_text, review_date: value.review_date, source: 'manual' }
}

export function reviewFormToRow(
  listingId: string,
  form: ReviewForm,
): { ok: true; row: ReviewInsert } | { ok: false; errors: ReviewErrors } {
  const checked = validateReview(form)
  if (!listingId) {
    return { ok: false, errors: { ...(checked.ok ? {} : checked.errors), listing_id: 'Missing listing' } }
  }
  if (!checked.ok) return checked
  return { ok: true, row: newReviewRow(listingId, checked.value) }
}

/** A saved review as form text, for editing. */
export function reviewToForm(review: Review): ReviewForm {
  return {
    star_rating: String(review.star_rating),
    review_text: review.review_text ?? '',
    review_date: review.review_date ?? '',
  }
}
