import { useEffect, useState } from 'react'
import { fetchListing } from './api'
import { hrefFor } from './router'
import SnapshotForm from './SnapshotForm'
import SnapshotList from './SnapshotList'
import type { Listing } from './types'

export default function ListingDetailPage({ id }: { id: string }) {
  const [listing, setListing] = useState<Listing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let live = true
    fetchListing(id)
      .then((row) => live && setListing(row))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [id])

  return (
    <section className="space-y-8">
      <a href={hrefFor.listings()} className="text-sm underline">← All listings</a>
      {error && <p role="alert" className="text-red-400">Could not load listing: {error}</p>}
      {!error && !listing && <p>Loading…</p>}
      {listing && (
        <>
          <header>
            <h1 className="text-2xl font-bold">{listing.name}</h1>
            <p className="text-sm text-slate-400">
              {listing.is_own ? 'Own' : 'Competitor'} · {listing.source} ·{' '}
              {listing.active ? 'Active' : 'Inactive'}
              {listing.competitor_name && <> · {listing.competitor_name}</>}
            </p>
            {listing.url && (
              <a href={listing.url} target="_blank" rel="noreferrer" className="text-sm underline break-all">
                {listing.url}
              </a>
            )}
          </header>
          <SnapshotForm listingId={listing.id} onSaved={() => setRefreshKey((k) => k + 1)} />
          <SnapshotList listingId={listing.id} refreshKey={refreshKey} />
        </>
      )}
    </section>
  )
}
