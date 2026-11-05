// Pure helpers for tags: name and kind rules, grouping by kind, and filtering listings by tags.
// No tag names or kinds are written here; every name and kind comes from mt_tags.

import type { Listing, ListingTag, Tag, TagKind } from '../types'

/** Trims a tag name and collapses inner runs of spaces. */
export function normaliseTagName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/** Trims a kind, collapses inner spaces and lower-cases it, so "Place " and "place" are one kind. */
export function normaliseKind(kind: string): string {
  return normaliseTagName(kind).toLocaleLowerCase()
}

/** A kind as a heading: "place" → "Place". */
export function kindLabel(kind: string): string {
  const k = normaliseKind(kind)
  return k ? k[0].toLocaleUpperCase() + k.slice(1) : k
}

/** Key used to compare names, ignoring capitalisation. */
const nameKey = (name: string) => normaliseTagName(name).toLocaleLowerCase()

/**
 * The existing tag of the same kind whose name matches, ignoring capitalisation and extra spaces
 * in both. A tag of another kind is never returned.
 */
export function findTagByName(tags: Tag[], kind: TagKind, name: string): Tag | undefined {
  const key = nameKey(name)
  const k = normaliseKind(kind)
  return tags.find((t) => normaliseKind(t.kind) === k && nameKey(t.name) === key)
}

/** Any non-blank text is a valid kind. */
export const isTagKind = (v: unknown): v is TagKind => typeof v === 'string' && normaliseKind(v) !== ''

/** Checks a new tag before it is written. Returns the cleaned row or an error message. */
export function tagFormToRow(name: string, kind: string):
  | { ok: true; row: { name: string; kind: TagKind } }
  | { ok: false; error: string } {
  const clean = normaliseTagName(name)
  if (!clean) return { ok: false, error: 'Tag name is required' }
  if (!isTagKind(kind)) return { ok: false, error: 'Tag kind is required' }
  return { ok: true, row: { name: clean, kind: normaliseKind(kind) } }
}

/** Every kind in use, cleaned, A to Z. */
export function kindsOf(tags: Tag[]): TagKind[] {
  return [...new Set(tags.map((t) => normaliseKind(t.kind)).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

/** Orders tags by kind (A to Z), then by name. */
export const byKindThenName = (a: Tag, b: Tag) =>
  normaliseKind(a.kind).localeCompare(normaliseKind(b.kind)) || a.name.localeCompare(b.name)

/** Tags of one kind, sorted by name. */
export function tagsOfKind(tags: Tag[], kind: TagKind): Tag[] {
  const k = normaliseKind(kind)
  return tags.filter((t) => normaliseKind(t.kind) === k).sort((a, b) => a.name.localeCompare(b.name))
}

/** Tags grouped by kind: one group per kind (A to Z), each sorted by name. */
export function groupByKind(tags: Tag[]): { kind: TagKind; tags: Tag[] }[] {
  return kindsOf(tags).map((kind) => ({ kind, tags: tagsOfKind(tags, kind) }))
}

/** Adds a tag to a list unless a tag with that id is already there. */
export const withTag = (tags: Tag[], tag: Tag): Tag[] => (tags.some((t) => t.id === tag.id) ? tags : [...tags, tag])

/** Groups mt_listing_tags rows into listing id → its tags, dropping links to unknown tags. */
export function tagsByListing(links: ListingTag[], tags: Tag[]): Map<string, Tag[]> {
  const byId = new Map(tags.map((t) => [t.id, t]))
  const out = new Map<string, Tag[]>()
  for (const link of links) {
    const tag = byId.get(link.tag_id)
    if (!tag) continue
    const list = out.get(link.listing_id) ?? []
    if (!list.some((t) => t.id === tag.id)) list.push(tag)
    out.set(link.listing_id, list)
  }
  for (const list of out.values()) list.sort(byKindThenName)
  return out
}

/** Every tag used by at least one listing, by kind then name. */
export function usedTags(tagMap: Map<string, Tag[]>): Tag[] {
  const used = new Map<string, Tag>()
  for (const list of tagMap.values()) for (const t of list) used.set(t.id, t)
  return [...used.values()].sort(byKindThenName)
}

/** True when the listing carries every selected tag, of any kind (always true when none are selected). */
export function hasAllTags(tagMap: Map<string, Tag[]>, listingId: string, selected: string[]): boolean {
  if (!selected.length) return true
  const ids = new Set((tagMap.get(listingId) ?? []).map((t) => t.id))
  return selected.every((id) => ids.has(id))
}

/** Keeps listings that carry every selected tag. */
export function filterListings(listings: Listing[], tagMap: Map<string, Tag[]>, selected: string[]): Listing[] {
  return listings.filter((l) => hasAllTags(tagMap, l.id, selected))
}
