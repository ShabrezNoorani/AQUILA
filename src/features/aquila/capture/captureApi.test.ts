import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsOf, createFakeSupabase, type Query, type Result } from '../test/fakeSupabase'
import { supabase } from '../../../lib/supabase'
import { emptySnapshotForm } from '../mapping'
import { saveAssistedSnapshot } from './captureApi'

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
    expect(queries.map((q) => q.table)).toEqual(['mt_snapshots'])
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
