import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { callsOf, createFakeSupabase, type Query, type Result } from '../test/fakeSupabase'
import { supabase } from '../../../lib/supabase'
import ListingDetailPage from '../ListingDetailPage'
import ListingsPage from '../ListingsPage'
import NewListingForm from '../NewListingForm'
import type { Tag } from '../types'

vi.mock('../../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

const has = (q: Query, m: string) => callsOf(q, m).length > 0

let queries: Query[]
let tags: Tag[]
let links: { listing_id: string; tag_id: string }[]
let listings: Record<string, unknown>[]
let linkInsertError: { message: string } | null

function respond(q: Query): Result {
  if (q.table === 'mt_tags' && has(q, 'insert')) {
    const row = callsOf(q, 'insert')[0][0] as Omit<Tag, 'id'>
    return { data: { id: 'NEW', ...row }, error: null }
  }
  if (q.table === 'mt_tags') return { data: tags, error: null }
  if (q.table === 'mt_companies' && has(q, 'insert')) {
    return { data: { id: 'C-new', ...(callsOf(q, 'insert')[0][0] as object) }, error: null }
  }
  if (q.table === 'mt_companies') return { data: [], error: null }
  if (q.table === 'mt_listing_tags' && has(q, 'insert')) return { data: null, error: linkInsertError }
  if (q.table === 'mt_listing_tags' && has(q, 'delete')) return { data: null, error: null }
  if (q.table === 'mt_listing_tags') {
    const eq = callsOf(q, 'eq')[0]
    return { data: eq ? links.filter((l) => l.listing_id === eq[1]) : links, error: null }
  }
  if (q.table === 'mt_listings' && has(q, 'insert')) return { data: { id: 'new-1' }, error: null }
  if (q.table === 'mt_listings' && has(q, 'delete')) return { data: [{ id: 'new-1' }], error: null }
  if (q.table === 'mt_listings' && has(q, 'single')) return { data: listings[0], error: null }
  if (q.table === 'mt_listings') return { data: listings, error: null }
  return { data: [], error: null }
}

beforeEach(() => {
  tags = [
    { id: 'T1', name: 'Safari', kind: 'type' },
    { id: 'T2', name: 'Cruise', kind: 'type' },
    { id: 'P1', name: 'Dubai', kind: 'place' },
    { id: 'P2', name: 'Abu Dhabi', kind: 'place' },
  ]
  links = []
  listings = [{ id: 'L1', name: 'Rival Safari', is_own: false, source: 'viator', url: null, competitor_name: null, active: true }]
  linkInsertError = null
  const fake = createFakeSupabase((q) => respond(q))
  queries = fake.queries
  vi.mocked(supabase.from).mockImplementation(fake.client.from as never)
})

const writes = () => queries.filter((q) => has(q, 'insert') || has(q, 'delete') || has(q, 'update'))

describe('NewListingForm tag rule', () => {
  async function fillName() {
    render(<NewListingForm onCreated={() => {}} />)
    await screen.findByLabelText('Safari')
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Red Dunes' } })
    fireEvent.change(screen.getByLabelText(/^company/i), { target: { value: 'Rival Co' } })
  }
  const submit = () => fireEvent.click(screen.getByRole('button', { name: /create listing/i }))

  it('shows tags from mt_tags as type and place checkboxes', async () => {
    render(<NewListingForm onCreated={() => {}} />)
    expect((await screen.findByLabelText('Safari')).getAttribute('type')).toBe('checkbox')
    expect(screen.getByLabelText('Dubai').getAttribute('type')).toBe('checkbox')
  })

  it('refuses to save with no tags and writes nothing', async () => {
    await fillName()
    submit()
    expect((await screen.findByRole('alert')).textContent).toMatch(/one type tag.*at least one place tag/i)
    expect(writes()).toHaveLength(0)
  })

  it('refuses to save with a type but no place', async () => {
    await fillName()
    fireEvent.click(screen.getByLabelText('Safari'))
    submit()
    expect((await screen.findByRole('alert')).textContent).toMatch(/at least one place tag/i)
    expect(writes()).toHaveLength(0)
  })

  it('refuses to save with places but no type', async () => {
    await fillName()
    fireEvent.click(screen.getByLabelText('Dubai'))
    submit()
    expect((await screen.findByRole('alert')).textContent).toMatch(/choose at least one type tag/i)
    expect(writes()).toHaveLength(0)
  })

  it('allows two type tags: both are saved', async () => {
    const onCreated = vi.fn()
    render(<NewListingForm onCreated={onCreated} />)
    fireEvent.change(await screen.findByLabelText(/^name/i), { target: { value: 'Red Dunes' } })
    fireEvent.change(screen.getByLabelText(/^company/i), { target: { value: 'Rival Co' } })
    await screen.findByLabelText('Safari')
    fireEvent.click(screen.getByLabelText('Safari'))
    fireEvent.click(screen.getByLabelText('Cruise'))
    fireEvent.click(screen.getByLabelText('Dubai'))
    fireEvent.click(screen.getByLabelText('Abu Dhabi'))
    submit()
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-1'))
    const link = queries.find((q) => q.table === 'mt_listing_tags' && has(q, 'insert'))!
    expect(callsOf(link, 'insert')[0][0]).toEqual([
      { listing_id: 'new-1', tag_id: 'T1' },
      { listing_id: 'new-1', tag_id: 'T2' },
      { listing_id: 'new-1', tag_id: 'P1' },
      { listing_id: 'new-1', tag_id: 'P2' },
    ])
  })

  it('adds a new tag inline: type a name, choose the kind, Add; it is created and ticked', async () => {
    await fillName()
    fireEvent.change(screen.getByLabelText('New tag'), { target: { value: '  Food   Tour ' } })
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'type' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    const added = await screen.findByLabelText('Food Tour') as HTMLInputElement
    expect(added.checked).toBe(true)
    const ins = queries.find((q) => q.table === 'mt_tags' && has(q, 'insert'))!
    expect(callsOf(ins, 'insert')[0][0]).toEqual({ name: 'Food Tour', kind: 'type' })
    expect((screen.getByLabelText('New tag') as HTMLInputElement).value).toBe('')
  })

  it('adding a name that already exists for that kind reuses the tag and writes nothing', async () => {
    await fillName()
    fireEvent.change(screen.getByLabelText('New tag'), { target: { value: ' safari ' } })
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'type' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect((screen.getByLabelText('Safari') as HTMLInputElement).checked).toBe(true))
    expect(writes()).toHaveLength(0)
    expect(screen.getAllByLabelText('Safari')).toHaveLength(1)
  })

  it('the same name with the other kind is a different tag', async () => {
    await fillName()
    fireEvent.change(screen.getByLabelText('New tag'), { target: { value: 'Safari' } })
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'place' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(screen.getAllByLabelText('Safari')).toHaveLength(2))
    const ins = queries.find((q) => q.table === 'mt_tags' && has(q, 'insert'))!
    expect(callsOf(ins, 'insert')[0][0]).toEqual({ name: 'Safari', kind: 'place' })
  })

  it('an empty inline tag name shows an error and writes nothing', async () => {
    await fillName()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect((await within(screen.getByRole('group', { name: 'Add a tag' })).findByRole('alert')).textContent)
      .toMatch(/tag name is required/i)
    expect(writes()).toHaveLength(0)
  })

  it('does not check tags while the name is also invalid, but shows both errors', async () => {
    render(<NewListingForm onCreated={() => {}} />)
    await screen.findByLabelText('Safari')
    submit()
    expect(await screen.findByText(/name is required/i)).toBeTruthy()
    expect(screen.getByText(/at least one place tag/i)).toBeTruthy()
    expect(writes()).toHaveLength(0)
  })

  it('removes the new listing again if its tags cannot be saved', async () => {
    linkInsertError = { message: 'permission denied' }
    const onCreated = vi.fn()
    await fillName()
    fireEvent.click(screen.getByLabelText('Safari'))
    fireEvent.click(screen.getByLabelText('Dubai'))
    submit()
    expect(await screen.findByText(/listing was not created: permission denied/i)).toBeTruthy()
    expect(onCreated).not.toHaveBeenCalled()
    const del = queries.find((q) => q.table === 'mt_listings' && has(q, 'delete'))!
    expect(callsOf(del, 'eq')).toEqual([['id', 'new-1']])
  })
})

describe('createListingWithTags undo', () => {
  it('says the listing was left behind when removing it also fails', async () => {
    linkInsertError = { message: 'permission denied' }
    const fake = createFakeSupabase((q) =>
      q.table === 'mt_listings' && has(q, 'delete') ? { data: [], error: null } : respond(q))
    vi.mocked(supabase.from).mockImplementation(fake.client.from as never)
    const { createListingWithTags } = await import('../api')
    await expect(createListingWithTags(
      { name: 'Red Dunes', is_own: true, source: 'manual', url: null, competitor_name: null, active: true },
      ['T1', 'P1'],
    )).rejects.toThrow(/permission denied.*could not be removed.*exists without tags/)
  })
})

describe('ListingDetailPage tags', () => {
  beforeEach(() => {
    links = [{ listing_id: 'L1', tag_id: 'T1' }, { listing_id: 'L1', tag_id: 'P1' }]
  })

  const section = async () => screen.findByRole('region', { name: 'Tags' })

  it("shows the listing's tags", async () => {
    render(<ListingDetailPage id="L1" />)
    const tagsBox = await section()
    expect(await within(tagsBox).findByText('Safari')).toBeTruthy()
    expect(within(tagsBox).getByText('Dubai')).toBeTruthy()
    expect(within(tagsBox).queryByText('Cruise')).toBeNull()
  })

  it('saves a second type tag alongside the first, writing only the differences', async () => {
    render(<ListingDetailPage id="L1" />)
    fireEvent.click(await screen.findByRole('button', { name: /edit tags/i }))
    fireEvent.click(screen.getByLabelText('Cruise'))
    fireEvent.click(screen.getByLabelText('Abu Dhabi'))
    fireEvent.click(screen.getByRole('button', { name: /save tags/i }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /save tags/i })).toBeNull())

    const ins = queries.find((q) => q.table === 'mt_listing_tags' && has(q, 'insert'))!
    expect(callsOf(ins, 'insert')[0][0]).toEqual([
      { listing_id: 'L1', tag_id: 'T2' },
      { listing_id: 'L1', tag_id: 'P2' },
    ])
    expect(queries.filter((q) => q.table === 'mt_listing_tags' && has(q, 'delete'))).toHaveLength(0)
    expect(within(await section()).getByText('Cruise')).toBeTruthy()
    expect(within(await section()).getByText('Safari')).toBeTruthy()
  })

  it('removing a type tag deletes only that link', async () => {
    links = [{ listing_id: 'L1', tag_id: 'T1' }, { listing_id: 'L1', tag_id: 'T2' }, { listing_id: 'L1', tag_id: 'P1' }]
    render(<ListingDetailPage id="L1" />)
    fireEvent.click(await screen.findByRole('button', { name: /edit tags/i }))
    fireEvent.click(screen.getByLabelText('Safari'))
    fireEvent.click(screen.getByRole('button', { name: /save tags/i }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /save tags/i })).toBeNull())
    const dels = queries.filter((q) => q.table === 'mt_listing_tags' && has(q, 'delete'))
    expect(dels.map((q) => callsOf(q, 'eq'))).toEqual([[['listing_id', 'L1'], ['tag_id', 'T1']]])
    expect(queries.filter((q) => q.table === 'mt_listing_tags' && has(q, 'insert'))).toHaveLength(0)
  })

  it('refuses to remove the last place tag and writes nothing', async () => {
    render(<ListingDetailPage id="L1" />)
    fireEvent.click(await screen.findByRole('button', { name: /edit tags/i }))
    fireEvent.click(screen.getByLabelText('Dubai'))
    fireEvent.click(screen.getByRole('button', { name: /save tags/i }))
    expect(await screen.findByText(/at least one place tag/i)).toBeTruthy()
    expect(writes()).toHaveLength(0)
    expect(screen.getByRole('button', { name: /save tags/i })).toBeTruthy()
  })

  it('refuses a listing with no type tag (old data) until one is chosen', async () => {
    links = [{ listing_id: 'L1', tag_id: 'P1' }]
    render(<ListingDetailPage id="L1" />)
    fireEvent.click(await screen.findByRole('button', { name: /edit tags/i }))
    fireEvent.click(screen.getByRole('button', { name: /save tags/i }))
    expect(await screen.findByText(/choose at least one type tag/i)).toBeTruthy()
    expect(writes()).toHaveLength(0)
  })

  it('cancel leaves the tags unchanged', async () => {
    render(<ListingDetailPage id="L1" />)
    fireEvent.click(await screen.findByRole('button', { name: /edit tags/i }))
    fireEvent.click(screen.getByLabelText('Cruise'))
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(within(await section()).getByText('Safari')).toBeTruthy()
    expect(writes()).toHaveLength(0)
  })
})

describe('ListingsPage tags and filters', () => {
  beforeEach(() => {
    listings = [
      { id: 'L1', name: 'Dune Safari', is_own: true, source: 'viator', active: true },
      { id: 'L2', name: 'Creek Cruise', is_own: false, source: 'viator', active: true },
      { id: 'L3', name: 'Island Cruise', is_own: false, source: 'manual', active: true },
      { id: 'L4', name: 'Untagged', is_own: false, source: 'manual', active: true },
    ]
    links = [
      { listing_id: 'L1', tag_id: 'T1' },
      { listing_id: 'L1', tag_id: 'P1' },
      { listing_id: 'L2', tag_id: 'T2' },
      { listing_id: 'L2', tag_id: 'P1' },
      { listing_id: 'L3', tag_id: 'T2' },
      { listing_id: 'L3', tag_id: 'P2' },
    ]
  })

  const names = () => screen.queryAllByRole('link').map((a) => a.textContent).filter((t) => /safari|cruise|untagged/i.test(t ?? ''))
  const pick = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

  it("shows each listing's tags", async () => {
    render(<ListingsPage />)
    const row = (await screen.findByText('Creek Cruise')).closest('tr')!
    expect(await within(row).findByText('Cruise')).toBeTruthy()
    expect(within(row).getByText('Dubai')).toBeTruthy()
    expect(within(screen.getByText('Untagged').closest('tr')!).getByText('No tags')).toBeTruthy()
  })

  it('offers only type tags in the type filter and only place tags in the place filter', async () => {
    render(<ListingsPage />)
    await screen.findByRole('option', { name: 'Safari' })
    const opts = (label: RegExp) =>
      within(screen.getByLabelText(label)).getAllByRole('option').map((o) => o.textContent)
    expect(opts(/^type$/i)).toEqual(['All types', 'Cruise', 'Safari'])
    expect(opts(/^place$/i)).toEqual(['All places', 'Abu Dhabi', 'Dubai'])
  })

  it('filters by type, by place, by both, and clears', async () => {
    render(<ListingsPage />)
    await screen.findByRole('option', { name: 'Safari' })
    expect(names()).toEqual(['Dune Safari', 'Creek Cruise', 'Island Cruise', 'Untagged'])

    pick(/^type$/i, 'T2')
    expect(names()).toEqual(['Creek Cruise', 'Island Cruise'])

    pick(/^place$/i, 'P1')
    expect(names()).toEqual(['Creek Cruise'])

    pick(/^type$/i, '')
    expect(names()).toEqual(['Dune Safari', 'Creek Cruise'])

    pick(/^type$/i, 'T1')
    pick(/^place$/i, 'P2')
    expect(names()).toEqual([])
    expect(screen.getByText(/no listings match these filters/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }))
    expect(names()).toHaveLength(4)
  })

  it('still shows listings when tags fail to load', async () => {
    const fake = createFakeSupabase((q) =>
      q.table === 'mt_tags' ? { data: null, error: { message: 'tags down' } } : respond(q))
    vi.mocked(supabase.from).mockImplementation(fake.client.from as never)
    render(<ListingsPage />)
    expect(await screen.findByText('Dune Safari')).toBeTruthy()
    expect(await screen.findByText(/could not load tags: tags down/i)).toBeTruthy()
  })
})
