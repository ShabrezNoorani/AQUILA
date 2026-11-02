import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { callsOf, createFakeSupabase, type Query, type Result } from './test/fakeSupabase'
import { supabase } from '../../lib/supabase'
import ListingsPage from './ListingsPage'
import NewListingForm from './NewListingForm'
import SnapshotForm from './SnapshotForm'
import SnapshotList from './SnapshotList'
import viator2 from '../../../fixtures/viator-2.html?raw'
import { parseViatorListing } from './capture/viatorParser'

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
    respond = (q) => (q.table === 'mt_listings' ? { data: null, error: { message: 'boom' } } : { data: [], error: null })
    render(<ListingsPage />)
    expect(await screen.findByText(/could not load listings: boom/i)).toBeTruthy()
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
    respond = (q) => {
      if (q.table === 'mt_tags') {
        return { data: [{ id: 'T1', name: 'Tour', kind: 'type' }, { id: 'P1', name: 'Dubai', kind: 'place' }], error: null }
      }
      return { data: { id: 'new-1' }, error: null }
    }
    const onCreated = vi.fn()
    render(<NewListingForm onCreated={onCreated} />)
    fireEvent.click(await screen.findByLabelText('Tour'))
    fireEvent.click(screen.getByLabelText('Dubai'))

    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Rival Safari' } })
    fireEvent.click(screen.getByLabelText(/competitor/i, { selector: 'input[type=radio]' }))
    fireEvent.change(screen.getByLabelText(/source/i), { target: { value: 'tripadvisor' } })
    fireEvent.change(screen.getByLabelText(/url/i), { target: { value: 'https://example.com/t' } })
    fireEvent.change(screen.getByLabelText(/competitor name/i), { target: { value: 'Rival Co' } })
    fireEvent.click(screen.getByRole('button', { name: /create listing/i }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-1'))
    const [q, links] = inserts()
    expect(q.table).toBe('mt_listings')
    expect(links.table).toBe('mt_listing_tags')
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
  it('saves a manual snapshot with parsed fields, partial because duration is blank', async () => {
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
      status: 'partial',
      title: 'Red Dunes',
      languages: ['English', 'Arabic'],
      highlights: ['Dunes', 'Sunset'],
      itinerary: ['Pickup', 'Dinner'],
      options: [{ name: 'Shared', description: 'Group', price: 150 }],
      rating: 4.5,
      review_count: 120,
    })
  })

  it('saves status complete when every core field and a priced option are filled in', async () => {
    respond = () => ({ data: { id: 's2' }, error: null })
    const onSaved = vi.fn()
    render(<SnapshotForm listingId="L1" onSaved={onSaved} />)

    const set = (label: RegExp, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    set(/^title/i, 'Red Dunes')
    set(/^duration/i, '6 hours')
    set(/languages/i, 'English')
    set(/options/i, 'Shared | Group | 150')
    set(/^rating/i, '4.5')
    set(/review count/i, '120')
    fireEvent.click(screen.getByRole('button', { name: /save snapshot/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(callsOf(inserts()[0], 'insert')[0][0]).toMatchObject({ method: 'manual', status: 'complete' })
  })

  it('also saves each option to mt_snapshot_options, in order, through the shared save path', async () => {
    respond = () => ({ data: { id: 's7' }, error: null })
    const onSaved = vi.fn()
    render(<SnapshotForm listingId="L1" onSaved={onSaved} />)
    fireEvent.change(screen.getByLabelText(/options/i), {
      target: { value: 'Shared | Priced for 2 travelers, Dec 5, 2026 | 150\nPrivate |  | 300' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save snapshot/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(inserts().map((q) => q.table)).toEqual(['mt_snapshots', 'mt_snapshot_options'])
    expect(callsOf(inserts()[1], 'insert')[0][0]).toEqual([
      { snapshot_id: 's7', sort_order: 0, name: 'Shared', description: 'Priced for 2 travelers, Dec 5, 2026', price_per_person: 150, travelers: 2, price_date: '2026-12-05' },
      { snapshot_id: 's7', sort_order: 1, name: 'Private', description: null, price_per_person: 300, travelers: null, price_date: null },
    ])
  })

  it('shows the error and does not report success when the options cannot be saved', async () => {
    respond = (q) => {
      if (q.table === 'mt_snapshot_options') return { data: null, error: { message: 'options denied' } }
      if (callsOf(q, 'delete').length) return { data: [{ id: 's8' }], error: null }
      return { data: { id: 's8' }, error: null }
    }
    const onSaved = vi.fn()
    render(<SnapshotForm listingId="L1" onSaved={onSaved} />)
    fireEvent.change(screen.getByLabelText(/options/i), { target: { value: 'Shared | Group | 150' } })
    fireEvent.click(screen.getByRole('button', { name: /save snapshot/i }))
    expect(await screen.findByText(/snapshot was not saved: options denied/i)).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('shows a parse error for an invalid price and does not insert', async () => {
    render(<SnapshotForm listingId="L1" onSaved={() => {}} />)
    fireEvent.change(screen.getByLabelText(/options/i), { target: { value: 'Shared | Group | cheap' } })
    fireEvent.click(screen.getByRole('button', { name: /save snapshot/i }))
    expect(await screen.findByText(/price/i, { selector: '[role=alert]' })).toBeTruthy()
    expect(inserts()).toHaveLength(0)
  })
})

const VIATOR2_OVERVIEW = [
  'Discover the history, beauty, and remarkable rebirth of Notre-Dame Cathedral with an expert local Paris guide on this immersive walking experience through the heart of historic Paris.',
  'Your experience begins with a comprehensive guided walking tour around the exterior of the newly restored Notre-Dame Cathedral and the historic Île de la Cité.',
  'Following your guided introduction, you are free to enter Notre-Dame Cathedral independently allowing you to explore the magnificent interior at your own pace and discover its beauty in a peaceful and personal way.',
  'Unlike a traditional interior guided tour, this experience gives you the freedom to spend as much time as you wish inside the cathedral after receiving all the historical context and recommendations from your guide.',
  "You'll also explore the enchanting streets of the Île de la Cité, the birthplace of Paris, discovering hidden squares, historic bridges, medieval streets, and many of the city's most iconic landmarks.",
].join('\n')

describe('SnapshotList', () => {
  it('shows a snapshot overview from viator-2, one paragraph per line', async () => {
    const parsed = parseViatorListing(viator2, 'https://www.viator.com/tours/Paris/x/d479-8954P40')
    respond = () => ({
      data: [{ id: 'v2', listing_id: 'L1', title: parsed.fields.title, overview: parsed.fields.overview, captured_at: '2026-11-02T10:00:00Z' }],
      error: null,
    })
    render(<SnapshotList listingId="L1" refreshKey={0} />)

    const item = await screen.findByRole('article')
    const dt = within(item).getByText('Overview', { selector: 'dt' })
    const dd = dt.nextElementSibling as HTMLElement
    expect(dd.textContent).toBe(VIATOR2_OVERVIEW)
    expect(dd.className).toContain('whitespace-pre-line')
  }, 30_000)

  it('leaves out the overview when a snapshot has none', async () => {
    respond = () => ({ data: [{ id: 'x', listing_id: 'L1', title: 'No overview', overview: null }], error: null })
    render(<SnapshotList listingId="L1" refreshKey={0} />)
    const item = await screen.findByRole('article')
    expect(within(item).queryByText('Overview', { selector: 'dt' })).toBeNull()
  })

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
