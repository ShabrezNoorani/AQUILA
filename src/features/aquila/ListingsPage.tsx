import { useEffect, useMemo, useState } from 'react'
import { fetchAllListingTags, fetchListings, fetchTags } from './api'
import { inputClass } from './fields'
import { hrefFor } from './router'
import { filterListings, tagsByListing, tagsOfKind, type ListingFilters } from './tags/tagMapping'
import { TagChips } from './tags/TagPicker'
import type { Listing, ListingTag, Tag } from './types'

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tags, setTags] = useState<Tag[]>([])
  const [links, setLinks] = useState<ListingTag[]>([])
  const [tagError, setTagError] = useState<string | null>(null)
  const [filters, setFilters] = useState<ListingFilters>({ typeId: '', placeId: '' })

  useEffect(() => {
    let live = true
    fetchListings()
      .then((rows) => live && setListings(rows))
      .catch((e: Error) => live && setError(e.message))
    // Tags load separately so listings still show if tags fail.
    Promise.all([fetchTags(), fetchAllListingTags()])
      .then(([t, l]) => {
        if (!live) return
        setTags(t)
        setLinks(l)
      })
      .catch((e: Error) => live && setTagError(e.message))
    return () => {
      live = false
    }
  }, [])

  const tagMap = useMemo(() => tagsByListing(links, tags), [links, tags])
  const shown = listings ? filterListings(listings, tagMap, filters) : null
  const filtering = filters.typeId !== '' || filters.placeId !== ''

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Listings</h1>
        <div className="flex items-center gap-3">
          <a href={hrefFor.tags()} className="underline">Tags</a>
          <a href={hrefFor.newListing()} className="rounded bg-white px-3 py-2 font-semibold text-slate-900">
            New listing
          </a>
        </div>
      </div>

      {tagError && <p role="alert" className="text-red-400">Could not load tags: {tagError}</p>}
      {listings && listings.length > 0 && (
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label htmlFor="filter-type" className="block text-sm font-medium">Type</label>
            <select id="filter-type" value={filters.typeId} className={inputClass}
              onChange={(e) => setFilters((f) => ({ ...f, typeId: e.target.value }))}>
              <option value="">All types</option>
              {tagsOfKind(tags, 'type').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="filter-place" className="block text-sm font-medium">Place</label>
            <select id="filter-place" value={filters.placeId} className={inputClass}
              onChange={(e) => setFilters((f) => ({ ...f, placeId: e.target.value }))}>
              <option value="">All places</option>
              {tagsOfKind(tags, 'place').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {filtering && (
            <button type="button" onClick={() => setFilters({ typeId: '', placeId: '' })}
              className="rounded border border-slate-500 px-3 py-2 text-sm">
              Clear filters
            </button>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-red-400">Could not load listings: {error}</p>}
      {!error && !listings && <p>Loading…</p>}
      {listings && listings.length === 0 && <p className="text-slate-400">No listings yet.</p>}

      {shown && listings && listings.length > 0 && shown.length === 0 && (
        <p className="text-slate-400">No listings match these filters.</p>
      )}

      {shown && shown.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="py-2">Name</th>
              <th>Type</th>
              <th>Source</th>
              <th>Status</th>
              <th>Tags</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.id} className="border-t border-slate-700">
                <td className="py-2">
                  <a href={hrefFor.listing(l.id)} className="underline">{l.name}</a>
                </td>
                <td>{l.is_own ? 'Own' : 'Competitor'}</td>
                <td>{l.source}</td>
                <td>{l.active ? 'Active' : 'Inactive'}</td>
                <td><TagChips tags={tagMap.get(l.id) ?? []} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
