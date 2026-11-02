// Saves an assisted capture. Writes only to mt_snapshots.

import { supabase } from '../../../lib/supabase'
import { snapshotFormToRow, type SnapshotField, type SnapshotForm } from '../mapping'
import type { SnapshotInsert } from '../types'
import { computeStatus, type CaptureStatus } from './viatorParser'

const SNAPSHOTS = 'mt_snapshots'

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
): Promise<SaveResult> {
  const built = assistedRow(listingId, form, rawHtml, rawText)
  if (!built.ok) return built
  const { data, error } = await supabase.from(SNAPSHOTS).insert(built.row).select('id').single()
  if (error) throw new Error(error.message)
  return { ok: true, id: (data as { id: string }).id }
}
