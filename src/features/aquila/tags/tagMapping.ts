// Pure helpers for tags: name rules, the listing tag rule, and listing filters.
// No tag names are written here; every name comes from mt_tags.

import { TAG_KINDS, type Listing, type ListingTag, type Tag, type TagKind } from '../types'

/** Trims a tag name and collapses inner runs of spaces. */
export function normaliseTagName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/** Key used to compare names, ignoring capitalisation. */
const nameKey = (name: string) => normaliseTagName(name).toLocaleLowerCase()

/**
 * The existing tag of the same kind whose name matches, ignoring capitalisation and outer spaces.
 * A tag of the other kind is never returned.
 */
export function findTagByName(tags: Tag[], kind: TagKind, name: string): Tag | undefined {
  const key = nameKey(name)
  return tags.find((t) => t.kind === kind && nameKey(t.name) === key)
}

export const isTagKind = (v: unknown): v is TagKind => TAG_KINDS.includes(v as TagKind)

/** Checks a new tag before it is written. Returns the cleaned row or an error message. */
export function tagFormToRow(name: string, kind: string):
  | { ok: true; row: { name: string; kind: TagKind } }
  | { ok: false; error: string } {
  const clean = normaliseTagName(name)
  if (!clean) return { ok: false, error: 'Tag name is required' }
  if (!isTagKind(kind)) return { ok: false, error: 'Tag kind must be type or place' }
  return { ok: true, row: { name: clean, kind } }
}

/**
 * A listing needs exactly one type tag and at least one place tag.
 * Returns an error message, or null when the selection is valid.
 * Ids that are not in `tags` are ignored.
 */
export function listingTagsError(selectedIds: string[], tags: Tag[]): string | null {
  const byId = new Map(tags.map((t) => [t.id, t]))
  const chosen = [...new Set(selectedIds)].map((id) => byId.get(id)).filter((t): t is Tag => !!t)
  const types = chosen.filter((t) => t.kind === 'type').length
  const places = chosen.filter((t) => t.kind === 'place').length
  const problems: string[] = []
  if (types === 0) problems.push('choose one type tag')
  if (types > 1) problems.push(`choose only one type tag (${types} chosen)`)
  if (places === 0) problems.push('choose at least one place tag')
  if (!problems.length) return null
  const text = problems.join(' and ')
  return text[0].toUpperCase() + text.slice(1)
}

/** Tags of one kind, sorted by name. */
export function tagsOfKind(tags: Tag[], kind: TagKind): Tag[] {
  return tags.filter((t) => t.kind === kind).sort((a, b) => a.name.localeCompare(b.name))
}

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
  for (const list of out.values()) {
    list.sort((a, b) => TAG_KINDS.indexOf(a.kind) - TAG_KINDS.indexOf(b.kind) || a.name.localeCompare(b.name))
  }
  return out
}

export type ListingFilters = { typeId: string; placeId: string }

/** Keeps listings that carry the chosen type tag and the chosen place tag. '' means any. */
export function filterListings(
  listings: Listing[],
  tagMap: Map<string, Tag[]>,
  { typeId, placeId }: ListingFilters,
): Listing[] {
  return listings.filter((l) => {
    const ids = new Set((tagMap.get(l.id) ?? []).map((t) => t.id))
    return (!typeId || ids.has(typeId)) && (!placeId || ids.has(placeId))
  })
}
