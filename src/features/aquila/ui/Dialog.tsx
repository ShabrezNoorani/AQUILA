// Confirmation dialogs. Every "are you sure?" in AQUILA uses these.
// The dialog is drawn over the page but stays in the same place in the DOM as the thing it
// confirms, so its errors are found next to that item.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { buttonClass, dangerSolidClass } from './buttonStyles'

type DialogProps = {
  /** Accessible name, e.g. "Confirm delete review". */
  label: string
  /** Short bold line at the top. */
  title?: ReactNode
  children: ReactNode
  /** Buttons, right-aligned at the bottom. */
  actions: ReactNode
  /** Called on Escape or a click on the backdrop. Omit to make the dialog ignore both. */
  onClose?: () => void
}

/** A modal box over a dimmed page. */
export function Dialog({ label, title, children, actions, onClose }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Move focus into the dialog, on the last button (Cancel), the safe choice.
    const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('button')
    buttons?.[buttons.length - 1]?.focus()
  }, [])

  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-[1px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={panel} role="alertdialog" aria-modal="true" aria-label={label}
        className="w-full max-w-md space-y-4 rounded-card border border-line bg-surface p-6 shadow-2xl shadow-ink/15">
        {title && <p className="text-base font-semibold text-ink">{title}</p>}
        <div className="space-y-2 text-sm text-ink-3">{children}</div>
        <div className="flex flex-wrap justify-end gap-2">{actions}</div>
      </div>
    </div>
  )
}

type ConfirmProps = {
  /** Accessible name, e.g. "Confirm delete review". */
  label: string
  title?: ReactNode
  message: ReactNode
  confirmLabel: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}

/** "Are you sure?" for a delete. Nothing happens until the confirm button is clicked. */
export function ConfirmDialog({ label, title, message, confirmLabel, onConfirm, onCancel }: ConfirmProps) {
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
    <Dialog label={label} title={title} onClose={busy ? undefined : onCancel}
      actions={(
        <>
          <button type="button" onClick={confirm} disabled={busy} className={dangerSolidClass('md')}>
            {busy ? 'Deleting…' : confirmLabel}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className={buttonClass('secondary', 'md')}>
            Cancel
          </button>
        </>
      )}>
      <p className="text-ink">{message}</p>
      {error && <p role="alert" className="text-sm text-negative-deep">Could not delete: {error}</p>}
    </Dialog>
  )
}
