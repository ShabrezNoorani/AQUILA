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
  it('sends places then types together in tag_ids, with the trimmed question', () => {
    expect(buildAskRequest({ question: '  Who is cheapest? ', placeIds: ['P2', 'P1'], typeIds: ['T1'] }, tags)).toEqual({
      ok: true,
      request: { question: 'Who is cheapest?', tag_ids: ['P2', 'P1', 'T1'] },
    })
  })

  it('allows no type tags', () => {
    const r = buildAskRequest({ question: 'Q', placeIds: ['P1'], typeIds: [] }, tags)
    expect(r).toEqual({ ok: true, request: { question: 'Q', tag_ids: ['P1'] } })
  })

  it('needs at least one place tag and a question', () => {
    const r = buildAskRequest({ question: '  ', placeIds: [], typeIds: ['T1'] }, tags)
    expect(r).toEqual({ ok: false, errors: { places: 'Choose at least one place tag.', question: 'Type a question.' } })
  })

  it('drops duplicates, unknown ids, and ids of the wrong kind', () => {
    const r = buildAskRequest({ question: 'Q', placeIds: ['P1', 'P1', 'T1', 'gone'], typeIds: ['P2', 'T1'] }, tags)
    expect(r).toEqual({ ok: true, request: { question: 'Q', tag_ids: ['P1', 'T1'] } })
  })

  it('does not count a type tag as a place', () => {
    expect(buildAskRequest({ question: 'Q', placeIds: ['T1'], typeIds: [] }, tags).ok).toBe(false)
  })

  it('rejects an over-long question', () => {
    const r = buildAskRequest({ question: 'x'.repeat(2001), placeIds: ['P1'], typeIds: [] }, tags)
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
  it('splits stored tag_ids back into place and type names, counting deleted tags', () => {
    expect(describeTags(['P1', 'T1', 'gone'], tags)).toEqual({ places: ['Dubai'], types: ['Safari'], missing: 1 })
    expect(describeTags(null, tags)).toEqual({ places: [], types: [], missing: 0 })
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
