import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabase'
import { emptySnapshotForm } from '../mapping'
import type { SnapshotInsert } from '../types'
import { optionRows, parsePricedFor, saveAssistedSnapshot, saveSnapshotWithOptions } from './captureApi'

vi.mock('../../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

type RpcArgs = { p_snapshot: Record<string, unknown>; p_options: Record<string, unknown>[] }
let rpcResult: { data: unknown; error: { message: string } | null }

beforeEach(() => {
  rpcResult = { data: 's1', error: null }
  vi.mocked(supabase.rpc).mockReset()
  vi.mocked(supabase.rpc).mockImplementation((() => Promise.resolve(rpcResult)) as never)
  // No table is ever written directly; any .from() call fails the test.
  vi.mocked(supabase.from).mockImplementation(((t: string) => {
    throw new Error(`unexpected direct table access: ${t}`)
  }) as never)
})

const rpcCalls = () => vi.mocked(supabase.rpc).mock.calls as unknown as [string, RpcArgs][]
const sent = () => rpcCalls()[0][1]

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
  it('makes one mt_save_snapshot call with the snapshot (without options) and its option rows', async () => {
    const r = await saveAssistedSnapshot('L1', form, '<html>raw</html>', 'raw text')
    expect(r).toEqual({ ok: true, id: 's1' })
    expect(rpcCalls()).toHaveLength(1)
    expect(rpcCalls()[0][0]).toBe('mt_save_snapshot')
    expect(Object.keys(sent()).sort()).toEqual(['p_options', 'p_snapshot'])
    expect(sent().p_snapshot).toMatchObject({
      listing_id: 'L1',
      method: 'assisted',
      status: 'complete',
      raw_html: '<html>raw</html>',
      raw_text: 'raw text',
      title: 'Notre-Dame tour',
      languages: ['English', 'French'],
      rating: 4.5,
      review_count: 283,
    })
    expect(Object.keys(sent().p_snapshot).sort()).toEqual([
      'duration', 'exclusions', 'group_type', 'highlights', 'inclusions', 'itinerary',
      'languages', 'listing_id', 'method', 'overview', 'rating', 'raw_html', 'raw_text',
      'review_count', 'status', 'title', 'urgency_text', 'why_this',
    ])
    expect(sent().p_options).toEqual([
      { sort_order: 0, name: 'Shared', description: null, price_per_person: null, travelers: null, price_date: null },
      { sort_order: 1, name: 'Private', description: null, price_per_person: 300, travelers: null, price_date: null },
    ])
  })

  it('saves status partial when a core field is blank', async () => {
    await saveAssistedSnapshot('L1', { ...form, duration: '' }, '<html></html>', '')
    expect(sent().p_snapshot).toMatchObject({ status: 'partial', method: 'assisted' })
  })

  it('returns field errors and calls nothing when the form is invalid', async () => {
    const r = await saveAssistedSnapshot('L1', { ...form, rating: '11' }, '<html></html>', '')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.rating).toBeDefined()
    expect(rpcCalls()).toHaveLength(0)
  })

  it('throws the database error when the call fails, and makes no other call', async () => {
    rpcResult = { data: null, error: { message: 'new row violates check constraint' } }
    await expect(saveAssistedSnapshot('L1', form, '<html></html>', '')).rejects.toThrow('violates check constraint')
    expect(rpcCalls()).toHaveLength(1)
  })

  it('accepts the new id as a bare value, a row, or a one-row array', async () => {
    for (const data of ['s1', { id: 's1' }, [{ id: 's1' }]]) {
      rpcResult = { data, error: null }
      expect(await saveAssistedSnapshot('L1', form, '', '')).toEqual({ ok: true, id: 's1' })
    }
  })

  it('throws when the call returns no id', async () => {
    rpcResult = { data: null, error: null }
    await expect(saveAssistedSnapshot('L1', form, '', '')).rejects.toThrow(/did not return the new snapshot id/)
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

  it('sends one option row per option, in order, with travelers and date read from the description', async () => {
    await saveAssistedSnapshot('L1', priced, '<html></html>', '', NOW)
    expect(sent().p_options).toEqual([
      { sort_order: 0, name: 'Shared', description: 'Priced for 2 travelers, Nov 25', price_per_person: 95.2, travelers: 2, price_date: '2026-11-25' },
      { sort_order: 1, name: 'Private', description: 'Priced for 1 traveler', price_per_person: 147.98, travelers: 1, price_date: null },
      { sort_order: 2, name: 'Sunset', description: 'Pickup included', price_per_person: 80, travelers: null, price_date: null },
      { sort_order: 3, name: 'Walk-in', description: null, price_per_person: null, travelers: null, price_date: null },
    ])
    expect(sent().p_snapshot).not.toHaveProperty('options')
  })

  it('sends an empty option list when there are no options', async () => {
    await saveAssistedSnapshot('L1', { ...form, options: '' }, '<html></html>', '')
    expect(sent().p_options).toEqual([])
  })
})

describe('saveSnapshotWithOptions', () => {
  const manual: SnapshotInsert = {
    listing_id: 'L1', method: 'manual', status: 'partial', title: null, overview: null, duration: null,
    languages: [], group_type: null, highlights: [], inclusions: null, exclusions: null, why_this: null,
    itinerary: [], rating: null, review_count: null, urgency_text: null,
    options: [{ name: 'Shared', description: 'Group', price: 150 }],
  }

  it('saves a manual snapshot through the same single call', async () => {
    expect(await saveSnapshotWithOptions(manual)).toBe('s1')
    expect(rpcCalls()).toHaveLength(1)
    expect(sent().p_snapshot).toMatchObject({ method: 'manual', listing_id: 'L1' })
    expect(sent().p_options).toEqual([
      { sort_order: 0, name: 'Shared', description: 'Group', price_per_person: 150, travelers: null, price_date: null },
    ])
  })

  it('an option without a name fails the whole save and sends nothing', async () => {
    const bad = { ...manual, options: [manual.options[0], { name: '  ', description: null, price: 99 }] }
    await expect(saveSnapshotWithOptions(bad)).rejects.toThrow(/option 2 has no name, so nothing was saved/i)
    expect(rpcCalls()).toHaveLength(0)
  })

  it('a database rejection of any option fails the whole save', async () => {
    rpcResult = { data: null, error: { message: 'null value in column "name" of relation "mt_snapshot_options"' } }
    await expect(saveSnapshotWithOptions(manual)).rejects.toThrow(/mt_snapshot_options/)
    expect(rpcCalls()).toHaveLength(1)
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
    expect(optionRows([{ name: 'A', description: 'Priced for 2 travelers, Nov 26', price: 10 }], NOW)).toEqual([
      { sort_order: 0, name: 'A', description: 'Priced for 2 travelers, Nov 26', price_per_person: 10, travelers: 2, price_date: '2026-11-26' },
    ])
  })
})
