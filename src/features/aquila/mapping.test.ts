import { describe, expect, it } from 'vitest'
import {
  emptyListingForm,
  emptySnapshotForm,
  listingFormToRow,
  snapshotFormToRow,
  type ListingForm,
  type SnapshotForm,
} from './mapping'

describe('listingFormToRow', () => {
  it('maps a full form to a mt_listings row', () => {
    const form: ListingForm = {
      name: '  Desert Safari  ',
      is_own: false,
      source: 'viator',
      url: ' https://www.viator.com/tours/x ',
      competitor_name: ' Rival Tours ',
    }
    expect(listingFormToRow(form)).toEqual({
      ok: true,
      row: {
        name: 'Desert Safari',
        is_own: false,
        source: 'viator',
        url: 'https://www.viator.com/tours/x',
        competitor_name: 'Rival Tours',
        active: true,
      },
    })
  })

  it('uses the exact mt_listings column names', () => {
    const r = listingFormToRow({ ...emptyListingForm(), name: 'X' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(Object.keys(r.row).sort()).toEqual(
        ['active', 'competitor_name', 'is_own', 'name', 'source', 'url'],
      )
    }
  })

  it('turns blank optional fields into null', () => {
    const r = listingFormToRow({ ...emptyListingForm(), name: 'Our tour', is_own: true })
    expect(r).toEqual({
      ok: true,
      row: {
        name: 'Our tour',
        is_own: true,
        source: 'manual',
        url: null,
        competitor_name: null,
        active: true,
      },
    })
  })

  it('rejects an empty name', () => {
    const r = listingFormToRow({ ...emptyListingForm(), name: '   ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.name).toMatch(/required/i)
  })

  it('rejects an unknown source', () => {
    const r = listingFormToRow({
      ...emptyListingForm(),
      name: 'X',
      source: 'expedia' as ListingForm['source'],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.source).toBeDefined()
  })

  it('rejects a url that is not http(s)', () => {
    const r = listingFormToRow({ ...emptyListingForm(), name: 'X', url: 'not a url' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.url).toBeDefined()
  })
})

describe('snapshotFormToRow', () => {
  const full: SnapshotForm = {
    title: ' Red Dunes Safari ',
    overview: '  First paragraph.\nSecond paragraph.  ',
    duration: '6 hours',
    languages: 'English, Arabic',
    group_type: 'Shared',
    highlights: 'Dune bashing\nSunset photos\n',
    inclusions: 'Pickup, dinner',
    exclusions: 'Drinks',
    why_this: 'Best value',
    itinerary: '15:00 Pickup\n16:30 Dunes\n19:00 Dinner',
    options: 'Shared | Group car | 150\nPrivate | Own car | 600',
    rating: '4.8',
    review_count: '2,301',
    urgency_text: 'Likely to sell out',
  }

  it('maps a full form to a mt_snapshots row with method manual and a computed status of complete', () => {
    expect(snapshotFormToRow('listing-1', full)).toEqual({
      ok: true,
      row: {
        listing_id: 'listing-1',
        method: 'manual',
        status: 'complete',
        title: 'Red Dunes Safari',
        overview: 'First paragraph.\nSecond paragraph.',
        duration: '6 hours',
        languages: ['English', 'Arabic'],
        group_type: 'Shared',
        highlights: ['Dune bashing', 'Sunset photos'],
        inclusions: 'Pickup, dinner',
        exclusions: 'Drinks',
        why_this: 'Best value',
        itinerary: ['15:00 Pickup', '16:30 Dunes', '19:00 Dinner'],
        options: [
          { name: 'Shared', description: 'Group car', price: 150 },
          { name: 'Private', description: 'Own car', price: 600 },
        ],
        rating: 4.8,
        review_count: 2301,
        urgency_text: 'Likely to sell out',
      },
    })
  })

  it('never sends a timestamp; the database sets captured_at', () => {
    const r = snapshotFormToRow('listing-1', full)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.row).not.toHaveProperty('captured_at')
      expect(Object.keys(r.row).sort()).toEqual([
        'duration', 'exclusions', 'group_type', 'highlights', 'inclusions', 'itinerary',
        'languages', 'listing_id', 'method', 'options', 'overview', 'rating', 'review_count', 'status',
        'title', 'urgency_text', 'why_this',
      ])
    }
  })

  it('maps an empty form to nulls and empty arrays, with status partial', () => {
    expect(snapshotFormToRow('listing-1', emptySnapshotForm())).toEqual({
      ok: true,
      row: {
        listing_id: 'listing-1',
        method: 'manual',
        status: 'partial',
        title: null,
        overview: null,
        duration: null,
        languages: [],
        group_type: null,
        highlights: [],
        inclusions: null,
        exclusions: null,
        why_this: null,
        itinerary: [],
        options: [],
        rating: null,
        review_count: null,
        urgency_text: null,
      },
    })
  })

  it('maps overview to the overview column, keeping line breaks inside it', () => {
    const r = snapshotFormToRow('listing-1', { ...emptySnapshotForm(), overview: '\nPara one.\nPara two.\n' })
    expect(r.ok && r.row.overview).toBe('Para one.\nPara two.')
  })

  it('saves a manual form whose options have no prices as partial', () => {
    const r = snapshotFormToRow('listing-1', { ...full, options: 'Shared | Group car\nPrivate' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.row.options).toEqual([
        { name: 'Shared', description: 'Group car', price: null },
        { name: 'Private', description: null, price: null },
      ])
      expect(r.row.status).toBe('partial')
    }
  })

  it('saves a manual form as partial when a core field is blank, even with prices', () => {
    const r = snapshotFormToRow('listing-1', { ...full, duration: '  ' })
    expect(r.ok && r.row.status).toBe('partial')
  })

  it('collects errors for bad options, rating and review count', () => {
    const r = snapshotFormToRow('listing-1', {
      ...emptySnapshotForm(),
      options: 'Shared | Group | free',
      rating: '9',
      review_count: 'lots',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.options).toMatch(/price/i)
      expect(r.errors.rating).toBeDefined()
      expect(r.errors.review_count).toBeDefined()
    }
  })

  it('requires a listing id', () => {
    expect(snapshotFormToRow('', full).ok).toBe(false)
  })
})
