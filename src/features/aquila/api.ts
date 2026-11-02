// The only data access layer for AQUILA.
// It reads and writes these tables: mt_listings, mt_snapshots, mt_reviews,
// mt_tags, mt_listing_tags and mt_snapshot_options.

import { supabase } from '../../lib/supabase'
import type {
  Listing,
  ListingInsert,
  ListingUpdate,
  Review,
  ReviewInsert,
  ReviewUpdate,
  Snapshot,
  SnapshotInsert,
  SnapshotOption,
  SnapshotOptionInsert,
  SnapshotUpdate,
  ListingTag,
  Tag,
  TagKind,
} from './types'
import { findTagByName, isTagKind, tagFormToRow } from './tags/tagMapping'

const LISTINGS = 'mt_listings'
const SNAPSHOTS = 'mt_snapshots'
const REVIEWS = 'mt_reviews'
const TAGS = 'mt_tags'
const LISTING_TAGS = 'mt_listing_tags'
const SNAPSHOT_OPTIONS = 'mt_snapshot_options'

/** Deletes exactly one row by id, and fails loudly if nothing was removed. */
async function deleteOne(table: string, id: string, what: string): Promise<void> {
  const { data, error } = await supabase.from(table).delete().eq('id', id).select('id')
  if (error) throw new Error(error.message)
  // Row-level security can turn a delete into a silent no-op, so check something was removed.
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Nothing was deleted. The ${what} may already be gone, or you may not have permission.`)
  }
}

/** Counts a listing's rows in a table without downloading them. */
async function countFor(table: string, listingId: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId)
  if (error) throw new Error(error.message)
  return count ?? 0
}

function unwrap<T>({ data, error }: { data: unknown; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

export async function fetchListings(): Promise<Listing[]> {
  return unwrap<Listing[]>(
    await supabase.from(LISTINGS).select('*').order('name', { ascending: true }),
  ) ?? []
}

export async function fetchListing(id: string): Promise<Listing> {
  return unwrap<Listing>(await supabase.from(LISTINGS).select('*').eq('id', id).single())
}

export async function createListing(row: ListingInsert): Promise<Listing> {
  return unwrap<Listing>(await supabase.from(LISTINGS).insert(row).select().single())
}

export async function updateListing(id: string, patch: ListingUpdate): Promise<Listing> {
  return unwrap<Listing>(await supabase.from(LISTINGS).update(patch).eq('id', id).select().single())
}

/** Deletes one listing. The database removes its snapshots and reviews automatically. */
export async function deleteListing(id: string): Promise<void> {
  await deleteOne(LISTINGS, id, 'listing')
}

/** Counts a listing's snapshots without downloading them. */
export async function countSnapshots(listingId: string): Promise<number> {
  return countFor(SNAPSHOTS, listingId)
}

/** Counts a listing's reviews without downloading them. */
export async function countReviews(listingId: string): Promise<number> {
  return countFor(REVIEWS, listingId)
}

export async function fetchSnapshots(listingId: string): Promise<Snapshot[]> {
  return unwrap<Snapshot[]>(
    await supabase
      .from(SNAPSHOTS)
      .select('*')
      .eq('listing_id', listingId)
      .order('captured_at', { ascending: false }),
  ) ?? []
}

export async function createSnapshot(row: SnapshotInsert): Promise<Snapshot> {
  return unwrap<Snapshot>(await supabase.from(SNAPSHOTS).insert(row).select().single())
}

export async function updateSnapshot(id: string, patch: SnapshotUpdate): Promise<Snapshot> {
  return unwrap<Snapshot>(await supabase.from(SNAPSHOTS).update(patch).eq('id', id).select().single())
}

export async function deleteSnapshot(id: string): Promise<void> {
  await deleteOne(SNAPSHOTS, id, 'snapshot')
}

// ---------- reviews ----------

export async function fetchReviews(listingId: string): Promise<Review[]> {
  return unwrap<Review[]>(
    await supabase
      .from(REVIEWS)
      .select('*')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: false }),
  ) ?? []
}

export async function createReview(row: ReviewInsert): Promise<Review> {
  return unwrap<Review>(await supabase.from(REVIEWS).insert(row).select().single())
}

export async function updateReview(id: string, patch: ReviewUpdate): Promise<Review> {
  return unwrap<Review>(await supabase.from(REVIEWS).update(patch).eq('id', id).select().single())
}

export async function deleteReview(id: string): Promise<void> {
  await deleteOne(REVIEWS, id, 'review')
}

// ---------- tags ----------

/** All tags, sorted by name. Rows with an unknown kind are left out. */
export async function fetchTags(): Promise<Tag[]> {
  const rows = unwrap<Tag[] | null>(
    await supabase.from(TAGS).select('*').order('name', { ascending: true }),
  ) ?? []
  return rows.filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string' && isTagKind(t.kind))
}

/**
 * Creates a tag. The name is trimmed. If a tag of the same kind with the same name already
 * exists (ignoring capitalisation), that tag is returned and nothing is written. A tag of the
 * other kind never counts as a match.
 */
export async function createTag(name: string, kind: TagKind): Promise<{ tag: Tag; existed: boolean }> {
  const checked = tagFormToRow(name, kind)
  if (!checked.ok) throw new Error(checked.error)
  const existing = findTagByName(await fetchTags(), checked.row.kind, checked.row.name)
  if (existing) return { tag: existing, existed: true }
  const tag = unwrap<Tag>(await supabase.from(TAGS).insert(checked.row).select().single())
  return { tag, existed: false }
}

/** How many listings use a tag, without downloading the links. */
export async function countListingsWithTag(tagId: string): Promise<number> {
  const { count, error } = await supabase
    .from(LISTING_TAGS)
    .select('tag_id', { count: 'exact', head: true })
    .eq('tag_id', tagId)
  if (error) throw new Error(error.message)
  return count ?? 0
}

/** Deletes one tag. The database removes its mt_listing_tags links (on delete cascade). */
export async function deleteTag(id: string): Promise<void> {
  await deleteOne(TAGS, id, 'tag')
}

/** Every listing–tag link. Used by the listings page to show and filter tags. */
export async function fetchAllListingTags(): Promise<ListingTag[]> {
  return unwrap<ListingTag[] | null>(await supabase.from(LISTING_TAGS).select('listing_id, tag_id')) ?? []
}

/** The tag ids linked to one listing. */
export async function fetchListingTagIds(listingId: string): Promise<string[]> {
  const rows = unwrap<ListingTag[] | null>(
    await supabase.from(LISTING_TAGS).select('listing_id, tag_id').eq('listing_id', listingId),
  ) ?? []
  return rows.map((r) => r.tag_id)
}

/**
 * Makes a listing's tags exactly `tagIds`. Only the differences are written:
 * new links are added first, then removed links are deleted, so a failure part-way
 * never leaves the listing with fewer tags than before.
 */
export async function setListingTags(listingId: string, tagIds: string[]): Promise<void> {
  const wanted = [...new Set(tagIds)]
  const current = new Set(await fetchListingTagIds(listingId))
  const toAdd = wanted.filter((id) => !current.has(id))
  const toRemove = [...current].filter((id) => !wanted.includes(id))
  if (toAdd.length) {
    unwrap(await supabase.from(LISTING_TAGS).insert(toAdd.map((tag_id) => ({ listing_id: listingId, tag_id }))))
  }
  for (const tagId of toRemove) {
    unwrap(await supabase.from(LISTING_TAGS).delete().eq('listing_id', listingId).eq('tag_id', tagId))
  }
}

/**
 * Creates a listing and links its tags. If linking fails, the new listing is deleted again
 * so a listing is never left without its tags.
 */
export async function createListingWithTags(row: ListingInsert, tagIds: string[]): Promise<Listing> {
  const listing = await createListing(row)
  const links = [...new Set(tagIds)].map((tag_id) => ({ listing_id: listing.id, tag_id }))
  try {
    if (links.length) unwrap(await supabase.from(LISTING_TAGS).insert(links))
  } catch (err) {
    const reason = (err as Error).message
    try {
      await deleteListing(listing.id)
    } catch (undoErr) {
      throw new Error(
        `Could not save the listing's tags (${reason}), and the listing could not be removed either ` +
        `(${(undoErr as Error).message}). Listing “${listing.name}” exists without tags.`,
      )
    }
    throw new Error(`Could not save the listing's tags, so the listing was not created: ${reason}`)
  }
  return listing
}

// ---------- snapshot options ----------

/** Inserts option rows for a snapshot. Does nothing when there are none. */
export async function insertSnapshotOptions(rows: SnapshotOptionInsert[]): Promise<void> {
  if (!rows.length) return
  unwrap(await supabase.from(SNAPSHOT_OPTIONS).insert(rows))
}

/** The option rows saved for one snapshot, in their original order. */
export async function fetchSnapshotOptions(snapshotId: string): Promise<SnapshotOption[]> {
  return unwrap<SnapshotOption[] | null>(
    await supabase
      .from(SNAPSHOT_OPTIONS)
      .select('*')
      .eq('snapshot_id', snapshotId)
      .order('sort_order', { ascending: true }),
  ) ?? []
}
