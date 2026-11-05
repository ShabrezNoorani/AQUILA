import { describe, expect, it } from 'vitest'
import type { Listing, Tag } from '../types'
import {
  filterListings,
  findTagByName,
  listingTagsError,
  normaliseTagName,
  tagFormToRow,
  tagsByListing,
  tagsOfKind,
  withTag,
} from './tagMapping'

const tags: Tag[] = [
  { id: 'T1', name: 'Safari', kind: 'type' },
  { id: 'T2', name: 'Cruise', kind: 'type' },
  { id: 'P1', name: 'Dubai', kind: 'place' },
  { id: 'P2', name: 'Abu Dhabi', kind: 'place' },
]

describe('tag names', () => {
  it('trims names and collapses inner spaces', () => {
    expect(normaliseTagName('  Abu   Dhabi \n')).toBe('Abu Dhabi')
  })

  it('finds an existing tag of the same kind, ignoring capitalisation and outer spaces', () => {
    expect(findTagByName(tags, 'place', '  dUBAI ')?.id).toBe('P1')
    expect(findTagByName(tags, 'place', 'abu dhabi')?.id).toBe('P2')
    expect(findTagByName(tags, 'type', 'SAFARI')?.id).toBe('T1')
    expect(findTagByName(tags, 'place', 'Doha')).toBeUndefined()
  })

  it('never matches a tag of the other kind', () => {
    expect(findTagByName(tags, 'type', 'Dubai')).toBeUndefined()
    expect(findTagByName(tags, 'place', 'safari')).toBeUndefined()
  })

  it('picks the tag of the asked kind when both kinds share a name', () => {
    const both: Tag[] = [...tags, { id: 'P9', name: 'Safari', kind: 'place' }]
    expect(findTagByName(both, 'type', 'safari')?.id).toBe('T1')
    expect(findTagByName(both, 'place', 'safari')?.id).toBe('P9')
  })

  it('rejects a blank name and an unknown kind', () => {
    expect(tagFormToRow('   ', 'type')).toEqual({ ok: false, error: 'Tag name is required' })
    expect(tagFormToRow('Desert', 'region').ok).toBe(false)
    expect(tagFormToRow('  Desert ', 'place')).toEqual({ ok: true, row: { name: 'Desert', kind: 'place' } })
  })
})

describe('listingTagsError: at least one type tag and at least one place tag', () => {
  it('accepts one type and one or more places', () => {
    expect(listingTagsError(['T1', 'P1'], tags)).toBeNull()
    expect(listingTagsError(['T1', 'P1', 'P2'], tags)).toBeNull()
  })

  it('rejects no tags at all, naming both problems', () => {
    const e = listingTagsError([], tags)!
    expect(e).toMatch(/one type tag/i)
    expect(e).toMatch(/at least one place tag/i)
  })

  it('rejects a missing type', () => {
    expect(listingTagsError(['P1'], tags)).toMatch(/choose at least one type tag/i)
  })

  it('accepts two type tags (several of the same kind are allowed)', () => {
    expect(listingTagsError(['T1', 'T2', 'P1'], tags)).toBeNull()
    expect(listingTagsError(['T1', 'T2', 'P1', 'P2'], tags)).toBeNull()
  })

  it('rejects a missing place', () => {
    expect(listingTagsError(['T1'], tags)).toMatch(/at least one place tag/i)
  })

  it('ignores unknown ids and counts duplicates once', () => {
    expect(listingTagsError(['T1', 'T1', 'P1', 'ghost'], tags)).toBeNull()
    expect(listingTagsError(['ghost', 'P1'], tags)).toMatch(/one type tag/i)
  })
})

describe('withTag', () => {
  it('adds a new tag once, and leaves the list alone when the id is already there', () => {
    const extra = { id: 'T9', name: 'Food', kind: 'type' as const }
    expect(withTag(tags, extra).map((t) => t.id)).toEqual([...tags.map((t) => t.id), 'T9'])
    expect(withTag(tags, tags[0])).toBe(tags)
  })
})

describe('grouping and filtering', () => {
  const listings = [
    { id: 'L1', name: 'A' },
    { id: 'L2', name: 'B' },
    { id: 'L3', name: 'C' },
  ] as Listing[]
  const links = [
    { listing_id: 'L1', tag_id: 'T1' },
    { listing_id: 'L1', tag_id: 'P1' },
    { listing_id: 'L2', tag_id: 'T2' },
    { listing_id: 'L2', tag_id: 'P1' },
    { listing_id: 'L2', tag_id: 'P2' },
    { listing_id: 'L3', tag_id: 'gone' },
  ]
  const map = tagsByListing(links, tags)

  it('groups tags by listing, types first, and drops links to unknown tags', () => {
    expect(map.get('L2')!.map((t) => t.name)).toEqual(['Cruise', 'Abu Dhabi', 'Dubai'])
    expect(map.has('L3')).toBe(false)
  })

  it('sorts tags of one kind by name', () => {
    expect(tagsOfKind(tags, 'place').map((t) => t.name)).toEqual(['Abu Dhabi', 'Dubai'])
  })

  it('filters by type, by place, and by both', () => {
    const ids = (f: { typeId: string; placeId: string }) => filterListings(listings, map, f).map((l) => l.id)
    expect(ids({ typeId: '', placeId: '' })).toEqual(['L1', 'L2', 'L3'])
    expect(ids({ typeId: 'T1', placeId: '' })).toEqual(['L1'])
    expect(ids({ typeId: '', placeId: 'P1' })).toEqual(['L1', 'L2'])
    expect(ids({ typeId: 'T2', placeId: 'P2' })).toEqual(['L2'])
    expect(ids({ typeId: 'T1', placeId: 'P2' })).toEqual([])
  })
})
