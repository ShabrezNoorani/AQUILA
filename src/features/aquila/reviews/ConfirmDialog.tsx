import { useState } from 'react'

type Props = {
  /** Accessible name, e.g. "Confirm delete review". */
  label: string
  message: string
  confirmLabel: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}

/** An in-page "are you sure?" box. Nothing happens until the confirm button is clicked. */
export default function ConfirmDialog({ label, message, confirmLabel, onConfirm, onCancel }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setError(null)
    setBusy(true)
    try {
      await onConfirm()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div role="alertdialog" aria-label={label} className="space-y-2 rounded border border-red-500 p-3">
      <p className="text-sm">{message}</p>
      <div className="flex gap-2">
        <button type="button" onClick={confirm} disabled={busy}
          className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? 'Deleting…' : confirmLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}
          className="rounded border border-slate-500 px-3 py-1 text-sm">
          Cancel
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">Could not delete: {error}</p>}
    </div>
  )
}
