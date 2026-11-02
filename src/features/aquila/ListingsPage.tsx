import { useEffect, useState } from 'react'
import { fetchListings } from './api'
import { hrefFor } from './router'
import type { Listing } from './types'

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetchListings()
      .then((rows) => live && setListings(rows))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [])

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Listings</h1>
        <a href={hrefFor.newListing()} className="rounded bg-white px-3 py-2 font-semibold text-slate-900">
          New listing
        </a>
      </div>

      {error && <p role="alert" className="text-red-400">Could not load listings: {error}</p>}
      {!error && !listings && <p>Loading…</p>}
      {listings && listings.length === 0 && <p className="text-slate-400">No listings yet.</p>}

      {listings && listings.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="py-2">Name</th>
              <th>Type</th>
              <th>Source</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((l) => (
              <tr key={l.id} className="border-t border-slate-700">
                <td className="py-2">
                  <a href={hrefFor.listing(l.id)} className="underline">{l.name}</a>
                </td>
                <td>{l.is_own ? 'Own' : 'Competitor'}</td>
                <td>{l.source}</td>
                <td>{l.active ? 'Active' : 'Inactive'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
