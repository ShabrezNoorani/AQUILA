import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { callsOf, createFakeSupabase, type Query, type Result } from '../test/fakeSupabase'
import { supabase } from '../../../lib/supabase'
import { createReview, deleteReview, fetchReviews, updateReview } from '../api'
import ReviewsSection from './ReviewsSection'

vi.mock('../../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

let queries: Query[]
let stored: Record<string, unknown>[]
let deleteResult: Result

const has = (q: Query, m: string) => callsOf(q, m).length > 0

function respond(q: Query): Result {
  if (has(q, 'insert')) return { data: { id: 'new', ...(callsOf(q, 'insert')[0][0] as object) }, error: null }
  if (has(q, 'update')) return { data: { id: 'r1', ...(callsOf(q, 'update')[0][0] as object) }, error: null }
  if (has(q, 'delete')) return deleteResult
  return { data: stored, error: null }
}

beforeEach(() => {
  stored = [
    { id: 'r1', listing_id: 'L1', star_rating: 5, review_text: 'Wonderful guide.', review_date: 'Oct 2026', source: 'manual' },
    { id: 'r2', listing_id: 'L1', star_rating: 2, review_text: 'Too crowded.', review_date: null, source: 'manual' },
  ]
  deleteResult = { data: [{ id: 'r1' }], error: null }
  const fake = createFakeSupabase((q) => respond(q))
  queries = fake.queries
  vi.mocked(supabase.from).mockImplementation(fake.client.from as never)
})

const writes = (m: 'insert' | 'update' | 'delete') => queries.filter((q) => has(q, m))

describe('review api', () => {
  it('fetchReviews reads mt_reviews for one listing, newest first', async () => {
    await fetchReviews('L1')
    expect(queries[0].table).toBe('mt_reviews')
    expect(callsOf(queries[0], 'eq')).toEqual([['listing_id', 'L1']])
    expect(callsOf(queries[0], 'order')).toEqual([['created_at', { ascending: false }]])
  })

  it('createReview inserts into mt_reviews', async () => {
    const row = { listing_id: 'L1', star_rating: 3, review_text: 'OK', review_date: null, source: 'manual' as const }
    await createReview(row)
    expect(queries[0].table).toBe('mt_reviews')
    expect(callsOf(queries[0], 'insert')).toEqual([[row]])
  })

  it('updateReview updates one mt_reviews row by id', async () => {
    await updateReview('r1', { star_rating: 4, review_text: 'Better', review_date: null })
    expect(queries[0].table).toBe('mt_reviews')
    expect(callsOf(queries[0], 'update')).toEqual([[{ star_rating: 4, review_text: 'Better', review_date: null }]])
    expect(callsOf(queries[0], 'eq')).toEqual([['id', 'r1']])
  })

  it('deleteReview deletes one mt_reviews row by id, and fails if nothing was deleted', async () => {
    await deleteReview('r1')
    expect(queries[0].table).toBe('mt_reviews')
    expect(callsOf(queries[0], 'eq')).toEqual([['id', 'r1']])
    deleteResult = { data: [], error: null }
    await expect(deleteReview('r1')).rejects.toThrow(/nothing was deleted/i)
  })
})

describe('ReviewsSection', () => {
  it('lists the reviews with stars, date and text', async () => {
    render(<ReviewsSection listingId="L1" />)
    const items = await screen.findAllByRole('article')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByLabelText('5 out of 5 stars')).toBeTruthy()
    expect(within(items[0]).getByText('Oct 2026')).toBeTruthy()
    expect(within(items[0]).getByText('Wonderful guide.')).toBeTruthy()
    expect(within(items[1]).getByText('Too crowded.')).toBeTruthy()
  })

  it('creates a review with source manual', async () => {
    render(<ReviewsSection listingId="L1" />)
    const add = await screen.findByRole('form', { name: 'Add review' })
    fireEvent.change(within(add).getByLabelText(/star rating/i), { target: { value: '4' } })
    fireEvent.change(within(add).getByLabelText(/review text/i), { target: { value: '  Good value.  ' } })
    fireEvent.change(within(add).getByLabelText(/date/i), { target: { value: 'Nov 2026' } })
    fireEvent.click(within(add).getByRole('button', { name: 'Add review' }))

    await waitFor(() => expect(writes('insert')).toHaveLength(1))
    const [q] = writes('insert')
    expect(q.table).toBe('mt_reviews')
    expect(callsOf(q, 'insert')[0][0]).toEqual({
      listing_id: 'L1', star_rating: 4, review_text: 'Good value.', review_date: 'Nov 2026', source: 'manual',
    })
    // The list reloads and the add form clears.
    await waitFor(() => expect((within(add).getByLabelText(/review text/i) as HTMLTextAreaElement).value).toBe(''))
  })

  it.each([
    ['empty text', '4', '   ', /review text is required/i],
    ['rating 0', '0', 'Fine', /1 to 5/],
    ['rating 6', '6', 'Fine', /1 to 5/],
    ['no rating', '', 'Fine', /1 to 5/],
  ])('does not save with %s', async (_label, stars, text, message) => {
    render(<ReviewsSection listingId="L1" />)
    const add = await screen.findByRole('form', { name: 'Add review' })
    fireEvent.change(within(add).getByLabelText(/star rating/i), { target: { value: stars } })
    fireEvent.change(within(add).getByLabelText(/review text/i), { target: { value: text } })
    fireEvent.click(within(add).getByRole('button', { name: 'Add review' }))
    expect(await within(add).findByText(message)).toBeTruthy()
    expect(writes('insert')).toHaveLength(0)
  })

  it('edits a review, pre-filled with its current values', async () => {
    render(<ReviewsSection listingId="L1" />)
    const [first] = await screen.findAllByRole('article')
    fireEvent.click(within(first).getByRole('button', { name: 'Edit' }))

    const edit = within(first).getByRole('form', { name: 'Edit review' })
    expect((within(edit).getByLabelText(/star rating/i) as HTMLInputElement).value).toBe('5')
    expect((within(edit).getByLabelText(/review text/i) as HTMLTextAreaElement).value).toBe('Wonderful guide.')
    expect((within(edit).getByLabelText(/date/i) as HTMLInputElement).value).toBe('Oct 2026')

    fireEvent.change(within(edit).getByLabelText(/star rating/i), { target: { value: '3' } })
    fireEvent.change(within(edit).getByLabelText(/date/i), { target: { value: '' } })
    fireEvent.click(within(edit).getByRole('button', { name: 'Save review' }))

    await waitFor(() => expect(writes('update')).toHaveLength(1))
    const [q] = writes('update')
    expect(q.table).toBe('mt_reviews')
    expect(callsOf(q, 'update')[0][0]).toEqual({ star_rating: 3, review_text: 'Wonderful guide.', review_date: null })
    expect(callsOf(q, 'eq')).toEqual([['id', 'r1']])
  })

  it('does not save an edit that empties the text', async () => {
    render(<ReviewsSection listingId="L1" />)
    const [first] = await screen.findAllByRole('article')
    fireEvent.click(within(first).getByRole('button', { name: 'Edit' }))
    const edit = within(first).getByRole('form', { name: 'Edit review' })
    fireEvent.change(within(edit).getByLabelText(/review text/i), { target: { value: '' } })
    fireEvent.click(within(edit).getByRole('button', { name: 'Save review' }))
    expect(await within(edit).findByText(/review text is required/i)).toBeTruthy()
    expect(writes('update')).toHaveLength(0)
  })

  it('asks before deleting, and cancel deletes nothing', async () => {
    render(<ReviewsSection listingId="L1" />)
    const [first] = await screen.findAllByRole('article')
    fireEvent.click(within(first).getByRole('button', { name: 'Delete' }))
    const dialog = within(first).getByRole('alertdialog', { name: 'Confirm delete review' })
    expect(dialog.textContent).toMatch(/delete this review/i)
    expect(writes('delete')).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(within(first).queryByRole('alertdialog')).toBeNull()
    expect(writes('delete')).toHaveLength(0)
  })

  it('deletes the review after confirming', async () => {
    render(<ReviewsSection listingId="L1" />)
    const [first] = await screen.findAllByRole('article')
    fireEvent.click(within(first).getByRole('button', { name: 'Delete' }))
    const dialog = within(first).getByRole('alertdialog', { name: 'Confirm delete review' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, delete review' }))
    await waitFor(() => expect(writes('delete')).toHaveLength(1))
    const [q] = writes('delete')
    expect(q.table).toBe('mt_reviews')
    expect(callsOf(q, 'eq')).toEqual([['id', 'r1']])
  })

  it('shows the error when a delete removes nothing', async () => {
    deleteResult = { data: [], error: null }
    render(<ReviewsSection listingId="L1" />)
    const [first] = await screen.findAllByRole('article')
    fireEvent.click(within(first).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(first).getByRole('button', { name: 'Yes, delete review' }))
    expect((await within(first).findByRole('alert')).textContent).toMatch(/nothing was deleted/i)
  })
})
