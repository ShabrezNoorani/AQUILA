// The only data access layer for AQUILA.
// It reads and writes exactly two tables: mt_listings and mt_snapshots.

import { supabase } from '../../lib/supabase'
import type { Listing, ListingInsert, Snapshot, SnapshotInsert } from './types'

const LISTINGS = 'mt_listings'
const SNAPSHOTS = 'mt_snapshots'

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
