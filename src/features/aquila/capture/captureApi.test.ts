import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsOf, createFakeSupabase, type Query, type Result } from '../test/fakeSupabase'
import { supabase } from '../../../lib/supabase'
import { emptySnapshotForm } from '../mapping'
import { optionRows, parsePricedFor, saveAssistedSnapshot, saveSnapshotWithOptions } from './captureApi'

vi.mock('../../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

let respond: (q: Query) => Result
let queries: Query[]

beforeEach(() => {
  respond = () => ({ data: { id: 's1' }, error: null })
  const fake = createFakeSupabase((q) => respond(q))
  queries = fake.queries
  vi.mocked(supabase.from).mockImplementation(fake.client.from as never)
})

const form = {
  ...emptySnapshotForm(),
  title: 'Notre-Dame tour',
  duration: '1 hour',
  languages: 'English, French',
  options: 'Shared\nPrivate |  | 300',
  rating: '4.5',
  review_count: '283',
}

describe('saveAssistedSnapshot', () => {
  it('inserts into mt_snapshots with method assisted, the raw page, and the exact columns', async () => {
    const r = await saveAssistedSnapshot('L1', form, '<html>raw</html>', 'raw text')
    expect(r.ok).toBe(true)
    expect(queries.map((q) => q.table)).toEqual(['mt_snapshots', 'mt_snapshot_options'])
    const row = callsOf(queries[0], 'insert')[0][0] as Record<string, unknown>
    expect(row).toMatchObject({
      listing_id: 'L1',
      method: 'assisted',
      status: 'complete',
      raw_html: '<html>raw</html>',
      raw_text: 'raw text',
      title: 'Notre-Dame tour',
      languages: ['English', 'French'],
      options: [
        { name: 'Shared', description: null, price: null },
        { name: 'Private', description: null, price: 300 },
      ],
      rating: 4.5,
      review_count: 283,
    })
    expect(Object.keys(row).sort()).toEqual([
      'duration', 'exclusions', 'group_type', 'highlights', 'inclusions', 'itinerary',
      'languages', 'listing_id', 'method', 'options', 'overview', 'rating', 'raw_html', 'raw_text',
      'review_count', 'status', 'title', 'urgency_text', 'why_this',
    ])
  })

  it('saves status partial when a core field is blank', async () => {
    await saveAssistedSnapshot('L1', { ...form, duration: '' }, '<html></html>', '')
    expect(callsOf(queries[0], 'insert')[0][0]).toMatchObject({ status: 'partial', method: 'assisted' })
  })

  it('returns field errors and inserts nothing when the form is invalid', async () => {
    const r = await saveAssistedSnapshot('L1', { ...form, rating: '11' }, '<html></html>', '')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.rating).toBeDefined()
    expect(queries).toHaveLength(0)
  })

  it('throws the Supabase error message', async () => {
    respond = () => ({ data: null, error: { message: 'column "raw_html" does not exist' } })
    await expect(saveAssistedSnapshot('L1', form, '<html></html>', '')).rejects.toThrow('raw_html')
  })
})

describe('saveAssistedSnapshot options', () => {
  const NOW = new Date(2026, 10, 2) // 2 Nov 2026, local time
  const priced = {
    ...form,
    options: [
      'Shared | Priced for 2 travelers, Nov 25 | 95.20',
      'Private | Priced for 1 traveler | 147.98',
      'Sunset | Pickup included | 80',
      'Walk-in',
    ].join('\n'),
  }
  const optionInsert = () => queries.find((q) => q.table === 'mt_snapshot_options')!

  it('keeps the options column on the snapshot and inserts one mt_snapshot_options row per option', async () => {
    const r = await saveAssistedSnapshot('L1', priced, '<html></html>', '', NOW)
    expect(r).toEqual({ ok: true, id: 's1' })
    expect(queries.map((q) => q.table)).toEqual(['mt_snapshots', 'mt_snapshot_options'])
    const snap = callsOf(queries[0], 'insert')[0][0] as { options: unknown[] }
    expect(snap.options).toHaveLength(4)
    expect(callsOf(optionInsert(), 'insert')[0][0]).toEqual([
      { snapshot_id: 's1', sort_order: 0, name: 'Shared', description: 'Priced for 2 travelers, Nov 25', price_per_person: 95.2, travelers: 2, price_date: '2026-11-25' },
      { snapshot_id: 's1', sort_order: 1, name: 'Private', description: 'Priced for 1 traveler', price_per_person: 147.98, travelers: 1, price_date: null },
      { snapshot_id: 's1', sort_order: 2, name: 'Sunset', description: 'Pickup included', price_per_person: 80, travelers: null, price_date: null },
      { snapshot_id: 's1', sort_order: 3, name: 'Walk-in', description: null, price_per_person: null, travelers: null, price_date: null },
    ])
  })

  it('inserts no option rows when there are no options', async () => {
    await saveAssistedSnapshot('L1', { ...form, options: '' }, '<html></html>', '')
    expect(queries.map((q) => q.table)).toEqual(['mt_snapshots'])
  })

  it('deletes the snapshot again and throws when the options cannot be saved', async () => {
    respond = (q) => {
      if (q.table === 'mt_snapshot_options') return { data: null, error: { message: 'relation denied' } }
      if (callsOf(q, 'delete').length) return { data: [{ id: 's1' }], error: null }
      return { data: { id: 's1' }, error: null }
    }
    await expect(saveAssistedSnapshot('L1', priced, '<html></html>', '', NOW)).rejects.toThrow(
      /snapshot was not saved: relation denied/,
    )
    const del = queries.find((q) => q.table === 'mt_snapshots' && callsOf(q, 'delete').length)!
    expect(callsOf(del, 'eq')).toEqual([['id', 's1']])
  })

  it('says the snapshot was left behind when the undo also fails', async () => {
    respond = (q) => {
      if (q.table === 'mt_snapshot_options') return { data: null, error: { message: 'relation denied' } }
      if (callsOf(q, 'delete').length) return { data: [], error: null }
      return { data: { id: 's1' }, error: null }
    }
    await expect(saveAssistedSnapshot('L1', priced, '<html></html>', '', NOW)).rejects.toThrow(
      /relation denied.*could not be removed.*Snapshot s1 exists without option rows/,
    )
  })

  it('writes nothing to mt_snapshot_options when the snapshot insert fails', async () => {
    respond = () => ({ data: null, error: { message: 'snapshot denied' } })
    await expect(saveAssistedSnapshot('L1', priced, '<html></html>', '', NOW)).rejects.toThrow('snapshot denied')
    expect(queries.map((q) => q.table)).toEqual(['mt_snapshots'])
  })
})

describe('saveSnapshotWithOptions (manual rows)', () => {
  it('saves a manual snapshot and its option rows through the same path', async () => {
    const id = await saveSnapshotWithOptions({
      listing_id: 'L1', method: 'manual', status: 'partial', title: null, overview: null, duration: null,
      languages: [], group_type: null, highlights: [], inclusions: null, exclusions: null, why_this: null,
      itinerary: [], rating: null, review_count: null, urgency_text: null,
      options: [{ name: 'Shared', description: 'Group', price: 150 }],
    })
    expect(id).toBe('s1')
    expect(queries.map((q) => q.table)).toEqual(['mt_snapshots', 'mt_snapshot_options'])
    expect(callsOf(queries[0], 'insert')[0][0]).toMatchObject({ method: 'manual' })
    expect(callsOf(queries[1], 'insert')[0][0]).toEqual([
      { snapshot_id: 's1', sort_order: 0, name: 'Shared', description: 'Group', price_per_person: 150, travelers: null, price_date: null },
    ])
  })
})

describe('parsePricedFor', () => {
  const NOW = new Date(2026, 10, 2) // 2 Nov 2026

  it('reads travelers and a date later this year', () => {
    expect(parsePricedFor('Priced for 2 travelers, Nov 25', NOW)).toEqual({ travelers: 2, price_date: '2026-11-25' })
    expect(parsePricedFor('Priced for 4 travelers, December 5', NOW)).toEqual({ travelers: 4, price_date: '2026-12-05' })
  })

  it('treats today as this year and an earlier day as next year', () => {
    expect(parsePricedFor('Priced for 2 travelers, Nov 2', NOW).price_date).toBe('2026-11-02')
    expect(parsePricedFor('Priced for 2 travelers, Jan 3', NOW).price_date).toBe('2027-01-03')
  })

  it('uses an explicit year when given', () => {
    expect(parsePricedFor('Priced for 3 travelers, Mar 1, 2028', NOW)).toEqual({ travelers: 3, price_date: '2028-03-01' })
  })

  it('reads a single traveler without a date', () => {
    expect(parsePricedFor('Priced for 1 traveler', NOW)).toEqual({ travelers: 1, price_date: null })
  })

  it('finds the text inside a longer description, ignoring case', () => {
    expect(parsePricedFor('Hotel pickup. priced for 6 Travelers, sep 9', NOW)).toEqual({ travelers: 6, price_date: '2027-09-09' })
  })

  it('leaves both empty when the text is not there', () => {
    expect(parsePricedFor(null, NOW)).toEqual({ travelers: null, price_date: null })
    expect(parsePricedFor('', NOW)).toEqual({ travelers: null, price_date: null })
    expect(parsePricedFor('Pickup included', NOW)).toEqual({ travelers: null, price_date: null })
  })

  it('keeps travelers but leaves the date empty when the date is unreadable', () => {
    expect(parsePricedFor('Priced for 2 travelers, Smarch 4', NOW)).toEqual({ travelers: 2, price_date: null })
    expect(parsePricedFor('Priced for 2 travelers, Feb 30', NOW)).toEqual({ travelers: 2, price_date: null })
  })

  it('optionRows maps every option, in order', () => {
    expect(optionRows('S9', [{ name: 'A', description: 'Priced for 2 travelers, Nov 26', price: 10 }], NOW)).toEqual([
      { snapshot_id: 'S9', sort_order: 0, name: 'A', description: 'Priced for 2 travelers, Nov 26', price_per_person: 10, travelers: 2, price_date: '2026-11-26' },
    ])
  })
})
