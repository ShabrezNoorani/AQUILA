import { describe, expect, it } from 'vitest'
import { emptyReviewForm, newReviewRow, reviewFormToRow, reviewToForm, validateReview } from './reviewMapping'

const form = (over: Partial<ReturnType<typeof emptyReviewForm>> = {}) => ({
  ...emptyReviewForm(),
  star_rating: '4',
  review_text: 'Great guide, worth it.',
  ...over,
})

describe('validateReview', () => {
  it('accepts every whole star rating from 1 to 5', () => {
    for (const s of ['1', '2', '3', '4', '5', ' 5 ', '3.0']) {
      expect(validateReview(form({ star_rating: s })).ok).toBe(true)
    }
  })

  it.each([['0'], ['6'], ['-1'], ['4.5'], ['abc'], [''], ['  '], ['10']])('rejects star rating %j', (s) => {
    const r = validateReview(form({ star_rating: s }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.star_rating).toMatch(/1 to 5/)
  })

  it.each([[''], ['   '], ['\n\t']])('rejects empty review text %j', (t) => {
    const r = validateReview(form({ review_text: t }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.review_text).toMatch(/required/i)
  })

  it('reports both errors at once', () => {
    const r = validateReview(form({ star_rating: '9', review_text: '' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['review_text', 'star_rating'])
  })

  it('trims text, keeps the date as free text, and turns a blank date into null', () => {
    expect(validateReview(form({ review_text: '  Lovely.  ', review_date: ' late Oct 2026 ' }))).toEqual({
      ok: true,
      value: { star_rating: 4, review_text: 'Lovely.', review_date: 'late Oct 2026' },
    })
    expect(validateReview(form({ review_date: '   ' }))).toMatchObject({ ok: true, value: { review_date: null } })
  })
})

describe('reviewFormToRow', () => {
  it('builds exactly the mt_reviews columns, with source manual and no id, created_at or reviewer name', () => {
    const r = reviewFormToRow('L1', form({ review_date: 'Oct 2026' }))
    expect(r).toEqual({
      ok: true,
      row: { listing_id: 'L1', star_rating: 4, review_text: 'Great guide, worth it.', review_date: 'Oct 2026', source: 'manual' },
    })
    if (r.ok) {
      expect(Object.keys(r.row).sort()).toEqual(['listing_id', 'review_date', 'review_text', 'source', 'star_rating'])
    }
  })

  it('rejects a missing listing', () => {
    const r = reviewFormToRow('', form())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.listing_id).toBeDefined()
  })

  it('passes validation errors through', () => {
    const r = reviewFormToRow('L1', form({ star_rating: '0' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.star_rating).toBeDefined()
  })
})

describe('newReviewRow and reviewToForm', () => {
  it('round-trips a saved review through the edit form', () => {
    const saved = { id: 'r1', listing_id: 'L1', star_rating: 2, review_text: 'Too rushed.', review_date: null, source: 'manual' }
    const f = reviewToForm(saved)
    expect(f).toEqual({ star_rating: '2', review_text: 'Too rushed.', review_date: '' })
    const v = validateReview(f)
    expect(v.ok && newReviewRow('L1', v.value)).toEqual({
      listing_id: 'L1', star_rating: 2, review_text: 'Too rushed.', review_date: null, source: 'manual',
    })
  })
})
