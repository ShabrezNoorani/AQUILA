import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsOf, createFakeSupabase, type Query, type Result } from './test/fakeSupabase'
import { supabase } from '../../lib/supabase'
import { createListing, createSnapshot, fetchListing, fetchListings, fetchSnapshots } from './api'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

let respond: (q: Query) => Result
let queries: Query[]

beforeEach(() => {
  respond = () => ({ data: [], error: null })
  const fake = createFakeSupabase((q) => respond(q))
  queries = fake.queries
  vi.mocked(supabase.from).mockImplementation(fake.client.from as never)
})

describe('api', () => {
  it('fetchListings reads mt_listings', async () => {
    respond = () => ({ data: [{ id: '1', name: 'A' }], error: null })
    const rows = await fetchListings()
    expect(rows).toEqual([{ id: '1', name: 'A' }])
    expect(queries.map((q) => q.table)).toEqual(['mt_listings'])
    expect(callsOf(queries[0], 'select')).toEqual([['*']])
  })

  it('fetchListing reads one listing by id', async () => {
    respond = () => ({ data: { id: '7', name: 'A' }, error: null })
    await fetchListing('7')
    expect(queries[0].table).toBe('mt_listings')
    expect(callsOf(queries[0], 'eq')).toEqual([['id', '7']])
  })

  it('createListing inserts into mt_listings', async () => {
    respond = () => ({ data: { id: '9' }, error: null })
    const row = {
      name: 'A',
      is_own: true,
      source: 'manual' as const,
      url: null,
      competitor_name: null,
      active: true,
    }
    await createListing(row)
    expect(queries[0].table).toBe('mt_listings')
    expect(callsOf(queries[0], 'insert')).toEqual([[row]])
    expect(callsOf(queries[0], 'insert')[0][0]).toHaveProperty('active', true)
    expect(Object.keys(callsOf(queries[0], 'insert')[0][0] as object).sort()).toEqual(
      ['active', 'competitor_name', 'is_own', 'name', 'source', 'url'],
    )
  })

  it('fetchSnapshots reads mt_snapshots for one listing, newest first', async () => {
    await fetchSnapshots('abc')
    expect(queries[0].table).toBe('mt_snapshots')
    expect(callsOf(queries[0], 'eq')).toEqual([['listing_id', 'abc']])
    expect(callsOf(queries[0], 'order')).toEqual([['captured_at', { ascending: false }]])
  })

  it('createSnapshot inserts into mt_snapshots', async () => {
    respond = () => ({ data: { id: 's1' }, error: null })
    await createSnapshot({ listing_id: 'abc', method: 'manual', status: 'complete' } as never)
    expect(queries[0].table).toBe('mt_snapshots')
    expect(callsOf(queries[0], 'insert')[0][0]).not.toHaveProperty('captured_at')
    expect(callsOf(queries[0], 'insert')[0][0]).toMatchObject({ listing_id: 'abc', method: 'manual' })
  })

  it('throws the Supabase error message', async () => {
    respond = () => ({ data: null, error: { message: 'permission denied' } })
    await expect(fetchListings()).rejects.toThrow('permission denied')
  })

  it('only ever touches mt_listings and mt_snapshots', async () => {
    await fetchListings()
    await fetchSnapshots('x')
    for (const q of queries) expect(['mt_listings', 'mt_snapshots']).toContain(q.table)
  })
})
