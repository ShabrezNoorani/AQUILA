import { useState, type FormEvent } from 'react'
import { Button, FormError, TextField } from '../ui'
import type { ReviewUpdate } from '../types'
import { emptyReviewForm, validateReview, type ReviewErrors, type ReviewForm as Form } from './reviewMapping'

type Props = {
  /** Prefix for field ids, so several forms can be on one page. */
  idPrefix: string
  heading: string
  submitLabel: string
  initial?: Form
  onSubmit: (value: ReviewUpdate) => Promise<void>
  onCancel?: () => void
}

export default function ReviewForm({ idPrefix, heading, submitLabel, initial, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<Form>(() => initial ?? emptyReviewForm())
  const [errors, setErrors] = useState<ReviewErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (key: keyof Form) => (v: string) => setForm((f) => ({ ...f, [key]: v }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaveError(null)
    const checked = validateReview(form)
    if (!checked.ok) {
      setErrors(checked.errors)
      return
    }
    setErrors({})
    setBusy(true)
    try {
      await onSubmit(checked.value)
      if (!initial) setForm(emptyReviewForm())
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label={heading} className="space-y-4">
      <h3 className="text-sm font-semibold text-ink">{heading}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField id={`${idPrefix}-star_rating`} label="Star rating (1–5) *" value={form.star_rating}
          onChange={set('star_rating')} error={errors.star_rating} placeholder="e.g. 4" />
        <TextField id={`${idPrefix}-review_date`} label="Date (optional)" value={form.review_date}
          onChange={set('review_date')} placeholder="As written, e.g. Oct 2026" />
      </div>
      <TextField id={`${idPrefix}-review_text`} label="Review text *" value={form.review_text}
        onChange={set('review_text')} error={errors.review_text} multiline rows={4} />
      {saveError && <FormError>Could not save: {saveError}</FormError>}
      <div className="flex justify-end gap-2">
        {onCancel && <Button onClick={onCancel} disabled={busy}>Cancel</Button>}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
