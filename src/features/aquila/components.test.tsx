import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { callsOf, createFakeSupabase, type Query, type Result } from './test/fakeSupabase'
import { supabase } from '../../lib/supabase'
import ListingDetailPage from './ListingDetailPage'
import ListingsPage from './ListingsPage'
import NewListingForm from './NewListingForm'
import SnapshotForm from './SnapshotForm'
import SnapshotList from './SnapshotList'
import viator2 from '../../../fixtures/viator-2.html?raw'
import { parseViatorListing } from './capture/viatorParser'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

let respond: (q: Query) => Result
let queries: Query[]

beforeEach(() => {
  respond = () => ({ data: [], error: null })
  const fake = createFakeSupabase((q) => respond(q))
  queries = fake.queries
  vi.mocked(supabase.from).mockImplementation(fake.client.from as never)
  rpcResult = { data: 's1', error: null }
  vi.mocked(supabase.rpc).mockReset()
  vi.mocked(supabase.rpc).mockImplementation((() => Promise.resolve(rpcResult)) as never)
})

type RpcArgs = { p_snapshot: Record<string, unknown>; p_options: Record<string, unknown>[] }
let rpcResult: { data: unknown; error: { message: string } | null }
const rpcCalls = () => vi.mocked(supabase.rpc).mock.calls as unknown as [string, RpcArgs][]

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
    respond = newListingRespond([])
    const onCreated = vi.fn()
    render(<NewListingForm onCreated={onCreated} />)
    fireEvent.click(await screen.findByLabelText('Tour'))
    fireEvent.click(screen.getByLabelText('Dubai'))

    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Rival Safari' } })
    fireEvent.change(screen.getByLabelText(/^company/i), { target: { value: '  Rival   Co ' } })
    fireEvent.change(screen.getByLabelText(/source/i), { target: { value: 'tripadvisor' } })
    fireEvent.change(screen.getByLabelText(/url/i), { target: { value: 'https://example.com/t' } })
    fireEvent.change(screen.getByLabelText(/competitor name/i), { target: { value: 'Rival Co' } })
    fireEvent.click(screen.getByRole('button', { name: /create listing/i }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-1'))
    const [company, q, links] = inserts()
    expect(company.table).toBe('mt_companies')
    expect(callsOf(company, 'insert')[0][0]).toEqual({ name: 'Rival Co', is_own: false })
    expect(q.table).toBe('mt_listings')
    expect(links.table).toBe('mt_listing_tags')
    expect(callsOf(q, 'insert')[0][0]).toEqual({
      name: 'Rival Safari',
      is_own: false,
      source: 'tripadvisor',
      url: 'https://example.com/t',
      competitor_name: 'Rival Co',
      active: true,
      company_id: 'C-new',
    })
  })

  it('requires a company and saves nothing without one', async () => {
    respond = newListingRespond([])
    render(<NewListingForm onCreated={() => {}} />)
    fireEvent.click(await screen.findByLabelText('Tour'))
    fireEvent.click(screen.getByLabelText('Dubai'))
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Rival Safari' } })
    fireEvent.change(screen.getByLabelText(/^company/i), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /create listing/i }))
    expect(await screen.findByText('Company is required')).toBeTruthy()
    expect(inserts()).toHaveLength(0)
  })

  it('reuses an existing company whatever its case and spacing, and suggests existing names', async () => {
    respond = newListingRespond([{ id: 'C1', name: 'Rival Co', is_own: false }])
    const onCreated = vi.fn()
    const { container } = render(<NewListingForm onCreated={onCreated} />)
    fireEvent.click(await screen.findByLabelText('Tour'))
    fireEvent.click(screen.getByLabelText('Dubai'))
    await waitFor(() => expect(container.querySelector('datalist option')?.getAttribute('value')).toBe('Rival Co'))
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Rival Safari' } })
    fireEvent.change(screen.getByLabelText(/^company/i), { target: { value: '  rival  CO ' } })
    fireEvent.click(screen.getByRole('button', { name: /create listing/i }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-1'))
    expect(inserts().map((q) => q.table)).toEqual(['mt_listings', 'mt_listing_tags'])
    expect(callsOf(inserts()[0], 'insert')[0][0]).toMatchObject({ company_id: 'C1' })
  })

  it('"This is ours (OWN)" sets is_own on the listing and on a new company', async () => {
    respond = newListingRespond([])
    const onCreated = vi.fn()
    render(<NewListingForm onCreated={onCreated} />)
    fireEvent.click(await screen.findByLabelText('Tour'))
    fireEvent.click(screen.getByLabelText('Dubai'))
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Our Safari' } })
    fireEvent.change(screen.getByLabelText(/^company/i), { target: { value: 'Scenic Zest Tours' } })
    const own = screen.getByLabelText('This is ours (OWN)') as HTMLInputElement
    expect(own.checked).toBe(false)
    fireEvent.click(own)
    fireEvent.click(screen.getByRole('button', { name: /create listing/i }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-1'))
    const [company, listing] = inserts()
    expect(callsOf(company, 'insert')[0][0]).toEqual({ name: 'Scenic Zest Tours', is_own: true })
    expect(callsOf(listing, 'insert')[0][0]).toMatchObject({ is_own: true, company_id: 'C-new' })
  })
})

/** Answers for the new listing form: two tags, the given companies, and ids for new rows. */
function newListingRespond(companies: Record<string, unknown>[]) {
  return (q: Query): Result => {
    if (q.table === 'mt_tags') {
      return { data: [{ id: 'T1', name: 'Tour', kind: 'type' }, { id: 'P1', name: 'Dubai', kind: 'place' }], error: null }
    }
    if (q.table === 'mt_companies' && callsOf(q, 'insert').length) {
      return { data: { id: 'C-new', ...(callsOf(q, 'insert')[0][0] as object) }, error: null }
    }
    if (q.table === 'mt_companies') return { data: companies, error: null }
    return { data: { id: 'new-1' }, error: null }
  }
}

describe('SnapshotForm', () => {
  const set = (label: RegExp, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } })

  it('saves a manual snapshot with one mt_save_snapshot call, partial because duration is blank', async () => {
    const onSaved = vi.fn()
    render(<SnapshotForm listingId="L1" onSaved={onSaved} />)
    set(/^title/i, 'Red Dunes')
    set(/languages/i, 'English, Arabic')
    set(/highlights/i, 'Dunes\nSunset')
    set(/itinerary/i, 'Pickup\nDinner')
    set(/options/i, 'Shared | Group | 150')
    set(/^rating/i, '4.5')
    set(/review count/i, '120')
    fireEvent.click(screen.getByRole('button', { name: /save snapshot/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(inserts()).toHaveLength(0)
    expect(rpcCalls()).toHaveLength(1)
    const [fn, { p_snapshot }] = rpcCalls()[0]
    expect(fn).toBe('mt_save_snapshot')
    expect(p_snapshot).toMatchObject({
      listing_id: 'L1',
      method: 'manual',
      status: 'partial',
      title: 'Red Dunes',
      languages: ['English', 'Arabic'],
      highlights: ['Dunes', 'Sunset'],
      itinerary: ['Pickup', 'Dinner'],
      rating: 4.5,
      review_count: 120,
    })
    expect(p_snapshot).not.toHaveProperty('options')
  })

  it('saves status complete when every core field and a priced option are filled in', async () => {
    const onSaved = vi.fn()
    render(<SnapshotForm listingId="L1" onSaved={onSaved} />)
    set(/^title/i, 'Red Dunes')
    set(/^duration/i, '6 hours')
    set(/languages/i, 'English')
    set(/options/i, 'Shared | Group | 150')
    set(/^rating/i, '4.5')
    set(/review count/i, '120')
    fireEvent.click(screen.getByRole('button', { name: /save snapshot/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(rpcCalls()[0][1].p_snapshot).toMatchObject({ method: 'manual', status: 'complete' })
  })

  it('sends each option as a row, in order, in the same call', async () => {
    const onSaved = vi.fn()
    render(<SnapshotForm listingId="L1" onSaved={onSaved} />)
    set(/options/i, 'Shared | Priced for 2 travelers, Dec 5, 2026 | 150\nPrivate |  | 300')
    fireEvent.click(screen.getByRole('button', { name: /save snapshot/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(rpcCalls()).toHaveLength(1)
    expect(rpcCalls()[0][1].p_options).toEqual([
      { sort_order: 0, name: 'Shared', description: 'Priced for 2 travelers, Dec 5, 2026', price_per_person: 150, travelers: 2, price_date: '2026-12-05' },
      { sort_order: 1, name: 'Private', description: null, price_per_person: 300, travelers: null, price_date: null },
    ])
  })

  it('shows the error when the call fails, saves nothing, and does not report success', async () => {
    rpcResult = { data: null, error: { message: 'permission denied for function mt_save_snapshot' } }
    const onSaved = vi.fn()
    render(<SnapshotForm listingId="L1" onSaved={onSaved} />)
    set(/^title/i, 'Red Dunes')
    set(/options/i, 'Shared | Group | 150')
    fireEvent.click(screen.getByRole('button', { name: /save snapshot/i }))
    expect(await screen.findByText(/could not save: permission denied for function mt_save_snapshot/i)).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
    expect(rpcCalls()).toHaveLength(1)
    expect(inserts()).toHaveLength(0)
    // The form keeps what was typed so it can be saved again.
    expect((screen.getByLabelText(/^title/i) as HTMLInputElement).value).toBe('Red Dunes')
  })

  it('an option without a name fails the whole save, and nothing is sent', async () => {
    render(<SnapshotForm listingId="L1" onSaved={() => {}} />)
    set(/^title/i, 'Red Dunes')
    set(/options/i, 'Shared | Group | 150\n | Private | 300')
    fireEvent.click(screen.getByRole('button', { name: /save snapshot/i }))
    expect(await screen.findByText(/line 2: option name is required/i)).toBeTruthy()
    expect(rpcCalls()).toHaveLength(0)
    expect(inserts()).toHaveLength(0)
  })

  it('shows a parse error for an invalid price and does not save', async () => {
    render(<SnapshotForm listingId="L1" onSaved={() => {}} />)
    set(/options/i, 'Shared | Group | cheap')
    fireEvent.click(screen.getByRole('button', { name: /save snapshot/i }))
    expect(await screen.findByText(/price/i, { selector: '[role=alert]' })).toBeTruthy()
    expect(rpcCalls()).toHaveLength(0)
    expect(inserts()).toHaveLength(0)
  })
})

describe('source dropdowns', () => {
  const labels = (select: HTMLElement) =>
    within(select).getAllByRole('option').map((o) => [(o as HTMLOptionElement).value, o.textContent])
  const expected = [
    ['viator', 'Viator'],
    ['tripadvisor', 'TripAdvisor'],
    ['getyourguide', 'GetYourGuide'],
    ['manual', 'Manual'],
  ]

  it('the new listing form offers GetYourGuide and saves it as getyourguide', async () => {
    respond = newListingRespond([{ id: 'C1', name: 'GYG Co', is_own: false }])
    const onCreated = vi.fn()
    render(<NewListingForm onCreated={onCreated} />)
    expect(labels(screen.getByLabelText(/source/i))).toEqual(expected)

    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'GYG Safari' } })
    fireEvent.change(screen.getByLabelText(/^company/i), { target: { value: 'GYG Co' } })
    fireEvent.change(screen.getByLabelText(/source/i), { target: { value: 'getyourguide' } })
    fireEvent.click(await screen.findByLabelText('Tour'))
    fireEvent.click(screen.getByLabelText('Dubai'))
    fireEvent.click(screen.getByRole('button', { name: /create listing/i }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-1'))
    expect(callsOf(inserts()[0], 'insert')[0][0]).toMatchObject({ source: 'getyourguide' })
  })

  it('the edit listing form offers GetYourGuide and saves it as getyourguide', async () => {
    const listing = { id: 'L1', name: 'Rival', is_own: false, source: 'viator', url: null, competitor_name: null, active: true }
    respond = (q) => {
      if (q.table === 'mt_listings' && callsOf(q, 'update').length) {
        return { data: { ...listing, ...(callsOf(q, 'update')[0][0] as object) }, error: null }
      }
      if (q.table === 'mt_listings') return { data: listing, error: null }
      return { data: [], error: null }
    }
    render(<ListingDetailPage id="L1" />)
    fireEvent.click(await screen.findByRole('button', { name: /edit listing/i }))
    const select = screen.getByLabelText(/source/i)
    expect(labels(select)).toEqual(expected)

    fireEvent.change(select, { target: { value: 'getyourguide' } })
    fireEvent.click(screen.getByRole('button', { name: /save listing/i }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /save listing/i })).toBeNull())
    const update = queries.find((q) => callsOf(q, 'update').length)!
    expect(callsOf(update, 'update')[0][0]).toMatchObject({ source: 'getyourguide' })
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
    respond = (q) => q.table === 'mt_snapshot_options' ? { data: [], error: null } : ({
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
    respond = (q) => (q.table === 'mt_snapshot_options' ? { data: [], error: null } : { data: [{ id: 'x', listing_id: 'L1', title: 'No overview', overview: null }], error: null })
    render(<SnapshotList listingId="L1" refreshKey={0} />)
    const item = await screen.findByRole('article')
    expect(within(item).queryByText('Overview', { selector: 'dt' })).toBeNull()
  })

  it('requests snapshots newest first and renders them in that order', async () => {
    respond = (q) => q.table === 'mt_snapshot_options' ? { data: [], error: null } : ({
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
    respond = (q) => q.table === 'mt_snapshot_options' ? { data: [], error: null } : ({
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
