import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { callsOf, createFakeSupabase, type Query, type Result } from './test/fakeSupabase'
import { supabase } from '../../lib/supabase'
import { deleteSnapshot, updateListing, updateSnapshot } from './api'
import { snapshotFormToRow, snapshotRowToForm } from './mapping'
import ListingDetailPage from './ListingDetailPage'
import SnapshotList from './SnapshotList'
import type { Snapshot, SnapshotOption } from './types'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

const has = (q: Query, m: string) => callsOf(q, m).length > 0

let queries: Query[]
let listing: Record<string, unknown>
let snapshots: Snapshot[]
let deleteResult: Result
let optionRows: SnapshotOption[]
let optionsDeleteResult: Result
let optionsInsertResult: Result
let companies: Record<string, unknown>[]
let companiesError: { message: string } | null

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
  // The old options column. It must never be shown or used: options come from mt_snapshot_options.
  options: [{ name: 'Stale column option', description: null, price: 1 }],
  rating: 4.7,
  review_count: 1234,
  urgency_text: 'Likely to sell out',
} as Snapshot

/** s1's rows in mt_snapshot_options, deliberately out of order to prove sorting. */
const s1Options: SnapshotOption[] = [
  { id: 'o2', snapshot_id: 's1', sort_order: 1, name: 'Private', description: null, price_per_person: null, travelers: null, price_date: null },
  { id: 'o1', snapshot_id: 's1', sort_order: 0, name: 'Shared', description: 'Group transfer', price_per_person: 150, travelers: null, price_date: null },
]

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
  if (q.table === 'mt_companies') {
    if (has(q, 'insert')) return { data: { id: 'C-new', ...(callsOf(q, 'insert')[0][0] as object) }, error: null }
    return { data: companiesError ? null : companies, error: companiesError }
  }
  if (q.table === 'mt_snapshot_options') {
    if (has(q, 'delete')) return optionsDeleteResult
    if (has(q, 'insert')) return optionsInsertResult
    const [[, id]] = callsOf(q, 'eq') as [string, string][]
    // The real query sorts by sort_order; the fake honours that so the order test means something.
    return { data: optionRows.filter((o) => o.snapshot_id === id).sort((a, b) => a.sort_order - b.sort_order), error: null }
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
  optionRows = [...s1Options]
  optionsDeleteResult = { data: null, error: null }
  optionsInsertResult = { data: null, error: null }
  companies = [{ id: 'C1', name: 'Rival Co', is_own: false }, { id: 'C2', name: 'Scenic Zest Tours', is_own: true }]
  companiesError = null
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
    const f = snapshotFormToRow('L1', snapshotRowToForm(completeSnapshot, s1Options))
    if (!f.ok) throw new Error('fixture should map')
    const { listing_id: _l, method: _m, options: _o, ...patch } = f.row
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
    expect(snapshotRowToForm(completeSnapshot, s1Options)).toEqual({
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
    const r = snapshotFormToRow('L1', snapshotRowToForm(completeSnapshot, s1Options))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const { id: _i, method: _m, captured_at: _c, options: _o, ...saved } = completeSnapshot as Snapshot & { method: string }
    expect(r.row).toMatchObject(saved)
    expect(r.row.options).toEqual([
      { name: 'Shared', description: 'Group transfer', price: 150 },
      { name: 'Private', description: null, price: null },
    ])
  })

  it('takes options only from the option rows, ignoring the old options column', () => {
    expect(snapshotRowToForm(completeSnapshot, []).options).toBe('')
  })

  it('turns missing values into empty text', () => {
    const f = snapshotRowToForm({ id: 's2', listing_id: 'L1' } as Snapshot, [])
    expect(Object.values(f).every((v) => v === '')).toBe(true)
  })
})

// ---------- editing a listing ----------

describe('Edit listing', () => {
  async function openEdit() {
    render(<ListingDetailPage id="L1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit listing' }))
    return screen.findByRole('form', { name: 'Edit listing' })
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
      name: 'New Name', source: 'tripadvisor', url: null, competitor_name: 'Other Co', active: false, company_id: null,
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

  it('shows the current company and saves a change to another existing one, matched ignoring case and spaces', async () => {
    listing.company_id = 'C1'
    const form = await openEdit()
    const box = within(form).getByLabelText('Company') as HTMLInputElement
    expect(box.value).toBe('Rival Co')
    fireEvent.change(box, { target: { value: '  scenic   ZEST tours ' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save listing' }))
    await waitFor(() => expect(writes('update')).toHaveLength(1))
    expect(callsOf(writes('update')[0], 'update')[0][0]).toMatchObject({ company_id: 'C2' })
    expect(writes('insert')).toHaveLength(0)
    expect(await screen.findByRole('link', { name: 'Scenic Zest Tours (OWN)' })).toBeTruthy()
  })

  it('creates a company that does not exist yet, as a competitor like the listing', async () => {
    const form = await openEdit()
    fireEvent.change(within(form).getByLabelText('Company'), { target: { value: 'Brand New Tours' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save listing' }))
    await waitFor(() => expect(writes('update')).toHaveLength(1))
    const [ins] = writes('insert')
    expect(ins.table).toBe('mt_companies')
    expect(callsOf(ins, 'insert')[0][0]).toEqual({ name: 'Brand New Tours', is_own: false })
    expect(callsOf(writes('update')[0], 'update')[0][0]).toMatchObject({ company_id: 'C-new' })
  })

  it('an empty company box leaves the listing unassigned', async () => {
    listing.company_id = 'C1'
    const form = await openEdit()
    fireEvent.change(within(form).getByLabelText('Company'), { target: { value: '  ' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save listing' }))
    await waitFor(() => expect(writes('update')).toHaveLength(1))
    expect(callsOf(writes('update')[0], 'update')[0][0]).toMatchObject({ company_id: null })
  })

  it('does not offer the edit form when companies cannot be loaded, so the company is never wiped', async () => {
    listing.company_id = 'C1'
    companiesError = { message: 'companies down' }
    render(<ListingDetailPage id="L1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit listing' }))
    expect(await screen.findByText(/could not load companies.*companies down/i)).toBeTruthy()
    expect(screen.queryByRole('form', { name: 'Edit listing' })).toBeNull()
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
  const optionWrites = (m: 'insert' | 'delete') => writes(m).filter((q) => q.table === 'mt_snapshot_options')

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
    const patch = sentPatch()
    expect(patch.title).toBe('Desert Safari Deluxe')
    expect(patch.overview).toBe('Dunes, camels and dinner.')
    expect(patch).not.toHaveProperty('method')
    expect(patch).not.toHaveProperty('listing_id')
    expect(patch).not.toHaveProperty('id')
    expect(patch).not.toHaveProperty('options')
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
    snapshots = [{ ...completeSnapshot, status: 'partial', duration: null } as Snapshot]
    optionRows = []
    const article = await openEdit()
    fireEvent.change(field(article, /^duration/i), { target: { value: '5 hours' } })
    fireEvent.change(field(article, /^options/i), { target: { value: 'Shared | | 120' } })
    save(article)
    await waitFor(() => expect(optionWrites('insert')).toHaveLength(1))
    expect(sentPatch()).toMatchObject({ status: 'complete', duration: '5 hours' })
    expect(callsOf(optionWrites('insert')[0], 'insert')[0][0]).toEqual([
      { snapshot_id: 's1', sort_order: 0, name: 'Shared', description: null, price_per_person: 120, travelers: null, price_date: null },
    ])
  })

  it('replaces the option rows: deletes that snapshot\'s rows, then inserts the new ones in order', async () => {
    const article = await openEdit()
    fireEvent.change(field(article, /^options/i), {
      target: { value: 'Private | Own car | 600\nShared | Priced for 2 travelers, Nov 25, 2026 | 150' },
    })
    save(article)
    await waitFor(() => expect(optionWrites('insert')).toHaveLength(1))
    const [del] = optionWrites('delete')
    const [ins] = optionWrites('insert')
    expect(optionWrites('delete')).toHaveLength(1)
    expect(callsOf(del, 'eq')).toEqual([['snapshot_id', 's1']])
    expect(queries.indexOf(del)).toBeLessThan(queries.indexOf(ins))
    expect(queries.indexOf(writes('update')[0])).toBeLessThan(queries.indexOf(del))
    expect(callsOf(ins, 'insert')[0][0]).toEqual([
      { snapshot_id: 's1', sort_order: 0, name: 'Private', description: 'Own car', price_per_person: 600, travelers: null, price_date: null },
      { snapshot_id: 's1', sort_order: 1, name: 'Shared', description: 'Priced for 2 travelers, Nov 25, 2026', price_per_person: 150, travelers: 2, price_date: '2026-11-25' },
    ])
    expect(await within(article).findByRole('heading', { name: 'Desert Safari' })).toBeTruthy()
  })

  it('clearing every option deletes the rows and inserts nothing', async () => {
    const article = await openEdit()
    fireEvent.change(field(article, /^options/i), { target: { value: '' } })
    save(article)
    await waitFor(() => expect(optionWrites('delete')).toHaveLength(1))
    expect(await within(article).findByRole('heading', { name: 'Desert Safari' })).toBeTruthy()
    expect(optionWrites('insert')).toHaveLength(0)
  })

  it('a failed insert shows the error, says the options may now be missing, and keeps the form open', async () => {
    optionsInsertResult = { data: null, error: { message: 'insert blew up' } }
    const article = await openEdit()
    save(article)
    const alert = await within(article).findByRole('alert')
    expect(alert.textContent).toMatch(/insert blew up/)
    expect(alert.textContent).toMatch(/options may now be missing/i)
    expect(alert.textContent).toMatch(/edit the snapshot again/i)
    expect(within(article).getByRole('heading', { name: 'Edit snapshot' })).toBeTruthy()
  })

  it('a failed delete shows the error, says nothing changed, and inserts nothing', async () => {
    optionsDeleteResult = { data: null, error: { message: 'delete blew up' } }
    const article = await openEdit()
    save(article)
    const alert = await within(article).findByRole('alert')
    expect(alert.textContent).toMatch(/delete blew up\. The options were not changed/)
    expect(optionWrites('insert')).toHaveLength(0)
  })

  it('a failed snapshot update touches no option rows', async () => {
    const article = await openEdit()
    vi.mocked(supabase.from).mockImplementation(createFakeSupabase((q) =>
      q.table === 'mt_snapshots' && has(q, 'update') ? { data: null, error: { message: 'update blew up' } } : respond(q),
    ).client.from as never)
    save(article)
    expect((await within(article).findByRole('alert')).textContent).toMatch(/update blew up/)
    expect(optionWrites('delete')).toHaveLength(0)
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

// ---------- showing options ----------

describe('SnapshotList options', () => {
  const valueFor = (article: HTMLElement, label: string) =>
    within(article).getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement

  it('shows the rows from mt_snapshot_options in sort_order, never the old options column', async () => {
    render(<SnapshotList listingId="L1" refreshKey={0} />)
    const [article] = await screen.findAllByRole('article')
    const items = within(valueFor(article, 'Options')).getAllByRole('listitem').map((li) => li.textContent)
    expect(items).toEqual(['Shared — Group transfer — 150', 'Private'])
    expect(within(article).queryByText(/Stale column option/)).toBeNull()
    const read = queries.find((q) => q.table === 'mt_snapshot_options')!
    expect(callsOf(read, 'eq')).toEqual([['snapshot_id', 's1']])
    expect(callsOf(read, 'order')).toEqual([['sort_order', { ascending: true }]])
  })

  it('shows nothing for options, and no error, when a snapshot has no rows', async () => {
    optionRows = []
    render(<SnapshotList listingId="L1" refreshKey={0} />)
    const [article] = await screen.findAllByRole('article')
    expect(within(article).queryByText('Options', { selector: 'dt' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('the edit form opens with the options filled in from those rows', async () => {
    render(<SnapshotList listingId="L1" refreshKey={0} />)
    const [article] = await screen.findAllByRole('article')
    fireEvent.click(within(article).getByRole('button', { name: 'Edit' }))
    expect((within(article).getByLabelText(/^options/i) as HTMLTextAreaElement).value)
      .toBe('Shared | Group transfer | 150\nPrivate')
  })
})
