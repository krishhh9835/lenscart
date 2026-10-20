import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import api from "../api";

function Stars({ rating }) {
  const full = Math.round(rating);
  return (
    <span title={`${rating}/5`}>
      {"★★★★★".slice(0, full)}
      {"☆☆☆☆☆".slice(0, 5 - full)}
    </span>
  );
}

export default function ProductQuickViewModal({
  open,
  product,
  fallbackImage,
  onClose,
  money,
  cartQty,
  updateQty,
  setNotice,
}) {
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const [reviews, setReviews] = useState([]);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    customer_name: "",
    rating: 5,
    comment: "",
  });

  const activeImage = images[activeIndex] || fallbackImage;

  useEffect(() => {
    if (!open || !product) return;

    setLoading(true);
    setImages([fallbackImage].filter(Boolean));
    setActiveIndex(0);
    setReviews([]);

    Promise.all([
      api.get(`/products/${product.id}`),
      api.get(`/products/${product.id}/reviews`),
    ])
      .then(([detailRes, reviewRes]) => {
        const imgs = detailRes.data.images || [];
        setImages(imgs.length ? imgs : [fallbackImage].filter(Boolean));
        setReviews(reviewRes.data || []);
      })
      .catch(() => {
        // ignore
      })
      .finally(() => setLoading(false));
  }, [open, product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitReview(e) {
    e.preventDefault();
    if (!product) return;

    setReviewBusy(true);
    try {
      await api.post(`/products/${product.id}/reviews`, reviewForm);
      setNotice?.({ type: "success", text: "Review submitted." });
      setReviewForm({ customer_name: "", rating: 5, comment: "" });

      // reload reviews
      const { data } = await api.get(`/products/${product.id}/reviews`);
      setReviews(data);
    } catch (err) {
      setNotice?.({
        type: "danger",
        text: err.response?.data?.error || "Could not submit review.",
      });
    } finally {
      setReviewBusy(false);
    }
  }

  if (!open || !product) return null;

  return (
    <div
      className="modal-backdrop-custom"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="request-modal product-quick-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <span className="eyebrow">PRODUCT DETAILS</span>
            <h2 className="mb-1">{product.name}</h2>
            <div className="text-secondary small">
              {product.brand || "LENS & LOOK"} • {product.category}
            </div>
          </div>
          <button className="icon-close" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        <div className="row g-3">
          <div className="col-lg-6">
            <div className="product-main-image">
              <img src={activeImage} alt={product.name} />
            </div>

            <div className="thumb-row mt-2">
              {images.map((url, idx) => (
                <img
                  key={url + idx}
                  src={url}
                  alt={`thumb-${idx}`}
                  className={`thumb ${idx === activeIndex ? "active" : ""}`}
                  onClick={() => setActiveIndex(idx)}
                />
              ))}
            </div>

            {loading && <div className="text-secondary mt-2">Loading details…</div>}
          </div>

          <div className="col-lg-6">
            <div className="mb-2">
              <strong className="fs-4">{money(product.price)}</strong>
              <div className="text-secondary small">
                {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
              </div>
            </div>

            <p className="text-secondary">
              {product.description || "No description available."}
            </p>

            <div className="d-flex align-items-center gap-2 mb-3">
              <button
                className="btn btn-dark rounded-pill"
                disabled={product.stock < 1}
                onClick={() => {
                  updateQty(product.id, (cartQty || 0) + 1);
                  setNotice?.({ type: "success", text: `${product.name} added.` });
                }}
              >
                Add to request
              </button>

              {cartQty > 0 && (
                <div className="quantity-control ms-2">
                  <button onClick={() => updateQty(product.id, cartQty - 1)}>−</button>
                  <span>{cartQty} selected</span>
                  <button
                    onClick={() => updateQty(product.id, cartQty + 1)}
                    disabled={cartQty >= product.stock}
                  >
                    +
                  </button>
                </div>
              )}
            </div>

            <hr />

            <h5 className="mb-2">Reviews ({reviews.length})</h5>

            {reviews.length === 0 ? (
              <div className="text-secondary">No reviews yet.</div>
            ) : (
              <div style={{ maxHeight: 180, overflow: "auto" }} className="mb-3">
                {reviews.map((r) => (
                  <div key={r.id} className="border rounded p-2 mb-2">
                    <div className="d-flex justify-content-between">
                      <strong>{r.customer_name}</strong>
                      <span><Stars rating={r.rating} /></span>
                    </div>
                    {r.comment && <div className="text-secondary">{r.comment}</div>}
                    <div className="small text-secondary">
                      {new Date(r.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h6 className="mb-2">Add your review</h6>
            <form onSubmit={submitReview}>
              <label className="form-label">Name</label>
              <input
                className="form-control mb-2"
                value={reviewForm.customer_name}
                onChange={(e) =>
                  setReviewForm((f) => ({ ...f, customer_name: e.target.value }))
                }
                required
                maxLength={120}
              />

              <label className="form-label">Rating</label>
              <select
                className="form-select mb-2"
                value={reviewForm.rating}
                onChange={(e) =>
                  setReviewForm((f) => ({ ...f, rating: Number(e.target.value) }))
                }
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>

              <label className="form-label">Comment</label>
              <textarea
                className="form-control mb-2"
                rows="2"
                maxLength={500}
                value={reviewForm.comment}
                onChange={(e) =>
                  setReviewForm((f) => ({ ...f, comment: e.target.value }))
                }
              />

              <button className="btn btn-outline-dark rounded-pill" disabled={reviewBusy}>
                {reviewBusy ? "Submitting…" : "Submit review"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}