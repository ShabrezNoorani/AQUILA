import { useEffect, useState } from 'react'
import { createReview, deleteReview, fetchReviews, updateReview } from '../api'
import type { Review } from '../types'
import ConfirmDialog from './ConfirmDialog'
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
      <h2 className="text-xl font-semibold">Reviews</h2>

      <ReviewForm idPrefix="new-review" heading="Add review" submitLabel="Add review"
        onSubmit={async (value) => {
          await createReview(newReviewRow(listingId, value))
          reload()
        }} />

      {error && <p role="alert" className="text-red-400">Could not load reviews: {error}</p>}
      {!error && !reviews && <p>Loading…</p>}
      {reviews && reviews.length === 0 && <p className="text-slate-400">No reviews yet.</p>}

      {reviews?.map((r) => (
        <article key={r.id} aria-label={`Review ${r.star_rating} stars`} className="space-y-2 rounded border border-slate-700 p-4">
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
              <p>
                <span aria-label={`${r.star_rating} out of 5 stars`} className="text-amber-300">{stars(r.star_rating)}</span>
                {r.review_date && <span className="ml-2 text-xs text-slate-400">{r.review_date}</span>}
              </p>
              <p className="whitespace-pre-line text-sm">{r.review_text}</p>
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
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setConfirmingId(null); setEditingId(r.id) }}
                    className="rounded border border-slate-500 px-3 py-1 text-sm">
                    Edit
                  </button>
                  <button type="button" onClick={() => { setEditingId(null); setConfirmingId(r.id) }}
                    className="rounded border border-red-500 px-3 py-1 text-sm text-red-400">
                    Delete
                  </button>
                </div>
              )}
            </>
          )}
        </article>
      ))}
    </section>
  )
}
