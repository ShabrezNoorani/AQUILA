import { useEffect, useMemo, useState } from 'react'
import { fetchAllListingTags, fetchCompanies, fetchListings, fetchTags } from './api'
import { hrefFor } from './router'
import TagFilter from './tags/TagFilter'
import { filterListings, tagsByListing, usedTags } from './tags/tagMapping'
import { TagChips } from './tags/TagPicker'
import type { Company, Listing, ListingTag, Tag } from './types'
import { Badge, ButtonLink, Card, EmptyState, FormError, Page, Table, THead, Td, Th, Tr } from './ui'

/** The listing's company with an OWN badge when it is ours, or "Unassigned". */
function CompanyCell({ company, loading }: { company?: Company; loading: boolean }) {
  if (loading) return <span className="text-ink-3">…</span>
  if (!company) return <span className="text-ink-3">Unassigned</span>
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <a href={hrefFor.company(company.id)} className="text-ink-2 hover:text-accent">{company.name}</a>
      {company.is_own && <Badge tone="strong">OWN</Badge>}
    </span>
  )
}

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tags, setTags] = useState<Tag[]>([])
  const [links, setLinks] = useState<ListingTag[]>([])
  const [tagError, setTagError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [companies, setCompanies] = useState<Company[] | null>(null)
  const [companyError, setCompanyError] = useState<string | null>(null)

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
    // Companies load separately too, so listings still show if they fail.
    fetchCompanies()
      .then((rows) => live && setCompanies(rows))
      .catch((e: Error) => live && setCompanyError(e.message))
    return () => {
      live = false
    }
  }, [])

  const tagMap = useMemo(() => tagsByListing(links, tags), [links, tags])
  const filterTags = useMemo(() => usedTags(tagMap), [tagMap])
  const active = selected.filter((id) => filterTags.some((t) => t.id === id))
  const shown = listings ? filterListings(listings, tagMap, active) : null
  const companyById = new Map((companies ?? []).map((c) => [c.id, c]))

  return (
    <Page title="Listings"
      actions={(
        <>
          <ButtonLink href={hrefFor.tags()} variant="secondary">Tags</ButtonLink>
          <ButtonLink href={hrefFor.newListing()} variant="primary">New listing</ButtonLink>
        </>
      )}>
      {tagError && <FormError>Could not load tags: {tagError}</FormError>}
      {companyError && <FormError>Could not load companies: {companyError}</FormError>}
      {error && <FormError>Could not load listings: {error}</FormError>}
      {!error && !listings && <p className="text-sm text-ink-3">Loading…</p>}
      {listings && listings.length === 0 && (
        <EmptyState title="No listings yet." description="Add a listing for your own company or any other company to start tracking it." />
      )}

      {listings && listings.length > 0 && filterTags.length > 0 && (
        <Card padded={false} className="space-y-2 px-6 py-4">
          <TagFilter tags={filterTags} selected={active} onChange={setSelected} />
          {shown && <p className="text-sm text-ink-3">{shown.length} of {listings.length}</p>}
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
              <Th>Company</Th>
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
                <Td><CompanyCell company={l.company_id ? companyById.get(l.company_id) : undefined} loading={!companies && !companyError} /></Td>
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
