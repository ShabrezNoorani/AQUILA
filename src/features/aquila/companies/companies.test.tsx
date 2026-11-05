import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { callsOf, createFakeSupabase, type Query, type Result } from '../test/fakeSupabase'
import { supabase } from '../../../lib/supabase'
import { createCompany, listCompanies, renameCompany, setListingCompany } from '../api'
import {
  companyRenameCheck,
  countListingsByCompany,
  findCompanyByName,
  listingRowToForm,
  normaliseCompanyName,
} from '../mapping'
import type { Company, Listing, ListingTag, Tag } from '../types'
import CompaniesPage from './CompaniesPage'
import { createListingWithTags } from '../api'

vi.mock('../../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

const has = (q: Query, m: string) => callsOf(q, m).length > 0

let queries: Query[]
let companies: Company[]
let listings: Partial<Listing>[]
let tags: Tag[]
let links: ListingTag[]
/** Latest snapshot per listing (newest first), and their option prices. */
let snapshots: { id: string; listing_id: string; captured_at: string; rating: number | null; review_count: number | null }[]
let options: { snapshot_id: string; price_per_person: number | null }[]

function respond(q: Query): Result {
  if (q.table === 'mt_companies') {
    if (has(q, 'insert')) return { data: { id: 'C-new', ...(callsOf(q, 'insert')[0][0] as object) }, error: null }
    if (has(q, 'update')) {
      const [[, id]] = callsOf(q, 'eq') as [string, string][]
      return { data: { ...companies.find((c) => c.id === id), ...(callsOf(q, 'update')[0][0] as object) }, error: null }
    }
    return { data: companies, error: null }
  }
  if (q.table === 'mt_tags') return { data: tags, error: null }
  if (q.table === 'mt_listing_tags') return { data: links, error: null }
  if (q.table === 'mt_listings') {
    if (has(q, 'update')) return { data: { id: 'L1', ...(callsOf(q, 'update')[0][0] as object) }, error: null }
    return { data: listings, error: null }
  }
  if (q.table === 'mt_snapshots') {
    const [[, listingId]] = callsOf(q, 'eq') as [string, string][]
    return { data: snapshots.filter((s) => s.listing_id === listingId).slice(0, 1), error: null }
  }
  if (q.table === 'mt_snapshot_options') {
    const [[, snapshotId]] = callsOf(q, 'eq') as [string, string][]
    return { data: options.filter((o) => o.snapshot_id === snapshotId), error: null }
  }
  return { data: [], error: null }
}

beforeEach(() => {
  companies = [
    { id: 'C1', name: 'Rival Co', is_own: false },
    { id: 'C2', name: 'Scenic Zest Tours', is_own: true },
  ]
  listings = [
    { id: 'L1', name: 'Rival Safari', company_id: 'C1', active: true },
    { id: 'L2', name: 'Rival Cruise', company_id: 'C1', active: false },
    { id: 'L3', name: 'Our Walk', company_id: 'C2', active: true },
    { id: 'L4', name: 'Loose One', company_id: null, active: true },
    { id: 'L5', name: 'Old Row', active: true },
  ]
  // Walking+Paris is on Our Walk (C2) and Loose One (unassigned) only. Rival Co has Boat+Paris
  // on one listing and Walking+Lyon on another, so it never has both Walking and Paris together.
  tags = [
    { id: 'T1', name: 'Walking', kind: 'type' },
    { id: 'T2', name: 'Boat', kind: 'type' },
    { id: 'T3', name: 'Unused', kind: 'type' },
    { id: 'P1', name: 'Paris', kind: 'place' },
    { id: 'P2', name: 'Lyon', kind: 'place' },
  ]
  links = [
    { listing_id: 'L1', tag_id: 'T2' }, { listing_id: 'L1', tag_id: 'P1' },
    { listing_id: 'L2', tag_id: 'T1' }, { listing_id: 'L2', tag_id: 'P2' },
    { listing_id: 'L3', tag_id: 'T1' }, { listing_id: 'L3', tag_id: 'P1' },
    { listing_id: 'L4', tag_id: 'T1' }, { listing_id: 'L4', tag_id: 'P1' },
  ]
  snapshots = [
    { id: 'S1', listing_id: 'L1', captured_at: '2026-10-01T00:00:00Z', rating: 4.6, review_count: 120 },
    { id: 'S3', listing_id: 'L3', captured_at: '2026-10-02T00:00:00Z', rating: 4.9, review_count: 1 },
  ]
  options = [
    { snapshot_id: 'S1', price_per_person: 89 },
    { snapshot_id: 'S1', price_per_person: 59.5 },
    { snapshot_id: 'S1', price_per_person: null },
    { snapshot_id: 'S3', price_per_person: 45 },
  ]
  localStorage.clear()
  sessionStorage.clear()
  const fake = createFakeSupabase((q) => respond(q))
  queries = fake.queries
  vi.mocked(supabase.from).mockImplementation(fake.client.from as never)
})

const writes = () => queries.filter((q) => has(q, 'insert') || has(q, 'update') || has(q, 'delete'))

// ---------- name rules ----------

describe('company name matching', () => {
  it('trims and collapses spaces', () => {
    expect(normaliseCompanyName('  Rival    Co  ')).toBe('Rival Co')
  })

  it('matches ignoring case and spacing', () => {
    for (const typed of ['rival co', 'RIVAL CO', '  Rival   Co ', 'rIvAl\tco']) {
      expect(findCompanyByName(companies, typed)?.id).toBe('C1')
    }
  })

  it('does not match a different name, or an empty one', () => {
    expect(findCompanyByName(companies, 'Rival Cos')).toBeUndefined()
    expect(findCompanyByName(companies, 'RivalCo')).toBeUndefined()
    expect(findCompanyByName(companies, '   ')).toBeUndefined()
  })

  it('checks a rename: cleans the name, refuses empty, refuses another company’s name, allows a case change', () => {
    expect(companyRenameCheck(companies, 'C1', '  Rival   Tours ')).toEqual({ ok: true, name: 'Rival Tours' })
    expect(companyRenameCheck(companies, 'C1', '  ')).toEqual({ ok: false, error: 'Company name is required' })
    expect(companyRenameCheck(companies, 'C1', 'scenic zest TOURS')).toEqual({
      ok: false, error: 'A company named “Scenic Zest Tours” already exists',
    })
    expect(companyRenameCheck(companies, 'C1', 'RIVAL CO')).toEqual({ ok: true, name: 'RIVAL CO' })
  })

  it('counts listings per company, with no company counted under null', () => {
    const counts = countListingsByCompany(listings)
    expect(counts.get('C1')).toBe(2)
    expect(counts.get('C2')).toBe(1)
    expect(counts.get(null)).toBe(2)
  })

  it('maps a listing to form text with its company name, and "" when unassigned', () => {
    const base = { id: 'L1', name: 'X', is_own: false, source: 'viator', url: null, competitor_name: null, active: true } as Listing
    expect(listingRowToForm({ ...base, company_id: 'C2' }, companies).company).toBe('Scenic Zest Tours')
    expect(listingRowToForm({ ...base, company_id: null }, companies).company).toBe('')
    expect(listingRowToForm({ ...base, company_id: 'gone' }, companies).company).toBe('')
  })
})

// ---------- api ----------

describe('company api', () => {
  it('createCompany reuses an existing company whatever its case and spacing, writing nothing', async () => {
    const r = await createCompany('  rival   CO ', true)
    expect(r).toEqual({ company: companies[0], existed: true })
    expect(writes()).toHaveLength(0)
  })

  it('createCompany inserts a new company with a cleaned name and the OWN flag', async () => {
    const r = await createCompany('  Brand   New ', true)
    expect(r.existed).toBe(false)
    const [ins] = writes()
    expect(ins.table).toBe('mt_companies')
    expect(callsOf(ins, 'insert')[0][0]).toEqual({ name: 'Brand New', is_own: true })
  })

  it('createCompany refuses an empty name', async () => {
    await expect(createCompany('   ')).rejects.toThrow(/company name is required/i)
    expect(writes()).toHaveLength(0)
  })

  it('renameCompany updates one row by id with the cleaned name', async () => {
    const saved = await renameCompany('C1', '  Rival   Tours ')
    expect(saved.name).toBe('Rival Tours')
    const [upd] = writes()
    expect(upd.table).toBe('mt_companies')
    expect(callsOf(upd, 'update')[0][0]).toEqual({ name: 'Rival Tours' })
    expect(callsOf(upd, 'eq')).toEqual([['id', 'C1']])
  })

  it('renameCompany refuses a name another company has, and writes nothing', async () => {
    await expect(renameCompany('C1', ' scenic zest tours')).rejects.toThrow(/already exists/)
    expect(writes()).toHaveLength(0)
  })

  it('setListingCompany sets or clears company_id on one listing', async () => {
    await setListingCompany('L1', 'C2')
    await setListingCompany('L1', null)
    const ups = writes()
    expect(ups.map((q) => q.table)).toEqual(['mt_listings', 'mt_listings'])
    expect(ups.map((q) => callsOf(q, 'update')[0][0])).toEqual([{ company_id: 'C2' }, { company_id: null }])
    expect(callsOf(ups[0], 'eq')).toEqual([['id', 'L1']])
  })

  it('listCompanies adds each company’s listing count', async () => {
    const rows = await listCompanies()
    expect(rows.map((c) => [c.name, c.listing_count])).toEqual([['Rival Co', 2], ['Scenic Zest Tours', 1]])
    const read = queries.find((q) => q.table === 'mt_listings')!
    expect(callsOf(read, 'select')).toEqual([['company_id']])
  })
})

// ---------- page ----------

describe('CompaniesPage', () => {
  it('shows each company with its OWN marker and listing count, plus an Unassigned row', async () => {
    render(<CompaniesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'List' }))
    const table = await screen.findByRole('table', { name: 'Companies' })
    const row = (name: string) => within(table).getByText(name).closest('tr')!
    expect(within(row('Rival Co')).queryByText('OWN')).toBeNull()
    expect(within(row('Rival Co')).queryByText(/competitor/i)).toBeNull()
    expect(within(row('Rival Co')).getByText('2')).toBeTruthy()
    expect(within(row('Scenic Zest Tours')).getByText('OWN')).toBeTruthy()
    expect(within(row('Scenic Zest Tours')).getByText('1')).toBeTruthy()
    const unassigned = within(table).getByRole('link', { name: 'Unassigned' })
    expect(unassigned.getAttribute('href')).toBe('#/companies/unassigned')
    expect(within(unassigned.closest('tr')!).getByText('2')).toBeTruthy()
    expect(within(table).getByRole('link', { name: 'Rival Co' }).getAttribute('href')).toBe('#/companies/C1')
  })

  it('renames a company inline', async () => {
    render(<CompaniesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Rival Co' }))
    const form = screen.getByRole('form', { name: 'Rename Rival Co' })
    fireEvent.change(within(form).getByLabelText('Company name'), { target: { value: ' Rival  Tours ' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('link', { name: 'Rival Tours' })).toBeTruthy()
    expect(screen.queryByRole('form', { name: 'Rename Rival Co' })).toBeNull()
    expect(callsOf(writes()[0], 'update')[0][0]).toEqual({ name: 'Rival Tours' })
  })

  it('shows the error and keeps the form open when the new name is taken', async () => {
    render(<CompaniesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Rival Co' }))
    const form = screen.getByRole('form', { name: 'Rename Rival Co' })
    fireEvent.change(within(form).getByLabelText('Company name'), { target: { value: 'SCENIC ZEST TOURS' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    expect((await within(form).findByRole('alert')).textContent).toMatch(/already exists/)
    expect(writes()).toHaveLength(0)
  })

  it("shows one company's listings, with the OWN marker", async () => {
    localStorage.setItem('aquila.company.view', 'list')
    render(<CompaniesPage companyId="C2" />)
    expect(await screen.findByRole('heading', { name: 'Scenic Zest Tours' })).toBeTruthy()
    expect(screen.getByText('OWN')).toBeTruthy()
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('link').map((a) => a.textContent)).toEqual(['Our Walk'])
    expect(within(table).getByRole('link', { name: 'Our Walk' }).getAttribute('href')).toBe('#/listings/L3')
  })

  it('shows listings with no company under Unassigned', async () => {
    localStorage.setItem('aquila.company.view', 'list')
    render(<CompaniesPage companyId="unassigned" />)
    expect(await screen.findByRole('heading', { name: 'Unassigned' })).toBeTruthy()
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('link').map((a) => a.textContent)).toEqual(['Loose One', 'Old Row'])
  })

  it('says so when the company does not exist', async () => {
    render(<CompaniesPage companyId="nope" />)
    expect(await screen.findByText(/does not exist/i)).toBeTruthy()
  })

  it('shows a load error', async () => {
    const fake = createFakeSupabase((q) =>
      q.table === 'mt_companies' ? { data: null, error: { message: 'relation "mt_companies" does not exist' } } : respond(q))
    vi.mocked(supabase.from).mockImplementation(fake.client.from as never)
    render(<CompaniesPage />)
    expect(await screen.findByText(/could not load companies/i)).toBeTruthy()
  })
})

// ---------- views, sorting and the tag filter ----------

describe('CompaniesPage views, sorting and tag filter', () => {
  const view = (name: 'Library' | 'List') => screen.getByRole('button', { name })
  const tag = (name: string) => within(screen.getByRole('group', { name: 'Filter by tag' })).getByRole('button', { name })
  /** Company names in the order shown, in whichever view is open. */
  const shownNames = () => {
    const box = screen.queryByRole('list', { name: 'Companies' }) ?? screen.getByRole('table', { name: 'Companies' })
    return within(box).getAllByRole('link').map((a) => a.textContent)
  }

  it('the page and sidebar are called Companies, and Library is the default view', async () => {
    render(<CompaniesPage />)
    expect(await screen.findByRole('heading', { name: 'Companies' })).toBeTruthy()
    expect(view('Library').getAttribute('aria-pressed')).toBe('true')
    expect(view('List').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('list', { name: 'Companies' })).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('a Library card shows the name, OWN badge, listing count and the tags its listings use', async () => {
    render(<CompaniesPage />)
    const cards = within(await screen.findByRole('list', { name: 'Companies' })).getAllByRole('listitem')
    const card = (name: string) => cards.find((c) => within(c).queryByRole('link', { name }))!
    const ours = card('Scenic Zest Tours')
    expect(within(ours).getByText('OWN')).toBeTruthy()
    expect(within(ours).getByText('1 listing')).toBeTruthy()
    expect([...ours.querySelectorAll('[data-kind]')].map((b) => b.textContent)).toEqual(['Paris', 'Walking'])
    const rival = card('Rival Co')
    expect(within(rival).queryByText('OWN')).toBeNull()
    expect(within(rival).getByText('2 listings')).toBeTruthy()
    expect([...rival.querySelectorAll('[data-kind]')].map((b) => b.textContent)).toEqual(['Lyon', 'Paris', 'Boat', 'Walking'])
  })

  it('switches between Library and List, and remembers the choice', async () => {
    const { unmount } = render(<CompaniesPage />)
    await screen.findByRole('list', { name: 'Companies' })
    fireEvent.click(view('List'))
    expect(screen.getByRole('table', { name: 'Companies' })).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Companies' })).toBeNull()
    expect(localStorage.getItem('aquila.companies.view')).toBe('list')
    unmount()
    render(<CompaniesPage />)
    expect(await screen.findByRole('table', { name: 'Companies' })).toBeTruthy()
    fireEvent.click(view('Library'))
    expect(screen.getByRole('list', { name: 'Companies' })).toBeTruthy()
  })

  it('sorts A to Z by default and Z to A on request, ignoring capitals, with Unassigned last', async () => {
    companies = [...companies, { id: 'C3', name: 'apex travel', is_own: false }]
    render(<CompaniesPage />)
    await screen.findByRole('list', { name: 'Companies' })
    const sort = screen.getByLabelText('Sort') as HTMLSelectElement
    expect(sort.value).toBe('az')
    expect([...sort.options].map((o) => o.textContent)).toEqual(['A to Z', 'Z to A'])
    expect(shownNames()).toEqual(['apex travel', 'Rival Co', 'Scenic Zest Tours', 'Unassigned'])
    fireEvent.change(sort, { target: { value: 'za' } })
    expect(shownNames()).toEqual(['Scenic Zest Tours', 'Rival Co', 'apex travel', 'Unassigned'])
    expect(localStorage.getItem('aquila.companies.sort')).toBe('za')
    fireEvent.click(view('List'))
    expect(shownNames()).toEqual(['Scenic Zest Tours', 'Rival Co', 'apex travel', 'Unassigned'])
  })

  it('still works when storage is blocked', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    try {
      render(<CompaniesPage />)
      await screen.findByRole('list', { name: 'Companies' })
      fireEvent.click(view('List'))
      expect(screen.getByRole('table', { name: 'Companies' })).toBeTruthy()
      fireEvent.click(tag('Walking'))
      expect(tag('Walking').getAttribute('aria-pressed')).toBe('true')
    } finally {
      get.mockRestore()
      set.mockRestore()
    }
  })

  it('offers every tag used by a listing in one row per kind, and no unused tag', async () => {
    render(<CompaniesPage />)
    const bar = await screen.findByRole('group', { name: 'Filter by tag' })
    const row = (kind: string) => within(within(bar).getByRole('group', { name: kind })).getAllByRole('button').map((b) => b.textContent)
    expect(row('Place')).toEqual(['Lyon', 'Paris'])
    expect(row('Type')).toEqual(['Boat', 'Walking'])
    expect(within(bar).getByText('Place:')).toBeTruthy()
    expect(within(bar).getByText('Type:')).toBeTruthy()
    expect(within(bar).queryByRole('button', { name: 'Unused' })).toBeNull()
    expect(within(bar).queryByRole('button', { name: 'Clear' })).toBeNull()
  })

  it('one selected tag shows only companies with a listing carrying it', async () => {
    render(<CompaniesPage />)
    await screen.findByRole('group', { name: 'Filter by tag' })
    fireEvent.click(tag('Boat'))
    expect(tag('Boat').getAttribute('aria-pressed')).toBe('true')
    expect(shownNames()).toEqual(['Rival Co'])
    expect(screen.getByText('1 of 2 listings match')).toBeTruthy()
  })

  it('two selected tags must all be on the same listing', async () => {
    render(<CompaniesPage />)
    await screen.findByRole('group', { name: 'Filter by tag' })
    fireEvent.click(tag('Walking'))
    expect(shownNames()).toEqual(['Rival Co', 'Scenic Zest Tours', 'Unassigned'])
    fireEvent.click(tag('Paris'))
    // Rival Co has Walking and Paris, but never on the same listing.
    expect(shownNames()).toEqual(['Scenic Zest Tours', 'Unassigned'])
    fireEvent.click(view('List'))
    expect(shownNames()).toEqual(['Scenic Zest Tours', 'Unassigned'])
  })

  it('says so when no company matches every selected tag', async () => {
    render(<CompaniesPage />)
    await screen.findByRole('group', { name: 'Filter by tag' })
    fireEvent.click(tag('Boat'))
    fireEvent.click(tag('Lyon'))
    expect(screen.getByText(/no company has a listing with all the selected tags/i)).toBeTruthy()
  })

  it('clicking a selected tag again deselects it, and Clear removes them all', async () => {
    render(<CompaniesPage />)
    await screen.findByRole('group', { name: 'Filter by tag' })
    fireEvent.click(tag('Boat'))
    fireEvent.click(tag('Boat'))
    expect(tag('Boat').getAttribute('aria-pressed')).toBe('false')
    expect(shownNames()).toEqual(['Rival Co', 'Scenic Zest Tours', 'Unassigned'])
    fireEvent.click(tag('Walking'))
    fireEvent.click(tag('Paris'))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(shownNames()).toEqual(['Rival Co', 'Scenic Zest Tours', 'Unassigned'])
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  })

  it('keeps the Unassigned row in the List view, linking to its listings', async () => {
    render(<CompaniesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'List' }))
    const link = within(screen.getByRole('table', { name: 'Companies' })).getByRole('link', { name: 'Unassigned' })
    expect(link.getAttribute('href')).toBe('#/companies/unassigned')
    expect(within(link.closest('tr')!).getByText('2')).toBeTruthy()
  })

  it("opening a company with tags selected shows only its listings that carry them all", async () => {
    const { unmount } = render(<CompaniesPage />)
    await screen.findByRole('group', { name: 'Filter by tag' })
    fireEvent.click(tag('Boat'))
    unmount()
    localStorage.setItem('aquila.company.view', 'list')
    render(<CompaniesPage companyId="C1" />)
    const table = await screen.findByRole('table', { name: 'Listings for Rival Co' })
    expect(within(table).getAllByRole('link').map((a) => a.textContent)).toEqual(['Rival Safari'])
    expect(screen.getByText('1 of 2 listings match the selected tags')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(within(screen.getByRole('table')).getAllByRole('link').map((a) => a.textContent)).toEqual(['Rival Safari', 'Rival Cruise'])
  })

  it('filters the Unassigned listings by the selected tags too', async () => {
    sessionStorage.setItem('aquila.companies.tags', JSON.stringify(['T2']))
    localStorage.setItem('aquila.company.view', 'list')
    render(<CompaniesPage companyId="unassigned" />)
    expect(await screen.findByText(/no listings here have all the selected tags/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(within(screen.getByRole('table')).getAllByRole('link').map((a) => a.textContent)).toEqual(['Loose One', 'Old Row'])
  })
})

// ---------- a listing saved with a company ----------

describe('a listing with a company', () => {
  it('appears under that company, not under Unassigned', async () => {
    // A tiny mt_listings table: what createListingWithTags inserts is what the page reads back.
    const stored: Record<string, unknown>[] = []
    companies = [{ id: 'CW', name: 'City Wonders Ltd', is_own: false }]
    links = []
    const fake = createFakeSupabase((q) => {
      if (q.table === 'mt_listings' && has(q, 'insert')) {
        const row = { id: 'NEW1', ...(callsOf(q, 'insert')[0][0] as object) }
        stored.push(row)
        return { data: row, error: null }
      }
      if (q.table === 'mt_listings') return { data: stored, error: null }
      return respond(q)
    })
    vi.mocked(supabase.from).mockImplementation(fake.client.from as never)

    await createListingWithTags({
      name: 'Notre-Dame Tour with Access to the Cathedral', is_own: false, source: 'viator',
      url: null, competitor_name: null, active: true, company_id: 'CW',
    }, [])

    const { unmount } = render(<CompaniesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'List' }))
    const table = screen.getByRole('table', { name: 'Companies' })
    const row = within(table).getByRole('link', { name: 'City Wonders Ltd' }).closest('tr')!
    expect(within(row).getByText('1')).toBeTruthy()
    expect(within(table).queryByRole('link', { name: 'Unassigned' })).toBeNull()
    unmount()

    localStorage.setItem('aquila.company.view', 'list')
    render(<CompaniesPage companyId="CW" />)
    const listingsTable = await screen.findByRole('table', { name: 'Listings for City Wonders Ltd' })
    expect(within(listingsTable).getByRole('link', { name: 'Notre-Dame Tour with Access to the Cathedral' })).toBeTruthy()
  })

  it('a listing with only the old "Competitor name" text, and no company_id, is Unassigned', async () => {
    companies = [{ id: 'CW', name: 'City Wonders Ltd', is_own: false }]
    listings = [{ id: 'X', name: 'Old Notre-Dame Tour', competitor_name: 'City Wonders Ltd', company_id: null, active: true }]
    links = []
    render(<CompaniesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'List' }))
    const table = screen.getByRole('table', { name: 'Companies' })
    expect(within(within(table).getByRole('link', { name: 'Unassigned' }).closest('tr')!).getByText('1')).toBeTruthy()
    expect(within(within(table).getByRole('link', { name: 'City Wonders Ltd' }).closest('tr')!).getByText('0')).toBeTruthy()
  })
})

// ---------- new company, trailing dots, any kind ----------

describe('New company', () => {
  it('creates "Scenic Zest Tours" as OWN from the Companies page, and shows the OWN badge', async () => {
    companies = [{ id: 'C1', name: 'Rival Co', is_own: false }]
    render(<CompaniesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'New company' }))
    const form = screen.getByRole('form', { name: 'New company' })
    fireEvent.change(within(form).getByLabelText('Company name *'), { target: { value: '  Scenic   Zest Tours ' } })
    fireEvent.click(within(form).getByLabelText('This is ours (OWN)'))
    fireEvent.click(within(form).getByRole('button', { name: 'Add company' }))
    expect(await screen.findByText('Added “Scenic Zest Tours” as OWN.')).toBeTruthy()
    const [ins] = writes()
    expect(ins.table).toBe('mt_companies')
    expect(callsOf(ins, 'insert')[0][0]).toEqual({ name: 'Scenic Zest Tours', is_own: true })
    const card = within(screen.getByRole('list', { name: 'Companies' })).getAllByRole('listitem')
      .find((c) => within(c).queryByRole('link', { name: 'Scenic Zest Tours' }))!
    expect(within(card).getByText('OWN')).toBeTruthy()
    expect(within(card).getByText('0 listings')).toBeTruthy()
  })

  it('does not add a duplicate: a name matching ignoring capitals, spaces and trailing dots is reported', async () => {
    render(<CompaniesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'New company' }))
    const form = screen.getByRole('form', { name: 'New company' })
    fireEvent.change(within(form).getByLabelText('Company name *'), { target: { value: 'rival  CO.' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add company' }))
    expect(await screen.findByText('“Rival Co” already exists, so no new company was added.')).toBeTruthy()
    expect(writes()).toHaveLength(0)
  })

  it('refuses an empty name', async () => {
    render(<CompaniesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'New company' }))
    const form = screen.getByRole('form', { name: 'New company' })
    fireEvent.click(within(form).getByRole('button', { name: 'Add company' }))
    expect((await within(form).findByRole('alert')).textContent).toMatch(/company name is required/i)
    expect(writes()).toHaveLength(0)
  })
})

describe('trailing dots and tags of new kinds', () => {
  it('"City Wonders Ltd." and "City Wonders Ltd" are the same company', () => {
    const list: Company[] = [{ id: 'CW', name: 'City Wonders Ltd', is_own: false }]
    expect(findCompanyByName(list, 'City Wonders Ltd.')?.id).toBe('CW')
    expect(findCompanyByName(list, '  city wonders ltd...  ')?.id).toBe('CW')
    expect(findCompanyByName([{ id: 'X', name: 'City Wonders Ltd.', is_own: false }], 'city wonders ltd')?.id).toBe('X')
    expect(companyRenameCheck(list, 'other', 'City Wonders Ltd.').ok).toBe(false)
  })

  it('a tag of any new kind gets its own filter row, and selections across kinds must all match', async () => {
    tags = [...tags, { id: 'F1', name: 'Bakery', kind: 'food' }]
    links = [...links, { listing_id: 'L3', tag_id: 'F1' }, { listing_id: 'L1', tag_id: 'F1' }]
    render(<CompaniesPage />)
    const bar = await screen.findByRole('group', { name: 'Filter by tag' })
    expect(within(within(bar).getByRole('group', { name: 'Food' })).getByRole('button', { name: 'Bakery' })).toBeTruthy()
    fireEvent.click(within(bar).getByRole('button', { name: 'Bakery' }))
    expect(within(screen.getByRole('list', { name: 'Companies' })).getAllByRole('link').map((a) => a.textContent))
      .toEqual(['Rival Co', 'Scenic Zest Tours'])
    fireEvent.click(within(bar).getByRole('button', { name: 'Walking' }))
    // Only Our Walk (Scenic Zest Tours) has both Bakery and Walking.
    expect(within(screen.getByRole('list', { name: 'Companies' })).getAllByRole('link').map((a) => a.textContent))
      .toEqual(['Scenic Zest Tours'])
  })
})

// ---------- one company's listings: Library or List ----------

describe("one company's listings as Library or List", () => {
  const view = (name: 'Library' | 'List') => screen.getByRole('button', { name })
  const cards = () => within(screen.getByRole('list', { name: 'Listings for Rival Co' })).getAllByRole('listitem')

  it('shows Library and List buttons, with Library (cards) by default', async () => {
    render(<CompaniesPage companyId="C1" />)
    await screen.findByRole('list', { name: 'Listings for Rival Co' })
    expect(view('Library').getAttribute('aria-pressed')).toBe('true')
    expect(view('List').getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('table')).toBeNull()
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual(['Rival Safari', 'Rival Cruise'])
  })

  it('a card shows the title, company name, price from, rating, review count and tags', async () => {
    render(<CompaniesPage companyId="C1" />)
    const card = (await screen.findByRole('listitem', { name: 'Rival Safari' }))
    expect(within(card).getByRole('link', { name: 'Rival Safari' }).getAttribute('href')).toBe('#/listings/L1')
    expect(within(card).getByText('Rival Co')).toBeTruthy()
    expect(await within(card).findByText('From 59.5')).toBeTruthy()
    expect(within(card).getByText('4.6 ★ · 120 reviews')).toBeTruthy()
    expect(within(card).getByText('Boat')).toBeTruthy()
    expect(within(card).getByText('Paris')).toBeTruthy()
    expect(within(card).queryByText('OWN')).toBeNull()
    // A listing with no snapshot yet says so.
    const empty = screen.getByRole('listitem', { name: 'Rival Cruise' })
    expect(within(empty).getByText('No price yet')).toBeTruthy()
    expect(within(empty).getByText('No rating yet')).toBeTruthy()
  })

  it('reads only the summary columns of the latest snapshot, never the saved page', async () => {
    render(<CompaniesPage companyId="C1" />)
    await screen.findByText('From 59.5')
    const snap = queries.filter((q) => q.table === 'mt_snapshots')
    expect(snap.length).toBeGreaterThan(0)
    for (const q of snap) {
      expect(callsOf(q, 'select')[0][0]).toBe('id, captured_at, rating, review_count')
      expect(callsOf(q, 'order')[0]).toEqual(['captured_at', { ascending: false }])
      expect(callsOf(q, 'limit')[0][0]).toBe(1)
    }
  })

  it('cards of our own company carry the OWN badge', async () => {
    render(<CompaniesPage companyId="C2" />)
    const card = await screen.findByRole('listitem', { name: 'Our Walk' })
    expect(within(card).getByText('OWN')).toBeTruthy()
    expect(within(card).getByText('Scenic Zest Tours')).toBeTruthy()
    expect(await within(card).findByText('From 45')).toBeTruthy()
    expect(within(card).getByText('4.9 ★ · 1 review')).toBeTruthy()
  })

  it('switches to List (the table) and remembers the choice', async () => {
    const { unmount } = render(<CompaniesPage companyId="C1" />)
    await screen.findByRole('list', { name: 'Listings for Rival Co' })
    fireEvent.click(view('List'))
    expect(screen.getByRole('table', { name: 'Listings for Rival Co' })).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Listings for Rival Co' })).toBeNull()
    expect(localStorage.getItem('aquila.company.view')).toBe('list')
    unmount()
    render(<CompaniesPage companyId="C1" />)
    expect(await screen.findByRole('table', { name: 'Listings for Rival Co' })).toBeTruthy()
    expect(view('List').getAttribute('aria-pressed')).toBe('true')
  })

  it('the tag filter works in both views, and every selected tag must match', async () => {
    render(<CompaniesPage companyId="C1" />)
    await screen.findByRole('list', { name: 'Listings for Rival Co' })
    const tag = (name: string) => within(screen.getByRole('group', { name: 'Filter by tag' })).getByRole('button', { name })
    fireEvent.click(tag('Walking'))
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual(['Rival Cruise'])
    fireEvent.click(tag('Paris'))
    expect(screen.getByText(/no listings here have all the selected tags/i)).toBeTruthy()
    fireEvent.click(tag('Paris'))
    fireEvent.click(view('List'))
    const table = screen.getByRole('table', { name: 'Listings for Rival Co' })
    expect(within(table).getAllByRole('link').map((a) => a.textContent)).toEqual(['Rival Cruise'])
    fireEvent.click(view('Library'))
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual(['Rival Cruise'])
  })

  it('still works when storage is blocked', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    try {
      render(<CompaniesPage companyId="C1" />)
      await screen.findByRole('list', { name: 'Listings for Rival Co' })
      fireEvent.click(view('List'))
      expect(screen.getByRole('table', { name: 'Listings for Rival Co' })).toBeTruthy()
    } finally {
      spy.mockRestore()
      set.mockRestore()
    }
  })
})
