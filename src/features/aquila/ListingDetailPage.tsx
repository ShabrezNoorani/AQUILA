import { useEffect, useState } from 'react'
import { countSnapshots, deleteListing, fetchListing } from './api'
import { hrefFor, navigate } from './router'
import SnapshotForm from './SnapshotForm'
import SnapshotList from './SnapshotList'
import type { Listing } from './types'

export default function ListingDetailPage({ id }: { id: string }) {
  const [listing, setListing] = useState<Listing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [confirmCount, setConfirmCount] = useState<number | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function askToDelete() {
    setDeleteError(null)
    setDeleteBusy(true)
    try {
      setConfirmCount(await countSnapshots(id))
    } catch (e) {
      setDeleteError((e as Error).message)
    } finally {
      setDeleteBusy(false)
    }
  }

  async function confirmDelete() {
    setDeleteError(null)
    setDeleteBusy(true)
    try {
      await deleteListing(id)
      navigate(hrefFor.listings())
    } catch (e) {
      setDeleteError((e as Error).message)
      setDeleteBusy(false)
    }
  }

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
            <a href={hrefFor.importPage(listing.id)} className="block text-sm underline">Import from page</a>
          </header>
          <div className="space-y-2">
            {confirmCount === null ? (
              <button type="button" onClick={askToDelete} disabled={deleteBusy}
                className="rounded border border-red-500 px-3 py-2 text-sm text-red-400 disabled:opacity-50">
                Delete listing
              </button>
            ) : (
              <div role="alertdialog" aria-label="Confirm delete" className="space-y-2 rounded border border-red-500 p-4">
                <p>
                  Delete “{listing.name}”? This will also delete {confirmCount}{' '}
                  {confirmCount === 1 ? 'snapshot' : 'snapshots'}. This can’t be undone.
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={confirmDelete} disabled={deleteBusy}
                    className="rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {deleteBusy ? 'Deleting…' : 'Yes, delete listing'}
                  </button>
                  <button type="button" onClick={() => setConfirmCount(null)} disabled={deleteBusy}
                    className="rounded border border-slate-500 px-3 py-2 text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {deleteError && <p role="alert" className="text-sm text-red-400">Could not delete: {deleteError}</p>}
          </div>
          <SnapshotForm listingId={listing.id} onSaved={() => setRefreshKey((k) => k + 1)} />
          <SnapshotList listingId={listing.id} refreshKey={refreshKey} />
        </>
      )}
    </section>
  )
}
