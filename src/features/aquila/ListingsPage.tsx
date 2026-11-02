import { useEffect, useMemo, useState } from 'react'
import { fetchAllListingTags, fetchListings, fetchTags } from './api'
import { hrefFor } from './router'
import { filterListings, tagsByListing, tagsOfKind, type ListingFilters } from './tags/tagMapping'
import { TagChips } from './tags/TagPicker'
import type { Listing, ListingTag, Tag } from './types'
import { Badge, Button, ButtonLink, Card, EmptyState, FormError, Page, Table, THead, Td, Th, Tr, inputClass } from './ui'

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
    <Page title="Listings"
      actions={(
        <>
          <ButtonLink href={hrefFor.tags()} variant="secondary">Tags</ButtonLink>
          <ButtonLink href={hrefFor.newListing()} variant="primary">New listing</ButtonLink>
        </>
      )}>
      {tagError && <FormError>Could not load tags: {tagError}</FormError>}
      {error && <FormError>Could not load listings: {error}</FormError>}
      {!error && !listings && <p className="text-sm text-ink-3">Loading…</p>}
      {listings && listings.length === 0 && (
        <EmptyState title="No listings yet." description="Add your own listing or a competitor’s to start tracking it." />
      )}

      {listings && listings.length > 0 && (
        <Card padded={false} className="flex flex-wrap items-end gap-4 px-6 py-4">
          <div className="w-48 space-y-1.5">
            <label htmlFor="filter-type" className="block text-xs font-medium text-ink-3">Type</label>
            <select id="filter-type" value={filters.typeId} className={inputClass}
              onChange={(e) => setFilters((f) => ({ ...f, typeId: e.target.value }))}>
              <option value="">All types</option>
              {tagsOfKind(tags, 'type').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="w-48 space-y-1.5">
            <label htmlFor="filter-place" className="block text-xs font-medium text-ink-3">Place</label>
            <select id="filter-place" value={filters.placeId} className={inputClass}
              onChange={(e) => setFilters((f) => ({ ...f, placeId: e.target.value }))}>
              <option value="">All places</option>
              {tagsOfKind(tags, 'place').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {filtering && (
            <Button variant="ghost" onClick={() => setFilters({ typeId: '', placeId: '' })}>
              Clear filters
            </Button>
          )}
          {shown && (
            <p className="ml-auto self-center text-sm text-ink-3">
              {shown.length} of {listings.length}
            </p>
          )}
        </Card>
      )}

      {shown && listings && listings.length > 0 && shown.length === 0 && (
        <EmptyState compact title="No listings match these filters." />
      )}

      {shown && shown.length > 0 && (
        <Table>
          <THead>
            <tr>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Source</Th>
              <Th>Status</Th>
              <Th>Tags</Th>
            </tr>
          </THead>
          <tbody>
            {shown.map((l) => (
              <Tr key={l.id}>
                <Td>
                  <a href={hrefFor.listing(l.id)} className="font-medium text-ink hover:text-accent hover:underline">{l.name}</a>
                </Td>
                <Td className="text-ink-3">{l.is_own ? 'Own' : 'Competitor'}</Td>
                <Td className="text-ink-3">{l.source}</Td>
                <Td><Badge tone={l.active ? 'positive' : 'neutral'}>{l.active ? 'Active' : 'Inactive'}</Badge></Td>
                <Td><TagChips tags={tagMap.get(l.id) ?? []} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Page>
  )
}
