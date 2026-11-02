import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { callsOf, createFakeSupabase, type Query, type Result } from './test/fakeSupabase'
import { supabase } from '../../lib/supabase'
import { deleteSnapshot, updateListing, updateSnapshot } from './api'
import { snapshotFormToRow, snapshotRowToForm } from './mapping'
import ListingDetailPage from './ListingDetailPage'
import SnapshotList from './SnapshotList'
import type { Snapshot } from './types'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

const has = (q: Query, m: string) => callsOf(q, m).length > 0

let queries: Query[]
let listing: Record<string, unknown>
let snapshots: Snapshot[]
let deleteResult: Result

const completeSnapshot: Snapshot = {
  id: 's1',
  listing_id: 'L1',
  method: 'assisted',
  status: 'complete',
  captured_at: '2026-10-30T10:00:00Z',
  title: 'Desert Safari',
  overview: 'Dunes, camels and dinner.',
  duration: '6 hours',
  languages: ['English', 'Arabic'],
  group_type: 'Shared',
  highlights: ['Dune bashing', 'Camel ride'],
  inclusions: 'Pickup',
  exclusions: 'Drinks',
  why_this: 'Top rated',
  itinerary: ['Pickup', 'Dunes', 'Dinner'],
  options: [
    { name: 'Shared', description: 'Group transfer', price: 150 },
    { name: 'Private', description: null, price: null },
  ],
  rating: 4.7,
  review_count: 1234,
  urgency_text: 'Likely to sell out',
} as Snapshot

function respond(q: Query): Result {
  if (q.table === 'mt_listings') {
    if (has(q, 'update')) return { data: { ...listing, ...(callsOf(q, 'update')[0][0] as object) }, error: null }
    return { data: listing, error: null }
  }
  if (q.table === 'mt_snapshots') {
    if (has(q, 'delete')) return deleteResult
    if (has(q, 'update')) return { data: { ...snapshots[0], ...(callsOf(q, 'update')[0][0] as object) }, error: null }
    return { data: snapshots, error: null }
  }
  return { data: [], error: null }
}

beforeEach(() => {
  listing = {
    id: 'L1', name: 'Rival Safari', is_own: false, source: 'viator',
    url: 'https://example.com/a', competitor_name: 'Rival Co', active: true,
  }
  snapshots = [completeSnapshot]
  deleteResult = { data: [{ id: 's1' }], error: null }
  const fake = createFakeSupabase((q) => respond(q))
  queries = fake.queries
  vi.mocked(supabase.from).mockImplementation(fake.client.from as never)
  window.location.hash = '#/listings/L1'
})

const writes = (m: 'insert' | 'update' | 'delete') => queries.filter((q) => has(q, m))

// ---------- api ----------

describe('editing api', () => {
  it('updateListing updates one mt_listings row by id', async () => {
    const patch = { name: 'N', source: 'manual' as const, url: null, competitor_name: null, active: false }
    await updateListing('L1', patch)
    expect(queries[0].table).toBe('mt_listings')
    expect(callsOf(queries[0], 'update')).toEqual([[patch]])
    expect(callsOf(queries[0], 'eq')).toEqual([['id', 'L1']])
  })

  it('updateSnapshot updates one mt_snapshots row by id', async () => {
    const f = snapshotFormToRow('L1', snapshotRowToForm(completeSnapshot))
    if (!f.ok) throw new Error('fixture should map')
    const { listing_id: _l, method: _m, ...patch } = f.row
    await updateSnapshot('s1', patch)
    expect(queries[0].table).toBe('mt_snapshots')
    expect(callsOf(queries[0], 'update')).toEqual([[patch]])
    expect(callsOf(queries[0], 'eq')).toEqual([['id', 's1']])
  })

  it('deleteSnapshot deletes one mt_snapshots row by id, and fails if nothing was deleted', async () => {
    await deleteSnapshot('s1')
    expect(queries[0].table).toBe('mt_snapshots')
    expect(callsOf(queries[0], 'delete')).toEqual([[]])
    expect(callsOf(queries[0], 'eq')).toEqual([['id', 's1']])
    deleteResult = { data: [], error: null }
    await expect(deleteSnapshot('s1')).rejects.toThrow(/nothing was deleted/i)
  })
})

// ---------- snapshotRowToForm ----------

describe('snapshotRowToForm', () => {
  it('fills the form with the saved values', () => {
    expect(snapshotRowToForm(completeSnapshot)).toEqual({
      title: 'Desert Safari',
      overview: 'Dunes, camels and dinner.',
      duration: '6 hours',
      languages: 'English, Arabic',
      group_type: 'Shared',
      highlights: 'Dune bashing\nCamel ride',
      inclusions: 'Pickup',
      exclusions: 'Drinks',
      why_this: 'Top rated',
      itinerary: 'Pickup\nDunes\nDinner',
      options: 'Shared | Group transfer | 150\nPrivate',
      rating: '4.7',
      review_count: '1234',
      urgency_text: 'Likely to sell out',
    })
  })

  it('round-trips through snapshotFormToRow to the same values', () => {
    const r = snapshotFormToRow('L1', snapshotRowToForm(completeSnapshot))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const { id: _i, method: _m, captured_at: _c, ...saved } = completeSnapshot as Snapshot & { method: string }
    expect(r.row).toMatchObject(saved)
  })

  it('turns missing values into empty text', () => {
    const f = snapshotRowToForm({ id: 's2', listing_id: 'L1' } as Snapshot)
    expect(Object.values(f).every((v) => v === '')).toBe(true)
  })
})

// ---------- editing a listing ----------

describe('Edit listing', () => {
  async function openEdit() {
    render(<ListingDetailPage id="L1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit listing' }))
    return screen.getByRole('form', { name: 'Edit listing' })
  }

  it('is pre-filled with the current values', async () => {
    const form = await openEdit()
    expect((within(form).getByLabelText('Name *') as HTMLInputElement).value).toBe('Rival Safari')
    expect((within(form).getByLabelText('Source') as HTMLSelectElement).value).toBe('viator')
    expect((within(form).getByLabelText('URL') as HTMLInputElement).value).toBe('https://example.com/a')
    expect((within(form).getByLabelText('Competitor name') as HTMLInputElement).value).toBe('Rival Co')
    expect((within(form).getByLabelText('Active') as HTMLInputElement).checked).toBe(true)
  })

  it('saves name, source, URL, competitor name and active, and shows the new values', async () => {
    const form = await openEdit()
    fireEvent.change(within(form).getByLabelText('Name *'), { target: { value: '  New Name  ' } })
    fireEvent.change(within(form).getByLabelText('Source'), { target: { value: 'tripadvisor' } })
    fireEvent.change(within(form).getByLabelText('URL'), { target: { value: '' } })
    fireEvent.change(within(form).getByLabelText('Competitor name'), { target: { value: 'Other Co' } })
    fireEvent.click(within(form).getByLabelText('Active'))
    fireEvent.click(within(form).getByRole('button', { name: 'Save listing' }))

    await waitFor(() => expect(writes('update')).toHaveLength(1))
    const [q] = writes('update')
    expect(q.table).toBe('mt_listings')
    expect(callsOf(q, 'update')[0][0]).toEqual({
      name: 'New Name', source: 'tripadvisor', url: null, competitor_name: 'Other Co', active: false,
    })
    expect(callsOf(q, 'eq')).toEqual([['id', 'L1']])

    expect(await screen.findByRole('heading', { name: 'New Name' })).toBeTruthy()
    expect(screen.getByText(/Inactive/)).toBeTruthy()
    expect(screen.queryByRole('form', { name: 'Edit listing' })).toBeNull()
  })

  it('does not change whether the listing is own or competitor', async () => {
    const form = await openEdit()
    fireEvent.click(within(form).getByRole('button', { name: 'Save listing' }))
    await waitFor(() => expect(writes('update')).toHaveLength(1))
    expect(callsOf(writes('update')[0], 'update')[0][0]).not.toHaveProperty('is_own')
  })

  it.each([
    ['an empty name', 'name', '   ', /name is required/i],
    ['a URL without http', 'url', 'example.com', /must start with http/i],
  ])('does not save with %s', async (_label, field, value, message) => {
    const form = await openEdit()
    const input = field === 'name'
      ? within(form).getByLabelText('Name *')
      : within(form).getByLabelText('URL')
    fireEvent.change(input, { target: { value } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save listing' }))
    expect(await within(form).findByText(message)).toBeTruthy()
    expect(writes('update')).toHaveLength(0)
  })

  it('cancel closes the form without saving', async () => {
    const form = await openEdit()
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form', { name: 'Edit listing' })).toBeNull()
    expect(writes('update')).toHaveLength(0)
  })
})

// ---------- deleting a snapshot ----------

describe('SnapshotList delete', () => {
  async function openConfirm() {
    render(<SnapshotList listingId="L1" refreshKey={0} />)
    const [article] = await screen.findAllByRole('article')
    fireEvent.click(within(article).getByRole('button', { name: 'Delete' }))
    return { article, dialog: within(article).getByRole('alertdialog', { name: 'Confirm delete snapshot' }) }
  }

  it('asks first, naming the snapshot, and deletes nothing yet', async () => {
    const { dialog } = await openConfirm()
    expect(dialog.textContent).toMatch(/Desert Safari/)
    expect(writes('delete')).toHaveLength(0)
  })

  it('cancel deletes nothing', async () => {
    const { article, dialog } = await openConfirm()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(within(article).queryByRole('alertdialog')).toBeNull()
    expect(writes('delete')).toHaveLength(0)
  })

  it('deletes only that snapshot after confirming, then reloads the list', async () => {
    const { dialog } = await openConfirm()
    snapshots = []
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, delete snapshot' }))
    await waitFor(() => expect(writes('delete')).toHaveLength(1))
    const [q] = writes('delete')
    expect(q.table).toBe('mt_snapshots')
    expect(callsOf(q, 'eq')).toEqual([['id', 's1']])
    expect(await screen.findByText('No snapshots yet.')).toBeTruthy()
  })

  it('shows the error when nothing was deleted', async () => {
    deleteResult = { data: [], error: null }
    const { article, dialog } = await openConfirm()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, delete snapshot' }))
    expect((await within(article).findByRole('alert')).textContent).toMatch(/nothing was deleted/i)
  })
})

// ---------- editing a snapshot ----------

describe('SnapshotList edit', () => {
  async function openEdit() {
    render(<SnapshotList listingId="L1" refreshKey={0} />)
    const [article] = await screen.findAllByRole('article')
    fireEvent.click(within(article).getByRole('button', { name: 'Edit' }))
    return article
  }
  const field = (article: HTMLElement, label: RegExp) =>
    within(article).getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement
  const save = (article: HTMLElement) =>
    fireEvent.click(within(article).getByRole('button', { name: 'Save snapshot' }))
  const sentPatch = () => callsOf(writes('update')[0], 'update')[0][0] as Record<string, unknown>

  it('reuses the snapshot form, pre-filled with the current values', async () => {
    const article = await openEdit()
    expect(within(article).getByRole('heading', { name: 'Edit snapshot' })).toBeTruthy()
    expect(field(article, /^title/i).value).toBe('Desert Safari')
    expect(field(article, /^duration/i).value).toBe('6 hours')
    expect(field(article, /^languages/i).value).toBe('English, Arabic')
    expect(field(article, /^highlights/i).value).toBe('Dune bashing\nCamel ride')
    expect(field(article, /^options/i).value).toBe('Shared | Group transfer | 150\nPrivate')
    expect(field(article, /^rating/i).value).toBe('4.7')
    expect(field(article, /^review count/i).value).toBe('1234')
  })

  it('saves to that snapshot only, keeping its method, listing and overview', async () => {
    const article = await openEdit()
    fireEvent.change(field(article, /^title/i), { target: { value: 'Desert Safari Deluxe' } })
    save(article)
    await waitFor(() => expect(writes('update')).toHaveLength(1))
    const [q] = writes('update')
    expect(q.table).toBe('mt_snapshots')
    expect(callsOf(q, 'eq')).toEqual([['id', 's1']])
    expect(writes('insert')).toHaveLength(0)
    const patch = sentPatch()
    expect(patch.title).toBe('Desert Safari Deluxe')
    expect(patch.overview).toBe('Dunes, camels and dinner.')
    expect(patch).not.toHaveProperty('method')
    expect(patch).not.toHaveProperty('listing_id')
    expect(patch).not.toHaveProperty('id')
  })

  it('recalculates status: complete becomes partial when a core field is cleared', async () => {
    const article = await openEdit()
    fireEvent.change(field(article, /^rating/i), { target: { value: '' } })
    save(article)
    await waitFor(() => expect(writes('update')).toHaveLength(1))
    expect(sentPatch()).toMatchObject({ status: 'partial', rating: null })
  })

  it('recalculates status: complete becomes partial when the last option price is removed', async () => {
    const article = await openEdit()
    fireEvent.change(field(article, /^options/i), { target: { value: 'Shared | Group transfer |\nPrivate' } })
    save(article)
    await waitFor(() => expect(writes('update')).toHaveLength(1))
    expect(sentPatch().status).toBe('partial')
  })

  it('recalculates status: partial becomes complete once every core field and a price are filled in', async () => {
    snapshots = [{ ...completeSnapshot, status: 'partial', duration: null, options: [] } as Snapshot]
    const article = await openEdit()
    fireEvent.change(field(article, /^duration/i), { target: { value: '5 hours' } })
    fireEvent.change(field(article, /^options/i), { target: { value: 'Shared | | 120' } })
    save(article)
    await waitFor(() => expect(writes('update')).toHaveLength(1))
    expect(sentPatch()).toMatchObject({
      status: 'complete', duration: '5 hours', options: [{ name: 'Shared', description: null, price: 120 }],
    })
  })

  it('does not save invalid values', async () => {
    const article = await openEdit()
    fireEvent.change(field(article, /^rating/i), { target: { value: '9' } })
    save(article)
    expect(await within(article).findByText(/rating/i, { selector: 'p' })).toBeTruthy()
    expect(writes('update')).toHaveLength(0)
  })

  it('cancel editing saves nothing and shows the snapshot again', async () => {
    const article = await openEdit()
    fireEvent.click(within(article).getByRole('button', { name: 'Cancel editing' }))
    expect(within(article).queryByRole('heading', { name: 'Edit snapshot' })).toBeNull()
    expect(within(article).getByRole('heading', { name: 'Desert Safari' })).toBeTruthy()
    expect(writes('update')).toHaveLength(0)
  })
})
