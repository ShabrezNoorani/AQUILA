import { describe, expect, it } from 'vitest'
import type { Listing, Tag } from '../types'
import { buildAskRequest, describeTags, listingNames, parseAskResponse } from './askMapping'
import { hrefFor, parseHash } from '../router'

const tags: Tag[] = [
  { id: 'P1', kind: 'place', name: 'Dubai' },
  { id: 'P2', kind: 'place', name: 'Abu Dhabi' },
  { id: 'T1', kind: 'type', name: 'Safari' },
]

describe('buildAskRequest: chosen tags to the request', () => {
  const mixed: Tag[] = [...tags, { id: 'F1', kind: 'food', name: 'Bakery' }]

  it('sends tags of any kinds, in the order chosen, with the trimmed question', () => {
    expect(buildAskRequest({ question: '  Who is cheapest? ', tagIds: ['T1', 'F1', 'P1'] }, mixed)).toEqual({
      ok: true,
      request: { question: 'Who is cheapest?', tag_ids: ['T1', 'F1', 'P1'] },
    })
  })

  it('allows no tags at all (every listing is used)', () => {
    expect(buildAskRequest({ question: 'Which competitor tour has the best reviews?', tagIds: [] }, tags)).toEqual({
      ok: true, request: { question: 'Which competitor tour has the best reviews?', tag_ids: [] },
    })
  })

  it('allows only type tags, with no place', () => {
    expect(buildAskRequest({ question: 'Q', tagIds: ['T1'] }, tags)).toEqual({ ok: true, request: { question: 'Q', tag_ids: ['T1'] } })
  })

  it('needs a question', () => {
    expect(buildAskRequest({ question: '  ', tagIds: ['P1'] }, tags)).toEqual({ ok: false, errors: { question: 'Type a question.' } })
  })

  it('drops duplicates and unknown ids', () => {
    const r = buildAskRequest({ question: 'Q', tagIds: ['P1', 'P1', 'gone', 'T1'] }, tags)
    expect(r).toEqual({ ok: true, request: { question: 'Q', tag_ids: ['P1', 'T1'] } })
  })

  it('rejects an over-long question', () => {
    const r = buildAskRequest({ question: 'x'.repeat(2001), tagIds: ['P1'] }, tags)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.question).toMatch(/under 2000/)
  })
})

describe('parseAskResponse', () => {
  it('keeps the fields the page shows and drops malformed sources', () => {
    expect(parseAskResponse({
      suggestion_id: 'S', answer: 'A', model: 'm', listing_ids: ['L1', 5], snapshot_ids: ['N1'],
      sources: [{ listing_id: 'L1', name: 'One', snapshot_id: 'N1', captured_at: '2026-10-30' }, { nope: true }],
      saved: true,
    })).toEqual({
      suggestion_id: 'S', answer: 'A', model: 'm', listing_ids: ['L1'], snapshot_ids: ['N1'],
      sources: [{ listing_id: 'L1', name: 'One', snapshot_id: 'N1', captured_at: '2026-10-30' }], saved: true,
    })
  })

  it('throws when there is no answer', () => {
    expect(() => parseAskResponse({ error: 'x' })).toThrow(/no answer/i)
  })
})

describe('past answer helpers', () => {
  it('groups stored tag_ids back by kind, counting deleted tags', () => {
    const mixed: Tag[] = [...tags, { id: 'F1', kind: 'food', name: 'Bakery' }]
    expect(describeTags(['P1', 'T1', 'F1', 'P2', 'gone'], mixed)).toEqual({
      groups: [
        { kind: 'Food', names: ['Bakery'] },
        { kind: 'Place', names: ['Abu Dhabi', 'Dubai'] },
        { kind: 'Type', names: ['Safari'] },
      ],
      missing: 1,
    })
    expect(describeTags(null, tags)).toEqual({ groups: [], missing: 0 })
  })

  it('names used listings and marks deleted ones', () => {
    const listings = [{ id: 'L1', name: 'One' }] as Listing[]
    expect(listingNames(['L1', 'L9'], listings)).toEqual([
      { id: 'L1', name: 'One', exists: true },
      { id: 'L9', name: '(deleted listing)', exists: false },
    ])
  })
})

describe('#/ask route', () => {
  it('maps to the ask page', () => {
    expect(parseHash('#/ask')).toEqual({ name: 'ask' })
    expect(parseHash(hrefFor.ask())).toEqual({ name: 'ask' })
  })
})
