import { describe, expect, it } from 'vitest'
import type { Listing, Tag } from '../types'
import {
  filterListings,
  findTagByName,
  groupByKind,
  hasAllTags,
  kindLabel,
  kindsOf,
  normaliseKind,
  normaliseTagName,
  tagFormToRow,
  tagsByListing,
  tagsOfKind,
  usedTags,
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

  it('rejects a blank name or kind, and accepts any other kind, stored lower-case', () => {
    expect(tagFormToRow('   ', 'type')).toEqual({ ok: false, error: 'Tag name is required' })
    expect(tagFormToRow('Desert', '  ')).toEqual({ ok: false, error: 'Tag kind is required' })
    expect(tagFormToRow('  Desert ', 'place')).toEqual({ ok: true, row: { name: 'Desert', kind: 'place' } })
    expect(tagFormToRow('Croissant', '  Food ')).toEqual({ ok: true, row: { name: 'Croissant', kind: 'food' } })
  })

  it('treats kinds the same whatever their capitals and spaces', () => {
    expect(normaliseKind('  Place  ')).toBe('place')
    expect(findTagByName(tags, 'PLACE', 'dubai')?.id).toBe('P1')
    expect(kindLabel('food')).toBe('Food')
  })
})

describe('kinds', () => {
  const mixed: Tag[] = [
    ...tags,
    { id: 'F1', name: 'Bakery', kind: 'food' },
    { id: 'I1', name: 'Interior', kind: 'type' },
  ]

  it('lists every kind in use, A to Z, with nothing hard-coded', () => {
    expect(kindsOf(mixed)).toEqual(['food', 'place', 'type'])
  })

  it('groups tags by kind, each group sorted by name', () => {
    expect(groupByKind(mixed).map((g) => [g.kind, g.tags.map((t) => t.name)])).toEqual([
      ['food', ['Bakery']],
      ['place', ['Abu Dhabi', 'Dubai']],
      ['type', ['Cruise', 'Interior', 'Safari']],
    ])
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

  it('groups tags by listing, by kind (A to Z) then name, and drops links to unknown tags', () => {
    expect(map.get('L2')!.map((t) => t.name)).toEqual(['Abu Dhabi', 'Dubai', 'Cruise'])
    expect(map.has('L3')).toBe(false)
  })

  it('sorts tags of one kind by name', () => {
    expect(tagsOfKind(tags, 'place').map((t) => t.name)).toEqual(['Abu Dhabi', 'Dubai'])
  })

  it('lists only the tags some listing uses', () => {
    expect(usedTags(map).map((t) => t.id)).toEqual(['P2', 'P1', 'T2', 'T1'])
    expect(usedTags(tagsByListing([{ listing_id: 'L1', tag_id: 'P1' }], tags)).map((t) => t.id)).toEqual(['P1'])
  })

  it('filters by any selected tags, of any kinds: a listing must carry all of them', () => {
    const ids = (selected: string[]) => filterListings(listings, map, selected).map((l) => l.id)
    expect(ids([])).toEqual(['L1', 'L2', 'L3'])
    expect(ids(['T1'])).toEqual(['L1'])
    expect(ids(['P1'])).toEqual(['L1', 'L2'])
    expect(ids(['T2', 'P2'])).toEqual(['L2'])
    expect(ids(['P1', 'P2'])).toEqual(['L2'])
    expect(ids(['T1', 'P2'])).toEqual([])
    expect(hasAllTags(map, 'L3', ['T1'])).toBe(false)
  })
})
