// Saves snapshots, assisted and manual alike, through the mt_save_snapshot database function,
// which writes the snapshot and its option rows in one transaction.

import { saveSnapshotRpc } from '../api'
import { snapshotFormToRow, type SnapshotField, type SnapshotForm } from '../mapping'
import type { ProductOption } from '../parse'
import type { SnapshotInsert, SnapshotOptionInsert } from '../types'
import { computeStatus, type CaptureStatus } from './viatorParser'

export type AssistedSnapshotInsert = Omit<SnapshotInsert, 'method' | 'status'> & {
  method: 'assisted'
  status: CaptureStatus
  raw_html: string
  raw_text: string
}

export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; errors: Partial<Record<SnapshotField, string>> }

export function assistedRow(
  listingId: string,
  form: SnapshotForm,
  rawHtml: string,
  rawText: string,
): { ok: true; row: AssistedSnapshotInsert } | { ok: false; errors: Partial<Record<SnapshotField, string>> } {
  const mapped = snapshotFormToRow(listingId, form)
  if (!mapped.ok) return mapped
  return {
    ok: true,
    row: {
      ...mapped.row,
      method: 'assisted',
      status: computeStatus(form),
      raw_html: rawHtml,
      raw_text: rawText,
    },
  }
}

export async function saveAssistedSnapshot(
  listingId: string,
  form: SnapshotForm,
  rawHtml: string,
  rawText: string,
  now: Date = new Date(),
): Promise<SaveResult> {
  const built = assistedRow(listingId, form, rawHtml, rawText)
  if (!built.ok) return built
  const id = await saveSnapshotWithOptions(built.row, now)
  return { ok: true, id }
}

/**
 * The one path that creates a snapshot, used by both the import page and the manual form.
 * Makes a single mt_save_snapshot call: p_snapshot is the row without its options, p_options
 * is one row per option. The database saves both or neither. Returns the new snapshot id.
 */
export async function saveSnapshotWithOptions<Row extends SnapshotInsert | AssistedSnapshotInsert>(
  row: Row,
  now: Date = new Date(),
): Promise<string> {
  const { options, ...snapshot } = row
  // Every option needs a name; one without fails the whole save before anything is sent.
  const unnamed = options.findIndex((o) => !o.name?.trim())
  if (unnamed >= 0) throw new Error(`Option ${unnamed + 1} has no name, so nothing was saved.`)
  return saveSnapshotRpc(snapshot, optionRows(options, now))
}

// ---------- options ----------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Reads "Priced for N travelers, DATE" from an option description.
 * DATE is like "Nov 25", "November 25" or "Nov 25, 2026". Without a year, the next
 * Nov 25 on or after `now` is used, since listed prices are for upcoming dates.
 * Anything missing or unreadable comes back as null.
 */
export function parsePricedFor(
  description: string | null | undefined,
  now: Date = new Date(),
): { travelers: number | null; price_date: string | null } {
  const empty = { travelers: null, price_date: null }
  if (!description) return empty
  const m = description.match(/priced\s+for\s+(\d+)\s+travell?ers?\b(?:\s*,\s*([A-Za-z]+)\.?\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?)?/i)
  if (!m) return empty
  const travelers = Number(m[1])
  if (!m[2]) return { travelers, price_date: null }
  const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
  const day = Number(m[3])
  if (month < 0) return { travelers, price_date: null }
  const valid = (y: number) => {
    const d = new Date(Date.UTC(y, month, day))
    return d.getUTCMonth() === month && d.getUTCDate() === day
  }
  let year: number
  if (m[4]) {
    year = Number(m[4])
  } else {
    year = now.getFullYear()
    const today = Date.UTC(year, now.getMonth(), now.getDate())
    if (!valid(year) || Date.UTC(year, month, day) < today) year += 1
  }
  if (!valid(year)) return { travelers, price_date: null }
  return { travelers, price_date: `${year}-${pad(month + 1)}-${pad(day)}` }
}

/** One option row for mt_save_snapshot. The database fills in snapshot_id. */
export type OptionRow = Omit<SnapshotOptionInsert, 'snapshot_id'>

/**
 * One option row per option, in order (sort_order 0, 1, 2, …), with travelers and
 * price date read from the description.
 */
export function optionRows(options: ProductOption[], now: Date = new Date()): OptionRow[] {
  return options.map((o, i) => ({
    sort_order: i,
    name: o.name,
    description: o.description,
    price_per_person: o.price,
    ...parsePricedFor(o.description, now),
  }))
}
