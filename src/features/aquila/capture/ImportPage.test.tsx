import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { callsOf, createFakeSupabase, type Query, type Result } from '../test/fakeSupabase'
import { supabase } from '../../../lib/supabase'
import ImportPage from './ImportPage'
import SnapshotList from '../SnapshotList'
import { BOOKMARKLET } from './bookmarklet'
import viator2 from '../../../../fixtures/viator-2.html?raw'

vi.mock('../../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

let respond: (q: Query) => Result
let queries: Query[]

beforeEach(() => {
  respond = () => ({ data: { id: 's1' }, error: null })
  const fake = createFakeSupabase((q) => respond(q))
  queries = fake.queries
  vi.mocked(supabase.from).mockImplementation(fake.client.from as never)
  vi.mocked(supabase.rpc).mockReset()
  vi.mocked(supabase.rpc).mockImplementation((() => Promise.resolve({ data: 's1', error: null })) as never)
})

type RpcArgs = { p_snapshot: Record<string, unknown>; p_options: Record<string, unknown>[] }
const rpcCalls = () => vi.mocked(supabase.rpc).mock.calls as unknown as [string, RpcArgs][]
/** Every save attempt: direct inserts and mt_save_snapshot calls. */
const inserts = () => [...queries.filter((q) => callsOf(q, 'insert').length > 0), ...rpcCalls()]

const ld = {
  '@type': ['Product', 'TouristTrip'],
  name: 'Sunrise Notre-Dame Tour',
  aggregateRating: { ratingValue: 4.6, reviewCount: 98 },
  offers: [{ '@type': 'Offer', name: 'Shared', price: '40' }],
}
const pageHtml = `<!doctype html><html><head>
  <script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>
  <ul data-automation="product-attributes-list"><li>2 hours (approx.)</li><li>Offered in: English</li></ul>
  </body></html>`
const payload = JSON.stringify({ url: 'https://www.viator.com/tours/Paris/x/d479-1', html: pageHtml })

function paste(text: string) {
  fireEvent.change(screen.getByLabelText(/bookmark output/i), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: /^parse$/i }))
}

const VIATOR2_OVERVIEW = [
  'Discover the history, beauty, and remarkable rebirth of Notre-Dame Cathedral with an expert local Paris guide on this immersive walking experience through the heart of historic Paris.',
  'Your experience begins with a comprehensive guided walking tour around the exterior of the newly restored Notre-Dame Cathedral and the historic Île de la Cité.',
  'Following your guided introduction, you are free to enter Notre-Dame Cathedral independently allowing you to explore the magnificent interior at your own pace and discover its beauty in a peaceful and personal way.',
  'Unlike a traditional interior guided tour, this experience gives you the freedom to spend as much time as you wish inside the cathedral after receiving all the historical context and recommendations from your guide.',
  "You'll also explore the enchanting streets of the Île de la Cité, the birthplace of Paris, discovering hidden squares, historic bridges, medieval streets, and many of the city's most iconic landmarks.",
].join('\n')

/** The <dd> shown next to a <dt> label inside a container. */
function valueFor(container: HTMLElement, label: string) {
  const dt = within(container).getAllByText(label, { selector: 'dt' })[0]
  return dt.nextElementSibling as HTMLElement
}

describe('ImportPage', () => {
  it('shows the bookmark code and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ImportPage listingId="L1" onSaved={() => {}} />)
    expect((screen.getByLabelText(/bookmark code/i) as HTMLInputElement).value).toBe(BOOKMARKLET)
    fireEvent.click(screen.getByRole('button', { name: /copy bookmark/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(BOOKMARKLET))
    expect(await screen.findByText(/copied/i)).toBeTruthy()
  })

  it('shows an error for invalid text and saves nothing', async () => {
    render(<ImportPage listingId="L1" onSaved={() => {}} />)
    paste('this is not bookmark output')
    expect((await screen.findByRole('alert')).textContent).toMatch(/bookmark output/i)
    expect(screen.queryByRole('button', { name: /save snapshot/i })).toBeNull()
    expect(inserts()).toHaveLength(0)
  })

  it('shows an error when the page has no product on it, and saves nothing', async () => {
    render(<ImportPage listingId="L1" onSaved={() => {}} />)
    paste(JSON.stringify({ url: 'https://example.com', html: '<html><body><p>Hello</p></body></html>' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/no viator product/i)
    expect(screen.queryByRole('button', { name: /save snapshot/i })).toBeNull()
    expect(inserts()).toHaveLength(0)
  })

  it('parses, previews with the missing list, allows edits, and saves an assisted snapshot', async () => {
    const onSaved = vi.fn()
    render(<ImportPage listingId="L1" onSaved={onSaved} />)
    paste(payload)

    const preview = await screen.findByRole('region', { name: /preview/i })
    expect(within(preview).getByText('Sunrise Notre-Dame Tour')).toBeTruthy()
    expect(within(preview).getByText(/complete/i)).toBeTruthy()
    const missing = within(preview).getByRole('list', { name: /missing/i })
    expect(within(missing).getByText(/highlights/i)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/^group type/i), { target: { value: 'Shared' } })
    fireEvent.click(screen.getByRole('button', { name: /save snapshot/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(queries.filter((q) => callsOf(q, 'insert').length > 0)).toHaveLength(0)
    expect(rpcCalls()).toHaveLength(1)
    const [fn, { p_snapshot, p_options }] = rpcCalls()[0]
    expect(fn).toBe('mt_save_snapshot')
    expect(p_options).toEqual([
      { sort_order: 0, name: 'Shared', description: null, price_per_person: 40, travelers: null, price_date: null },
    ])
    expect(p_snapshot).not.toHaveProperty('options')
    expect(p_snapshot).toMatchObject({
      listing_id: 'L1',
      method: 'assisted',
      status: 'complete',
      title: 'Sunrise Notre-Dame Tour',
      duration: '2 hours (approx.)',
      group_type: 'Shared',
      languages: ['English'],
      rating: 4.6,
      review_count: 98,
      raw_html: pageHtml,
    })
    expect(p_snapshot.raw_text).toContain('2 hours (approx.)')
  })

  it('shows the viator-2 overview in the preview, one paragraph per line', async () => {
    render(<ImportPage listingId="L1" onSaved={() => {}} />)
    paste(JSON.stringify({ url: 'https://www.viator.com/tours/Paris/x/d479-8954P40', html: viator2 }))

    const preview = await screen.findByRole('region', { name: /preview/i }, { timeout: 20_000 })
    const shown = valueFor(preview, 'Overview')
    expect(shown.textContent).toBe(VIATOR2_OVERVIEW)
    expect(shown.className).toContain('whitespace-pre-line')

    // The same text is in the edit form, ready to change before saving.
    expect((screen.getByLabelText(/^overview/i) as HTMLTextAreaElement).value).toBe(VIATOR2_OVERVIEW)
  }, 30_000)

  it('blocks saving when an edit makes the form invalid', async () => {
    render(<ImportPage listingId="L1" onSaved={() => {}} />)
    paste(payload)
    await screen.findByRole('region', { name: /preview/i })
    fireEvent.change(screen.getByLabelText(/^rating/i), { target: { value: 'great' } })
    fireEvent.click(screen.getByRole('button', { name: /save snapshot/i }))
    expect(await screen.findByText(/rating must be/i)).toBeTruthy()
    expect(inserts()).toHaveLength(0)
  })

  it('a snapshot saved through import shows its options in the snapshot list straight away', async () => {
    // A tiny database: mt_save_snapshot stores the snapshot (without an options column) and its option rows.
    const saved: { snapshot?: Record<string, unknown>; options: Record<string, unknown>[] } = { options: [] }
    vi.mocked(supabase.rpc).mockImplementation(((_fn: string, args: RpcArgs) => {
      saved.snapshot = { ...args.p_snapshot, id: 's1' }
      saved.options = args.p_options.map((o) => ({ ...o, id: `o${o.sort_order}`, snapshot_id: 's1' }))
      return Promise.resolve({ data: 's1', error: null })
    }) as never)
    respond = (q) => {
      if (q.table === 'mt_snapshots') return { data: saved.snapshot ? [saved.snapshot] : [], error: null }
      if (q.table === 'mt_snapshot_options') {
        const [[, id]] = callsOf(q, 'eq') as [string, string][]
        return { data: saved.options.filter((o) => o.snapshot_id === id), error: null }
      }
      return { data: [], error: null }
    }

    const onSaved = vi.fn()
    const { unmount } = render(<ImportPage listingId="L1" onSaved={onSaved} />)
    paste(payload)
    await screen.findByRole('region', { name: /preview/i })
    fireEvent.click(screen.getByRole('button', { name: /save snapshot/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(saved.snapshot).not.toHaveProperty('options')
    unmount()

    render(<SnapshotList listingId="L1" refreshKey={0} />)
    const article = await screen.findByRole('article')
    expect(within(valueFor(article, 'Options')).getByRole('listitem').textContent).toBe('Shared — 40')
  })
})
