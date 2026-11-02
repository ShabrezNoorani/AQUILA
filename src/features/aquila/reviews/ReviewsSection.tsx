import { useEffect, useState } from 'react'
import { createReview, deleteReview, fetchReviews, updateReview } from '../api'
import type { Review } from '../types'
import { Button, Card, ConfirmDialog, EmptyState, FormError } from '../ui'
import ReviewForm from './ReviewForm'
import { newReviewRow, reviewToForm } from './reviewMapping'

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n))

/** Reviews for one listing, newest first, with add, edit and delete. */
export default function ReviewsSection({ listingId }: { listingId: string }) {
  const [reviews, setReviews] = useState<Review[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetchReviews(listingId)
      .then((rows) => {
        if (!live) return
        setError(null)
        setReviews(rows)
      })
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [listingId, reloadKey])

  const reload = () => setReloadKey((k) => k + 1)

  return (
    <section aria-label="Reviews" className="space-y-4">
      <h2 className="text-base font-semibold text-ink">Reviews</h2>

      <Card>
        <ReviewForm idPrefix="new-review" heading="Add review" submitLabel="Add review"
          onSubmit={async (value) => {
            await createReview(newReviewRow(listingId, value))
            reload()
          }} />
      </Card>

      {error && <FormError>Could not load reviews: {error}</FormError>}
      {!error && !reviews && <p className="text-sm text-ink-3">Loading…</p>}
      {reviews && reviews.length === 0 && <EmptyState compact title="No reviews yet." />}

      {reviews?.map((r) => (
        <article key={r.id} aria-label={`Review ${r.star_rating} stars`}
          className="space-y-3 rounded-card border border-line bg-surface p-6 shadow-sm shadow-ink/5">
          {editingId === r.id ? (
            <ReviewForm idPrefix={`edit-review-${r.id}`} heading="Edit review" submitLabel="Save review"
              initial={reviewToForm(r)}
              onCancel={() => setEditingId(null)}
              onSubmit={async (value) => {
                await updateReview(r.id, value)
                setEditingId(null)
                reload()
              }} />
          ) : (
            <>
              <p className="flex items-center gap-2">
                <span aria-label={`${r.star_rating} out of 5 stars`} className="tracking-wider text-accent">{stars(r.star_rating)}</span>
                {r.review_date && <span className="text-xs text-ink-3">{r.review_date}</span>}
              </p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{r.review_text}</p>
              {confirmingId === r.id ? (
                <ConfirmDialog label="Confirm delete review" message="Delete this review? This can’t be undone."
                  confirmLabel="Yes, delete review"
                  onCancel={() => setConfirmingId(null)}
                  onConfirm={async () => {
                    await deleteReview(r.id)
                    setConfirmingId(null)
                    reload()
                  }} />
              ) : (
                <div className="flex justify-end gap-2">
                  <Button size="sm" onClick={() => { setConfirmingId(null); setEditingId(r.id) }}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => { setEditingId(null); setConfirmingId(r.id) }}>Delete</Button>
                </div>
              )}
            </>
          )}
        </article>
      ))}
    </section>
  )
}
