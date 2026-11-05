import type { ProductOption } from './parse'

export const LISTING_SOURCES = ['viator', 'tripadvisor', 'getyourguide', 'manual'] as const
export type ListingSource = (typeof LISTING_SOURCES)[number]

/** How each source is shown in dropdowns. The stored value stays lowercase. */
export const SOURCE_LABELS: Record<ListingSource, string> = {
  viator: 'Viator',
  tripadvisor: 'TripAdvisor',
  getyourguide: 'GetYourGuide',
  manual: 'Manual',
}

/** Columns written when creating a row in mt_listings. */
export type ListingInsert = {
  name: string
  is_own: boolean
  source: ListingSource
  url: string | null
  competitor_name: string | null
  active: boolean
  /** The company this listing belongs to (mt_companies.id), or null when unassigned. */
  company_id?: string | null
}

/** A row read back from mt_listings. */
export type Listing = ListingInsert & {
  id: string
}

// ---------- companies ----------

/** A row read back from mt_companies. */
export type Company = {
  id: string
  name: string
  /** True for our own company (OWN); false for a competitor. */
  is_own: boolean
  owner_id?: string | null
  created_at?: string
}

/** Columns written when creating a row in mt_companies. id, owner_id and created_at are set by the database. */
export type CompanyInsert = Pick<Company, 'name' | 'is_own'>

/** A company with how many listings belong to it. */
export type CompanyWithCount = Company & { listing_count: number }

/** Columns written when creating a row in mt_snapshots. */
export type SnapshotInsert = {
  listing_id: string
  method: 'manual'
  status: 'complete' | 'partial'
  title: string | null
  overview: string | null
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

/** Fields of mt_listings that the "Edit listing" form may change. */
export type ListingUpdate = Pick<ListingInsert, 'name' | 'is_own' | 'source' | 'url' | 'competitor_name' | 'active' | 'company_id'>

/**
 * Fields of mt_snapshots that editing may change. listing_id, method, raw_html and raw_text are
 * never sent, so an assisted snapshot stays assisted and keeps its saved page.
 */
export type SnapshotUpdate = Omit<SnapshotInsert, 'listing_id' | 'method'>

/** Columns written when creating a row in mt_reviews. id and created_at are set by the database. */
export type ReviewInsert = {
  listing_id: string
  star_rating: number
  review_text: string
  review_date: string | null
  source: 'manual'
}

/** Fields of mt_reviews that editing may change. */
export type ReviewUpdate = Pick<ReviewInsert, 'star_rating' | 'review_text' | 'review_date'>

/** A row read back from mt_reviews. */
export type Review = Omit<ReviewInsert, 'source'> & {
  id: string
  source?: string
  created_at?: string
}

// ---------- tags ----------

/**
 * A tag's kind, for example "type" or "place". Kinds are free text chosen by the owner and stored
 * lower-case; no kind or tag name is written in code.
 */
export type TagKind = string

/** A row read back from mt_tags. */
export type Tag = {
  id: string
  kind: TagKind
  name: string
  created_at?: string
}

/** Columns written when creating a row in mt_tags. */
export type TagInsert = Pick<Tag, 'name' | 'kind'>

/** A row of mt_listing_tags: links one listing to one tag. */
export type ListingTag = {
  listing_id: string
  tag_id: string
}

// ---------- snapshot options ----------

/** Columns written when creating a row in mt_snapshot_options. */
export type SnapshotOptionInsert = {
  snapshot_id: string
  /** The option's position in the snapshot: 0, 1, 2, … */
  sort_order: number
  name: string
  description: string | null
  price_per_person: number | null
  /** From "Priced for N travelers" in the description; null when that text is missing. */
  travelers: number | null
  /** ISO date (YYYY-MM-DD) from "…, Nov 25" in the description; null when missing. */
  price_date: string | null
}

/** A row read back from mt_snapshot_options. */
export type SnapshotOption = SnapshotOptionInsert & {
  id: string
}

// ---------- Ask AI ----------

export type SuggestionStatus = 'ok' | 'error'

/** A row read back from mt_suggestions: one question asked of Ask AI, and its answer. */
export type Suggestion = {
  id: string
  created_at: string
  question: string
  /** The chosen place and type tags, together. */
  tag_ids: string[] | null
  listing_ids: string[] | null
  snapshot_ids: string[] | null
  model: string
  /** Empty when the AI call failed. */
  answer: string | null
  status: SuggestionStatus
}
