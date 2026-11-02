import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { callsOf, createFakeSupabase, type Query, type Result } from './test/fakeSupabase'
import { supabase } from '../../lib/supabase'
import ListingsPage from './ListingsPage'
import NewListingForm from './NewListingForm'
import SnapshotForm from './SnapshotForm'
import SnapshotList from './SnapshotList'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

let respond: (q: Query) => Result
let queries: Query[]

beforeEach(() => {
  respond = () => ({ data: [], error: null })
  const fake = createFakeSupabase((q) => respond(q))
  queries = fake.queries
  vi.mocked(supabase.from).mockImplementation(fake.client.from as never)
})

const inserts = () => queries.filter((q) => callsOf(q, 'insert').length > 0)

describe('ListingsPage', () => {
  it('shows name, own/competitor, source and active status for each listing', async () => {
    respond = () => ({
      data: [
        { id: '1', name: 'Our Safari', is_own: true, source: 'viator', active: true },
        { id: '2', name: 'Rival Safari', is_own: false, source: 'tripadvisor', active: false },
      ],
      error: null,
    })
    render(<ListingsPage />)

    const own = (await screen.findByText('Our Safari')).closest('tr')!
    expect(within(own).getByText('Own')).toBeTruthy()
    expect(within(own).getByText('viator')).toBeTruthy()
    expect(within(own).getByText('Active')).toBeTruthy()

    const rival = screen.getByText('Rival Safari').closest('tr')!
    expect(within(rival).getByText('Competitor')).toBeTruthy()
    expect(within(rival).getByText('tripadvisor')).toBeTruthy()
    expect(within(rival).getByText('Inactive')).toBeTruthy()
  })

  it('shows an empty state', async () => {
    render(<ListingsPage />)
    expect(await screen.findByText(/no listings yet/i)).toBeTruthy()
  })

  it('shows a load error', async () => {
    respond = () => ({ data: null, error: { message: 'boom' } })
    render(<ListingsPage />)
    expect(await screen.findByText(/boom/)).toBeTruthy()
  })
})

describe('NewListingForm', () => {
  it('rejects an empty name and does not insert', async () => {
    render(<NewListingForm onCreated={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /create listing/i }))
    expect(await screen.findByText(/name is required/i)).toBeTruthy()
    expect(inserts()).toHaveLength(0)
  })

  it('inserts the mapped row and reports the new listing', async () => {
    respond = () => ({ data: { id: 'new-1' }, error: null })
    const onCreated = vi.fn()
    render(<NewListingForm onCreated={onCreated} />)

    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Rival Safari' } })
    fireEvent.click(screen.getByLabelText(/competitor/i, { selector: 'input[type=radio]' }))
    fireEvent.change(screen.getByLabelText(/source/i), { target: { value: 'tripadvisor' } })
    fireEvent.change(screen.getByLabelText(/url/i), { target: { value: 'https://example.com/t' } })
    fireEvent.change(screen.getByLabelText(/competitor name/i), { target: { value: 'Rival Co' } })
    fireEvent.click(screen.getByRole('button', { name: /create listing/i }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-1'))
    const [q] = inserts()
    expect(q.table).toBe('mt_listings')
    expect(callsOf(q, 'insert')[0][0]).toEqual({
      name: 'Rival Safari',
      is_own: false,
      source: 'tripadvisor',
      url: 'https://example.com/t',
      competitor_name: 'Rival Co',
      active: true,
    })
  })
})

describe('SnapshotForm', () => {
  it('saves a manual, complete snapshot with parsed fields', async () => {
    respond = () => ({ data: { id: 's1' }, error: null })
    const onSaved = vi.fn()
    render(<SnapshotForm listingId="L1" onSaved={onSaved} />)

    const set = (label: RegExp, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    set(/^title/i, 'Red Dunes')
    set(/languages/i, 'English, Arabic')
    set(/highlights/i, 'Dunes\nSunset')
    set(/itinerary/i, 'Pickup\nDinner')
    set(/options/i, 'Shared | Group | 150')
    set(/^rating/i, '4.5')
    set(/review count/i, '120')
    fireEvent.click(screen.getByRole('button', { name: /save snapshot/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [q] = inserts()
    expect(q.table).toBe('mt_snapshots')
    expect(callsOf(q, 'insert')[0][0]).toMatchObject({
      listing_id: 'L1',
      method: 'manual',
      status: 'complete',
      title: 'Red Dunes',
      languages: ['English', 'Arabic'],
      highlights: ['Dunes', 'Sunset'],
      itinerary: ['Pickup', 'Dinner'],
      options: [{ name: 'Shared', description: 'Group', price: 150 }],
      rating: 4.5,
      review_count: 120,
    })
  })

  it('shows a parse error for an invalid price and does not insert', async () => {
    render(<SnapshotForm listingId="L1" onSaved={() => {}} />)
    fireEvent.change(screen.getByLabelText(/options/i), { target: { value: 'Shared | Group | cheap' } })
    fireEvent.click(screen.getByRole('button', { name: /save snapshot/i }))
    expect(await screen.findByText(/price/i, { selector: '[role=alert]' })).toBeTruthy()
    expect(inserts()).toHaveLength(0)
  })
})

describe('SnapshotList', () => {
  it('requests snapshots newest first and renders them in that order', async () => {
    respond = () => ({
      data: [
        { id: 'b', listing_id: 'L1', title: 'Newer', captured_at: '2026-11-02T10:00:00Z', options: [], highlights: [], languages: [], itinerary: [] },
        { id: 'a', listing_id: 'L1', title: 'Older', captured_at: '2026-10-01T10:00:00Z', options: [], highlights: [], languages: [], itinerary: [] },
      ],
      error: null,
    })
    render(<SnapshotList listingId="L1" refreshKey={0} />)

    const items = await screen.findAllByRole('article')
    expect(items.map((el) => within(el).getByRole('heading').textContent)).toEqual(['Newer', 'Older'])
    expect(queries[0].table).toBe('mt_snapshots')
    expect(callsOf(queries[0], 'order')).toEqual([['captured_at', { ascending: false }]])
  })

  it('shows the date from captured_at', async () => {
    const at = '2026-11-02T10:00:00Z'
    respond = () => ({
      data: [{ id: 'c', listing_id: 'L1', title: 'Dated', captured_at: at }],
      error: null,
    })
    render(<SnapshotList listingId="L1" refreshKey={0} />)
    const item = await screen.findByRole('article')
    const shown = new Date(at).toLocaleString()
    expect(within(item).getByText((text) => text.includes(shown))).toBeTruthy()
    expect(within(item).queryByText(/unknown date/i)).toBeNull()
  })

  it('shows an empty state', async () => {
    render(<SnapshotList listingId="L1" refreshKey={0} />)
    expect(await screen.findByText(/no snapshots yet/i)).toBeTruthy()
  })
})
