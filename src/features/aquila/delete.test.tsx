import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { callsOf, createFakeSupabase, type Query, type Result } from './test/fakeSupabase'
import { supabase } from '../../lib/supabase'
import { countSnapshots, deleteListing } from './api'
import ListingDetailPage from './ListingDetailPage'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

let queries: Query[]
let snapshotCount: number
let deleteResult: Result

const listing = { id: 'L1', name: 'Rival Safari', is_own: false, source: 'viator', url: null, competitor_name: null, active: true }

const isDelete = (q: Query) => callsOf(q, 'delete').length > 0
const isCount = (q: Query) =>
  callsOf(q, 'select').some((args) => (args[1] as { head?: boolean } | undefined)?.head === true)

function respond(q: Query): Result {
  if (q.table === 'mt_listings' && isDelete(q)) return deleteResult
  if (q.table === 'mt_listings') return { data: listing, error: null }
  if (q.table === 'mt_snapshots' && isCount(q)) return { data: null, error: null, count: snapshotCount }
  return { data: [], error: null }
}

beforeEach(() => {
  snapshotCount = 3
  deleteResult = { data: [{ id: 'L1' }], error: null }
  const fake = createFakeSupabase((q) => respond(q))
  queries = fake.queries
  vi.mocked(supabase.from).mockImplementation(fake.client.from as never)
  window.location.hash = '#/listings/L1'
})

const deletes = () => queries.filter(isDelete)

describe('deleteListing', () => {
  it('deletes exactly one row from mt_listings by id', async () => {
    await deleteListing('L1')
    expect(queries).toHaveLength(1)
    expect(queries[0].table).toBe('mt_listings')
    expect(callsOf(queries[0], 'delete')).toEqual([[]])
    expect(callsOf(queries[0], 'eq')).toEqual([['id', 'L1']])
  })

  it('never touches mt_snapshots directly; the database cascades', async () => {
    await deleteListing('L1')
    expect(queries.filter((q) => q.table === 'mt_snapshots')).toHaveLength(0)
  })

  it('throws when nothing was deleted', async () => {
    deleteResult = { data: [], error: null }
    await expect(deleteListing('L1')).rejects.toThrow(/nothing was deleted/i)
  })

  it('throws the Supabase error message', async () => {
    deleteResult = { data: null, error: { message: 'permission denied' } }
    await expect(deleteListing('L1')).rejects.toThrow('permission denied')
  })
})

describe('countSnapshots', () => {
  it('counts mt_snapshots for one listing without downloading rows', async () => {
    expect(await countSnapshots('L1')).toBe(3)
    expect(queries[0].table).toBe('mt_snapshots')
    expect(callsOf(queries[0], 'select')).toEqual([['id', { count: 'exact', head: true }]])
    expect(callsOf(queries[0], 'eq')).toEqual([['listing_id', 'L1']])
  })
})

describe('ListingDetailPage delete', () => {
  async function openConfirm() {
    render(<ListingDetailPage id="L1" />)
    fireEvent.click(await screen.findByRole('button', { name: /delete listing/i }))
    return screen.findByRole('alertdialog', { name: /confirm delete/i })
  }

  it('asks first, saying how many snapshots will also be deleted', async () => {
    const dialog = await openConfirm()
    expect(dialog.textContent).toMatch(/Rival Safari/)
    expect(dialog.textContent).toMatch(/also delete 3 snapshots/)
    expect(deletes()).toHaveLength(0)
  })

  it('uses the singular for one snapshot', async () => {
    snapshotCount = 1
    const dialog = await openConfirm()
    expect(dialog.textContent).toMatch(/also delete 1 snapshot\./)
  })

  it('deletes and goes back to the listings list after confirming', async () => {
    const dialog = await openConfirm()
    fireEvent.click(within(dialog).getByRole('button', { name: /yes, delete listing/i }))
    await waitFor(() => expect(window.location.hash).toBe('#/'))
    expect(deletes()).toHaveLength(1)
    expect(callsOf(deletes()[0], 'eq')).toEqual([['id', 'L1']])
  })

  it('does nothing when cancelled', async () => {
    const dialog = await openConfirm()
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByRole('button', { name: /delete listing/i })).toBeTruthy()
    expect(deletes()).toHaveLength(0)
    expect(window.location.hash).toBe('#/listings/L1')
  })

  it('shows the error and stays on the page when the delete fails', async () => {
    deleteResult = { data: [], error: null }
    const dialog = await openConfirm()
    fireEvent.click(within(dialog).getByRole('button', { name: /yes, delete listing/i }))
    expect((await screen.findByText(/could not delete/i)).textContent).toMatch(/nothing was deleted/i)
    expect(window.location.hash).toBe('#/listings/L1')
  })
})
