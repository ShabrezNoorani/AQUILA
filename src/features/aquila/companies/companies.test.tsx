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
import type { Company, Listing } from '../types'
import CompaniesPage from './CompaniesPage'

vi.mock('../../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

const has = (q: Query, m: string) => callsOf(q, m).length > 0

let queries: Query[]
let companies: Company[]
let listings: Partial<Listing>[]

function respond(q: Query): Result {
  if (q.table === 'mt_companies') {
    if (has(q, 'insert')) return { data: { id: 'C-new', ...(callsOf(q, 'insert')[0][0] as object) }, error: null }
    if (has(q, 'update')) {
      const [[, id]] = callsOf(q, 'eq') as [string, string][]
      return { data: { ...companies.find((c) => c.id === id), ...(callsOf(q, 'update')[0][0] as object) }, error: null }
    }
    return { data: companies, error: null }
  }
  if (q.table === 'mt_listings') {
    if (has(q, 'update')) return { data: { id: 'L1', ...(callsOf(q, 'update')[0][0] as object) }, error: null }
    return { data: listings, error: null }
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
    const table = await screen.findByRole('table', { name: 'Companies' })
    const row = (name: string) => within(table).getByText(name).closest('tr')!
    expect(within(row('Rival Co')).getByText('Competitor')).toBeTruthy()
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
    render(<CompaniesPage companyId="C2" />)
    expect(await screen.findByRole('heading', { name: 'Scenic Zest Tours' })).toBeTruthy()
    expect(screen.getByText('OWN')).toBeTruthy()
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('link').map((a) => a.textContent)).toEqual(['Our Walk'])
    expect(within(table).getByRole('link', { name: 'Our Walk' }).getAttribute('href')).toBe('#/listings/L3')
  })

  it('shows listings with no company under Unassigned', async () => {
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
