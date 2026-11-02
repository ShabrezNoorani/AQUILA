import { useEffect, useState } from 'react'
import { deleteSnapshot, fetchSnapshots, updateSnapshot } from './api'
import { snapshotRowToForm } from './mapping'
import SnapshotForm from './SnapshotForm'
import type { Snapshot, SnapshotInsert, SnapshotUpdate } from './types'
import { Badge, Button, ConfirmDialog, EmptyState, FormError } from './ui'

/** The editable part of a mapped row: listing_id and method are never changed by an edit. */
function toUpdate(row: SnapshotInsert): SnapshotUpdate {
  const patch: Partial<SnapshotInsert> = { ...row }
  delete patch.listing_id
  delete patch.method
  return patch as SnapshotUpdate
}

function formatDate(iso?: string) {
  if (!iso) return 'Unknown date'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function List({ label, items }: { label: string; items?: string[] | null }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</dt>
      <dd className="mt-1 text-ink"><ul className="list-disc space-y-0.5 pl-5">{items.map((s, i) => <li key={i}>{s}</li>)}</ul></dd>
    </div>
  )
}

function Text({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</dt>
      <dd className="mt-1 whitespace-pre-line text-ink">{value}</dd>
    </div>
  )
}

/** Snapshots for one listing, newest first. Bump refreshKey to reload. */
export default function SnapshotList({ listingId, refreshKey }: { listingId: string; refreshKey: number }) {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const reload = () => setReloadKey((k) => k + 1)

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
  }, [listingId, refreshKey, reloadKey])

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-ink">Snapshots</h2>
      {error && <FormError>Could not load snapshots: {error}</FormError>}
      {!error && !snapshots && <p className="text-sm text-ink-3">Loading…</p>}
      {snapshots && snapshots.length === 0 && (
        <EmptyState compact title="No snapshots yet." description="Add one by hand above, or import it from the listing’s page." />
      )}
      {snapshots?.map((s) => (
        <article key={s.id} className="space-y-4 rounded-card border border-line bg-surface p-6 shadow-sm shadow-ink/5">
          {editingId === s.id ? (
            <div className="space-y-3">
              <SnapshotForm listingId={listingId} initial={snapshotRowToForm(s)}
                onSubmitRow={(row) => updateSnapshot(s.id, toUpdate(row))}
                onSaved={() => {
                  setEditingId(null)
                  reload()
                }} />
              <Button size="sm" onClick={() => setEditingId(null)}>Cancel editing</Button>
            </div>
          ) : (
          <>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h3 className="font-semibold text-ink">{s.title || '(untitled)'}</h3>
              <p className="text-xs text-ink-3">{formatDate(s.captured_at)}</p>
            </div>
            <div className="flex gap-1.5">
              <Badge>{s.method ?? '—'}</Badge>
              <Badge tone={s.status === 'complete' ? 'positive' : 'neutral'}>{s.status ?? '—'}</Badge>
            </div>
          </header>
          <dl className="grid gap-x-6 gap-y-4 border-t border-line pt-4 text-sm md:grid-cols-2">
            <Text label="Overview" value={s.overview} />
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
          {confirmingId === s.id ? (
            <ConfirmDialog label="Confirm delete snapshot"
              message={`Delete the snapshot “${s.title || '(untitled)'}”? This can’t be undone.`}
              confirmLabel="Yes, delete snapshot"
              onCancel={() => setConfirmingId(null)}
              onConfirm={async () => {
                await deleteSnapshot(s.id)
                setConfirmingId(null)
                reload()
              }} />
          ) : (
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button size="sm" onClick={() => { setConfirmingId(null); setEditingId(s.id) }}>Edit</Button>
              <Button size="sm" variant="danger" onClick={() => { setEditingId(null); setConfirmingId(s.id) }}>Delete</Button>
            </div>
          )}
          </>
          )}
        </article>
      ))}
    </section>
  )
}
