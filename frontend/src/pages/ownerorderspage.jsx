import { useState } from "react";
import api from "../api";

export default function OwnerOrdersPage({
  orders,
  setOrders,
  onRefresh,
  setNotice,
  money,
}) {
  const [orderForm, setOrderForm] = useState({
    customer_name: "",
    phone: "",
    address: "",
    summary: "",
    total_amount: "",
    status: "Confirmed",
  });

  const [orderError, setOrderError] = useState("");
  const [saving, setSaving] = useState(false);

  function updateOrderForm(e) {
    const { name, value } = e.target;
    setOrderForm((prev) => ({ ...prev, [name]: value }));
  }

  async function submitOrderForm(e) {
    e.preventDefault();
    setOrderError("");
    setSaving(true);

    try {
      const payload = {
        ...orderForm,
        total_amount: Number(orderForm.total_amount || 0),
      };

      const { data } = await api.post("/owner/orders", payload);

      // Add new order on top without refetch
      setOrders((prev) => [data, ...prev]);

      setOrderForm({
        customer_name: "",
        phone: "",
        address: "",
        summary: "",
        total_amount: "",
        status: "Confirmed",
      });

      setNotice?.({ type: "success", text: "Order added to history." });
    } catch (error) {
      setOrderError(error.response?.data?.error || "Could not save order.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dashboard-panel">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div>
          <h2 className="mb-1">Order history</h2>
          <p className="mb-0 text-secondary">
            Confirmed/completed sales and manually added orders.
          </p>
        </div>

        <button className="btn btn-outline-dark rounded-pill" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      <hr />

      <h5 className="mb-3">Add manual order</h5>
      <form onSubmit={submitOrderForm} className="mb-4">
        <div className="row">
          <div className="col-md-4">
            <label className="form-label">Customer name *</label>
            <input
              className="form-control mb-3"
              name="customer_name"
              value={orderForm.customer_name}
              onChange={updateOrderForm}
              required
              maxLength={120}
            />
          </div>

          <div className="col-md-4">
            <label className="form-label">Phone *</label>
            <input
              className="form-control mb-3"
              name="phone"
              value={orderForm.phone}
              onChange={updateOrderForm}
              required
              maxLength={30}
            />
          </div>

          <div className="col-md-4">
            <label className="form-label">Total amount (₹) *</label>
            <input
              type="number"
              min="0"
              className="form-control mb-3"
              name="total_amount"
              value={orderForm.total_amount}
              onChange={updateOrderForm}
              required
            />
          </div>
        </div>

        <label className="form-label">Address</label>
        <input
          className="form-control mb-3"
          name="address"
          value={orderForm.address}
          onChange={updateOrderForm}
          maxLength={300}
        />

        <label className="form-label">
          Summary (e.g. 2x Black Frame, 1x Lenses)
        </label>
        <input
          className="form-control mb-3"
          name="summary"
          value={orderForm.summary}
          onChange={updateOrderForm}
          maxLength={300}
        />

        <label className="form-label">Status</label>
        <select
          className="form-select mb-2"
          name="status"
          value={orderForm.status}
          onChange={updateOrderForm}
        >
          <option value="Confirmed">Confirmed</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        {orderError && <div className="text-danger mb-2">{orderError}</div>}

        <button className="btn btn-dark rounded-pill px-4" disabled={saving}>
          {saving ? "Saving…" : "Add order"}
        </button>
      </form>

      <h5 className="mb-3">All orders</h5>

      {orders.length === 0 ? (
        <div className="empty-state">No orders yet.</div>
      ) : (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Summary</th>
                <th>Total (₹)</th>
                <th>Status</th>
                <th>Request #</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{new Date(o.created_at).toLocaleString()}</td>
                  <td>{o.customer_name}</td>
                  <td>{o.phone}</td>
                  <td>{o.summary}</td>
                  <td>{money(o.total_amount)}</td>
                  <td>{o.status}</td>
                  <td>{o.request_id || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}