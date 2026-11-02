import type { ProductOption } from './parse'

export const LISTING_SOURCES = ['viator', 'tripadvisor', 'manual'] as const
export type ListingSource = (typeof LISTING_SOURCES)[number]

/** Columns written when creating a row in mt_listings. */
export type ListingInsert = {
  name: string
  is_own: boolean
  source: ListingSource
  url: string | null
  competitor_name: string | null
  active: boolean
}

/** A row read back from mt_listings. */
export type Listing = ListingInsert & {
  id: string
}

/** Columns written when creating a row in mt_snapshots. */
export type SnapshotInsert = {
  listing_id: string
  method: 'manual'
  status: 'complete'
  title: string | null
  duration: string | null
  languages: string[]
  group_type: string | null
  highlights: string[]
  inclusions: string | null
  exclusions: string | null
  why_this: string | null
  itinerary: string[]
  options: ProductOption[]
  rating: number | null
  review_count: number | null
  urgency_text: string | null
}

/** A row read back from mt_snapshots. Fields are loose because older rows may differ. */
export type Snapshot = Partial<Omit<SnapshotInsert, 'method' | 'status'>> & {
  id: string
  listing_id: string
  method?: string
  status?: string
  captured_at?: string
}
