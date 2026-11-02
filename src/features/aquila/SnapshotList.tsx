import { useEffect, useState } from 'react'
import { fetchSnapshots } from './api'
import type { Snapshot } from './types'

function formatDate(iso?: string) {
  if (!iso) return 'Unknown date'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function List({ label, items }: { label: string; items?: string[] | null }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd><ul className="list-disc pl-5">{items.map((s, i) => <li key={i}>{s}</li>)}</ul></dd>
    </div>
  )
}

function Text({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className="whitespace-pre-line">{value}</dd>
    </div>
  )
}

/** Snapshots for one listing, newest first. Bump refreshKey to reload. */
export default function SnapshotList({ listingId, refreshKey }: { listingId: string; refreshKey: number }) {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetchSnapshots(listingId)
      .then((rows) => {
        if (!live) return
        setError(null)
        setSnapshots(rows)
      })
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [listingId, refreshKey])

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Snapshots</h2>
      {error && <p role="alert" className="text-red-400">Could not load snapshots: {error}</p>}
      {!error && !snapshots && <p>Loading…</p>}
      {snapshots && snapshots.length === 0 && <p className="text-slate-400">No snapshots yet.</p>}
      {snapshots?.map((s) => (
        <article key={s.id} className="rounded border border-slate-700 p-4 space-y-2">
          <header>
            <h3 className="font-semibold">{s.title || '(untitled)'}</h3>
            <p className="text-xs text-slate-400">
              {formatDate(s.captured_at)} · {s.method ?? '—'} · {s.status ?? '—'}
            </p>
          </header>
          <dl className="grid gap-2 text-sm md:grid-cols-2">
            <Text label="Duration" value={s.duration} />
            <Text label="Languages" value={s.languages?.join(', ')} />
            <Text label="Group type" value={s.group_type} />
            <Text label="Rating" value={s.rating} />
            <Text label="Review count" value={s.review_count} />
            <Text label="Urgency" value={s.urgency_text} />
            <List label="Highlights" items={s.highlights} />
            <List label="Itinerary" items={s.itinerary} />
            <Text label="Inclusions" value={s.inclusions} />
            <Text label="Exclusions" value={s.exclusions} />
            <Text label="Why this" value={s.why_this} />
            <List
              label="Options"
              items={s.options?.map((o) =>
                [o.name, o.description, o.price != null ? String(o.price) : null].filter(Boolean).join(' — '),
              )}
            />
          </dl>
        </article>
      ))}
    </section>
  )
}
