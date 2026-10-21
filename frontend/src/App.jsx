import { useEffect, useMemo, useState } from "react";
import ProductQuickViewModal from "./components/ProductQuickViewModal";
import {
  ArrowRight,
  CheckCircle2,
  Glasses,
  Menu,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import api from "./api";

// IMPORTANT:
// This import MUST match your filename exactly (case-sensitive on Vercel/Linux).
// You said you have: src/pages/ownerorderspage.jsx
import OwnerOrdersPage from "./pages/ownerorderspage";

const categories = ["All", "Frames", "Sunglasses", "Lenses", "Accessories"];
const blankProduct = {
  name: "",
  category: "Frames",
  brand: "",
  description: "",
  image_url: "",
  price: "",
  stock: "",
};
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

function productImage(product) {
  if (product.image_url) return product.image_url;
  const colors = {
    Frames: "e9e5df",
    Sunglasses: "d9e3e8",
    Lenses: "e2e9e2",
    Accessories: "eee2d7",
  };
  return `https://placehold.co/700x500/${
    colors[product.category] || "e9e5df"
  }/172554?text=${encodeURIComponent(product.name)}`;
}

export default function App() {

  const SHOP_NAME = import.meta.env.VITE_SHOP_NAME || "चश्मा वाले";
  const SHOP_ADDRESS = import.meta.env.VITE_SHOP_ADDRESS || "";
  const OWNER_EMAIL = import.meta.env.VITE_OWNER_EMAIL || "";
  const SHOP_PHONE = import.meta.env.VITE_SHOP_PHONE || "";

  const mapsLink = SHOP_ADDRESS
  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(SHOP_ADDRESS)}`
  : "";
  const [quickView, setQuickView] = useState({ open: false, product: null, fallbackImage: "" });
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState("shop");
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState({});
  const [showRequest, setShowRequest] = useState(false);
  const [customer, setCustomer] = useState({
    customer_name: "",
    phone: "",
    address: "",
    message: "",
  });
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ownerLoggedIn, setOwnerLoggedIn] = useState(false);
  const [login, setLogin] = useState({ username: "owner", password: "" });
  const [requests, setRequests] = useState([]);
  const [ownerProducts, setOwnerProducts] = useState([]);
  const [ownerTab, setOwnerTab] = useState("requests");
  const [productForm, setProductForm] = useState(blankProduct);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [productImages, setProductImages] = useState([]);
const [uploadFiles, setUploadFiles] = useState([]);
const [uploadVariant, setUploadVariant] = useState("");
const [uploadPrimary, setUploadPrimary] = useState(false);
const [uploading, setUploading] = useState(false);

  // NEW: orders state (history)
  const [orders, setOrders] = useState([]);

async function loadProductImages(productId) {
  try {
    const { data } = await api.get(`/owner/products/${productId}/images`);
    setProductImages(data);
  } catch {
    setProductImages([]);
  }
}

  const loadProducts = async () => {
    try {
      const { data } = await api.get("/products");
      setProducts(data);
    } catch {
      setNotice({
        type: "danger",
        text: "Cannot connect to the backend. Start Flask on port 5000 and refresh this page.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    api
      .get("/owner/me")
      .then(({ data }) => {
        if (data.logged_in) {
          setOwnerLoggedIn(true);
          loadOwnerData();
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

function openQuickView(product) {
  setQuickView({ open: true, product, fallbackImage: productImage(product) });
}
function closeQuickView() {
  setQuickView({ open: false, product: null, fallbackImage: "" });
}
  const filteredProducts = useMemo(
    () =>
      products.filter((p) => {
        const matchesCategory = category === "All" || p.category === category;
        const term = search.toLowerCase();
        return (
          matchesCategory &&
          `${p.name} ${p.brand} ${p.description}`
            .toLowerCase()
            .includes(term)
        );
      }),
    [products, category, search]
  );

  const cartItems = Object.entries(cart).filter(([, qty]) => qty > 0);
  const cartCount = cartItems.reduce((sum, [, qty]) => sum + qty, 0);
  const cartTotal = cartItems.reduce((sum, [id, qty]) => {
    const p = products.find((item) => item.id === Number(id));
    return sum + (p ? p.price * qty : 0);
  }, 0);

  function updateQty(id, qty) {
    const product = products.find((p) => p.id === id);
    const next = Math.max(
      0,
      Math.min(Number(qty) || 0, product?.stock || 0, 99)
    );
    setCart((current) => ({ ...current, [id]: next }));
  }

  async function uploadProductImages(e) {
  e.preventDefault();
  if (!editingId) {
    setNotice({ type: "danger", text: "Please select/edit a product first, then upload images." });
    return;
  }
  if (!uploadFiles || uploadFiles.length === 0) {
    setNotice({ type: "danger", text: "Please choose image files." });
    return;
  }

  setUploading(true);
  try {
    const form = new FormData();
    for (const file of uploadFiles) form.append("files", file);
    if (uploadVariant) form.append("variant", uploadVariant);
    form.append("set_primary", uploadPrimary ? "true" : "false");

    await api.post(`/owner/products/${editingId}/images`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    // refresh images + products list (so primary image_url updates)
    await loadProductImages(editingId);
    await Promise.all([loadProducts(), loadOwnerData()]);
    setNotice({ type: "success", text: "Images uploaded successfully." });

    setUploadFiles([]);
    setUploadVariant("");
    setUploadPrimary(false);
  } catch (err) {
    setNotice({ type: "danger", text: err.response?.data?.error || "Image upload failed." });
  } finally {
    setUploading(false);
  }
}
  async function deleteProductImage(imageId) {
  if (!window.confirm("Delete this image?")) return;
  try {
    await api.delete(`/owner/product-images/${imageId}`);
    await loadProductImages(editingId);
    setNotice({ type: "success", text: "Image deleted." });
  } catch {
    setNotice({ type: "danger", text: "Could not delete image." });
  }
}
  async function submitRequest(event) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const items = cartItems.map(([id, quantity]) => ({
        product_id: Number(id),
        quantity,
      }));
      const { data } = await api.post("/requests", { ...customer, items });
      setNotice({
        type: "success",
        text: `${data.message} Request number: #${data.request_id}.`,
      });
      setCart({});
      setCustomer({ customer_name: "", phone: "", address: "", message: "" });
      setShowRequest(false);
    } catch (error) {
      setNotice({
        type: "danger",
        text:
          error.response?.data?.error ||
          "Could not submit your request. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function loadOwnerData() {
    try {
      const [reqRes, prodRes, ordRes] = await Promise.all([
        api.get("/owner/requests"),
        api.get("/products"),
        api.get("/owner/orders"), // NEW
      ]);
      setRequests(reqRes.data);
      setOwnerProducts(prodRes.data);
      setOrders(ordRes.data); // NEW
    } catch (error) {
      if (error.response?.status === 401) setOwnerLoggedIn(false);
    }
  }

  async function doLogin(event) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await api.post("/owner/login", login);
      setOwnerLoggedIn(true);
      setPage("owner");
      await loadOwnerData();
      setNotice({ type: "success", text: "Welcome to your owner dashboard." });
    } catch (error) {
      setNotice({
        type: "danger",
        text: error.response?.data?.error || "Login failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await api.post("/owner/logout");
    } catch {}
    setOwnerLoggedIn(false);
    setPage("shop");
    setNotice({ type: "success", text: "You have logged out." });
  }

  async function changeStatus(id, status) {
    try {
      await api.patch(`/owner/requests/${id}`, { status });
      await loadOwnerData();
      setNotice({
        type: "success",
        text: `Request #${id} updated to ${status}.`,
      });
    } catch {
      setNotice({ type: "danger", text: "Could not update request status." });
    }
  }

  async function saveProduct(event) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const payload = {
      ...productForm,
      price: Number(productForm.price),
      stock: Number(productForm.stock),
    };
    try {
      if (editingId) await api.patch(`/owner/products/${editingId}`, payload);
      else await api.post("/owner/products", payload);
      setProductForm(blankProduct);
      setEditingId(null);
      await Promise.all([loadProducts(), loadOwnerData()]);
      setNotice({ type: "success", text: "Product saved successfully." });
    } catch (error) {
      setNotice({
        type: "danger",
        text: error.response?.data?.error || "Could not save product.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function hideProduct(id) {
    if (!window.confirm("Hide this product from the customer catalogue?"))
      return;
    try {
      await api.delete(`/owner/products/${id}`);
      await Promise.all([loadProducts(), loadOwnerData()]);
      setNotice({ type: "success", text: "Product hidden from the catalogue." });
    } catch {
      setNotice({ type: "danger", text: "Could not hide product." });
    }
  }

  function editProduct(product) {
    setEditingId(product.id);
    setProductForm({
      name: product.name,
      category: product.category,
      brand: product.brand || "",
      description: product.description || "",
      image_url: product.image_url || "",
      price: String(product.price),
      stock: String(product.stock),
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
    loadProductImages(product.id);
  }
  


  return (
    <div className="app-shell">
      <nav className="navbar navbar-expand-lg navbar-light bg-white sticky-top border-bottom">
        <div className="container py-1">
           <button
  className="navbar-brand brand-mark border-0 bg-transparent"
  onClick={() => { setPage("shop"); setNotice(null); }}
>
  <span className="brand-icon"><Glasses size={23} /></span>
  <span className="brand-name">चश्मा वाले</span>
</button>
          <button
            className="navbar-toggler"
            data-bs-toggle="collapse"
            data-bs-target="#mainNav"
            aria-label="Toggle navigation"
          >
            <Menu />
          </button>
          <div className="collapse navbar-collapse" id="mainNav">
            <div className="navbar-nav ms-auto align-items-lg-center gap-lg-2">
              <button
                className={`nav-link ${page === "shop" ? "active-link" : ""}`}
                onClick={() => setPage("shop")}
              >
                Shop glasses
              </button>
              {ownerLoggedIn && (
                <button
                  className={`nav-link ${page === "owner" ? "active-link" : ""}`}
                  onClick={() => {
                    setPage("owner");
                    loadOwnerData();
                  }}
                >
                  Dashboard
                </button>
              )}
              <button
                className="btn btn-dark rounded-pill px-4 nav-owner"
                onClick={() => {
                  setNotice(null);
                  if (ownerLoggedIn) {
                    setPage("owner");
                    loadOwnerData();
                  } else setPage("login");
                }}
              >
                {ownerLoggedIn ? "Owner dashboard" : "Owner login"}{" "}
                <ArrowRight size={16} className="ms-1" />
              </button>
              {ownerLoggedIn && (
                <button
                  className="btn btn-link text-secondary text-decoration-none"
                  onClick={logout}
                >
                  Log out
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main>
        {notice && (
          <div className="container pt-3">
            <div
              className={`alert alert-${notice.type} alert-dismissible`}
              role="alert"
            >
              {notice.text}
              <button
                type="button"
                className="btn-close"
                onClick={() => setNotice(null)}
                aria-label="Close"
              />
            </div>
          </div>
        )}

        {page === "shop" && (
          <>
            <section className="hero-section">
              <div className="container hero-grid">
                <div className="hero-copy">
                  <span className="eyebrow">
                    <Sparkles size={15} /> YOUR EVERYDAY EYEWEAR DESTINATION
                  </span>
                  <h1>
                    
                    <br />
                    <span></span>
                  </h1>
                  <p>
                    Find frames that feel like you. Explore our collection and
                    send us a purchase request in just a few clicks.
                  </p>
                  <a
                    className="btn btn-dark btn-lg rounded-pill px-4"
                    href="#collection"
                  >
                    Explore collection{" "}
                    <ArrowRight size={17} className="ms-2" />
                  </a>
                  <div className="hero-trust">
                    <span>
                      <CheckCircle2 size={16} /> 
                    </span>
                    <span>
                      <CheckCircle2 size={16} /> 
                    </span>
                  </div>
                </div>
                <div className="hero-art" aria-label="Eyeglasses illustration">
                  <div className="hero-orbit orbit-one"></div>
                  <div className="hero-orbit orbit-two"></div>
                  
                  <div className="glasses-art">
                    <div className="lens lens-left"></div>
                    <div className="bridge"></div>
                    <div className="lens lens-right"></div>
                    <div className="arm arm-left"></div>
                    <div className="arm arm-right"></div>
                  </div>
                  <div className="hero-caption">YOUR STYLE, YOUR VISION.</div>
                </div>
              </div>
            </section>

            <section id="collection" className="container py-5">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">THE COLLECTION</span>
                  <h2>Find your next favourite.</h2>
                  <p>Thoughtfully selected eyewear for every day.</p>
                </div>
                <div className="search-box">
                  <Search size={18} />
                  <input
                    aria-label="Search products"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search frames, brands..."
                  />
                </div>
              </div>
              <div className="category-row mb-4">
                {categories.map((item) => (
                  <button
                    key={item}
                    className={`category-pill ${
                      category === item ? "selected" : ""
                    }`}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              {loading ? (
                <div className="text-center py-5">Loading collection…</div>
              ) : filteredProducts.length === 0 ? (
                <div className="empty-state">
                  No products found. Try another search.
                </div>
              ) : (
                <div className="row g-4">
                  {filteredProducts.map((p) => (
                    <div
                      className="col-12 col-sm-6 col-lg-4 col-xl-3"
                      key={p.id}
                    >
                      <article className="product-card">
                        <div className="product-photo">
                          <img
                              src={productImage(p)}
                              alt={p.name}
                              loading="lazy"
                              style={{ cursor: "pointer" }}
                              onClick={() => openQuickView(p)}
                            />
                          <span className="product-tag">{p.category}</span>
                          {p.stock <= 3 && p.stock > 0 && (
                            <span className="stock-tag">Few left</span>
                          )}
                        </div>
                        <div className="product-info">
                          <div className="product-brand">
                            {p.brand || "Chashma Wale"}
                          </div>
                          <h3>{p.name}</h3>
                          <p className="product-desc">
                            {p.description ||
                              "Everyday eyewear, selected for your style."}
                          </p>
                          <div className="product-bottom">
                            <div>
                              <strong>{money(p.price)}</strong>
                              <small>
                                {p.stock > 0
                                  ? `${p.stock} in stock`
                                  : "Out of stock"}
                              </small>
                            </div>
                            <button
                              className="btn btn-dark rounded-pill add-btn"
                              disabled={p.stock < 1}
                              onClick={() => {
                                updateQty(p.id, (cart[p.id] || 0) + 1);
                                setNotice({
                                  type: "success",
                                  text: `${p.name} added to your request.`,
                                });
                              }}
                            >
                              Add <ShoppingBag size={15} />
                            </button>
                          </div>
                          {cart[p.id] > 0 && (
                            <div className="quantity-control">
                              <button
                                onClick={() => updateQty(p.id, cart[p.id] - 1)}
                                aria-label="Decrease quantity"
                              >
                                −
                              </button>
                              <span>{cart[p.id]} selected</span>
                              <button
                                onClick={() => updateQty(p.id, cart[p.id] + 1)}
                                disabled={cart[p.id] >= p.stock}
                                aria-label="Increase quantity"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="request-strip">
              <div className="container d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
                <div>
                  <span className="eyebrow">READY WHEN YOU ARE</span>
                  <h2>Your picks, one easy request.</h2>
                  <p className="mb-0">
                    Send us your details and we’ll contact you to confirm
                    availability.
                  </p>
                </div>
                <button
                  className="btn btn-light btn-lg rounded-pill px-4"
                  disabled={!cartCount}
                  onClick={() => setShowRequest(true)}
                >
                  Request to purchase ({cartCount}){" "}
                  <ArrowRight size={17} className="ms-2" />
                </button>
              </div>
            </section>
            <section className="container py-5">
  <div className="contact-grid">
    <div className="contact-card">
      <span className="eyebrow">VISIT OUR SHOP</span>
      <h2 className="mb-2">चश्मा वाले</h2>

      <p className="mb-2 text-secondary">
        Google Maps par location dekhne ke liye “Get Directions” use karein.
      </p>

      <div className="d-flex flex-wrap gap-2 mt-3">
        <a
          className="btn btn-dark rounded-pill"
          href="https://maps.app.goo.gl/2uJFbYdYtD5BLUoh9"
          target="_blank"
          rel="noreferrer"
        >
          Get Directions
        </a>

        {/* optional */}
        { <a className="btn btn-outline-dark rounded-pill" href="tel:9430638287">Call</a> }
        {<a className="btn btn-outline-dark rounded-pill" href="mailto:monu@example.com">Email</a> }
      </div>
    </div>

    <div className="map-card">
      <div className="map-embed">
        <iframe
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d7197.759957742618!2d85.10931100608876!3d25.575659536834117!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39f2a74e31d7947f%3A0x1195239dfd940022!2sChashma%20Vale!5e0!3m2!1sen!2sin!4v1792560916109!5m2!1sen!2sin"
          allowFullScreen=""
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          title="Chashma Vale - Google Map"
        />
      </div>
    </div>
  </div>
</section>
 
          </>
        )}

        {page === "login" && (
          <section className="container login-wrap">
            <div className="login-card">
              <div className="login-icon">
                <ShieldCheck size={27} />
              </div>
              <span className="eyebrow">SHOP OWNER ACCESS</span>
              <h1>Welcome back.</h1>
              <p>Sign in to manage products and customer requests.</p>
              <form onSubmit={doLogin}>
                <label className="form-label">Username</label>
                <input
                  className="form-control form-control-lg mb-3"
                  value={login.username}
                  onChange={(e) =>
                    setLogin({ ...login, username: e.target.value })
                  }
                  required
                />
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-control form-control-lg mb-4"
                  value={login.password}
                  onChange={(e) =>
                    setLogin({ ...login, password: e.target.value })
                  }
                  required
                />
                <button
                  className="btn btn-dark btn-lg rounded-pill w-100"
                  disabled={busy}
                >
                  {busy ? "Signing in…" : "Sign in"}{" "}
                  <ArrowRight size={17} className="ms-2" />
                </button>
              </form>
              <button
                className="btn btn-link mt-3 text-secondary"
                onClick={() => setPage("shop")}
              >
                ← Back to shop
              </button>
            </div>
          </section>
        )}

        {page === "owner" && ownerLoggedIn && (
          <section className="container owner-wrap py-5">
            <div className="owner-heading">
              <div>
                <span className="eyebrow">YOUR SHOP, AT A GLANCE</span>
                <h1>Owner dashboard</h1>
                <p>Manage your collection and customer purchase requests.</p>
              </div>
              <button
                className="btn btn-outline-dark rounded-pill"
                onClick={loadOwnerData}
              >
                Refresh data
              </button>
            </div>

            <div className="row g-3 mb-4">
              <div className="col-6 col-lg-3">
                <div className="metric-card">
                  <span>Listed products</span>
                  <strong>{ownerProducts.length}</strong>
                  <small>Available in catalogue</small>
                </div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="metric-card">
                  <span>Total requests</span>
                  <strong>{requests.length}</strong>
                  <small>All customer requests</small>
                </div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="metric-card">
                  <span>New requests</span>
                  <strong>{requests.filter((r) => r.status === "New").length}</strong>
                  <small>Need your attention</small>
                </div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="metric-card">
                  <span>Low stock</span>
                  <strong>{ownerProducts.filter((p) => p.stock <= 3).length}</strong>
                  <small>3 units or fewer</small>
                </div>
              </div>
            </div>

            <div className="owner-tabs">
              <button
                className={ownerTab === "requests" ? "selected" : ""}
                onClick={() => setOwnerTab("requests")}
              >
                Customer requests <span>{requests.length}</span>
              </button>

              <button
                className={ownerTab === "products" ? "selected" : ""}
                onClick={() => setOwnerTab("products")}
              >
                Products & stock
              </button>

              {/* NEW: order history tab */}
              <button
                className={ownerTab === "orders" ? "selected" : ""}
                onClick={() => setOwnerTab("orders")}
              >
                Order history <span>{orders.length}</span>
              </button>
            </div>

            {ownerTab === "requests" && (
              <div className="dashboard-panel">
                {requests.length === 0 ? (
                  <div className="empty-state">
                    No requests yet. Customer submissions will appear here.
                  </div>
                ) : (
                  <div className="request-list">
                    {requests.map((r) => (
                      <article className="request-card" key={r.id}>
                        <div className="request-card-top">
                          <div>
                            <span className="request-id">REQUEST #{r.id}</span>
                            <h3>{r.customer_name}</h3>
                            <a href={`tel:${r.phone}`} className="phone-link">
                              {r.phone}
                            </a>
                            <div className="small text-secondary mt-1">
                              {new Date(r.created_at).toLocaleString()}
                            </div>
                          </div>
                          <select
                            className="form-select status-select"
                            value={r.status}
                            onChange={(e) => changeStatus(r.id, e.target.value)}
                            aria-label={`Status for request ${r.id}`}
                          >
                            {["New", "Contacted", "Confirmed", "Completed", "Cancelled"].map(
                              (s) => (
                                <option key={s}>{s}</option>
                              )
                            )}
                          </select>
                        </div>

                        <div className="request-items">
                          {r.items.map((item, i) => (
                            <div className="request-item" key={i}>
                              <span>
                                {item.product_name} × {item.quantity}
                              </span>
                              <strong>{money(item.price_each * item.quantity)}</strong>
                            </div>
                          ))}
                        </div>

                        <div className="request-total">
                          <span>Estimated total (not a confirmed sale)</span>
                          <strong>{money(r.estimated_total)}</strong>
                        </div>

                        {r.address && (
                          <p className="request-note">
                            <b>Address:</b> {r.address}
                          </p>
                        )}
                        {r.message && (
                          <p className="request-note">
                            <b>Message:</b> {r.message}
                          </p>
                        )}

                        <a
                          className="btn btn-outline-dark rounded-pill btn-sm mt-2"
                          href={`tel:${r.phone}`}
                        >
                          Call customer <ArrowRight size={14} className="ms-1" />
                        </a>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}

            {ownerTab === "products" && (
              <div className="row g-4">
                <div className="col-lg-5">
                  <div className="dashboard-panel product-editor">
                    <h2>{editingId ? "Edit product" : "Add a product"}</h2>
                    <p>Changes appear in the public catalogue.</p>
                    <form onSubmit={saveProduct}>
                      <label className="form-label">Product name *</label>
                      <input
                        className="form-control mb-3"
                        value={productForm.name}
                        onChange={(e) =>
                          setProductForm({ ...productForm, name: e.target.value })
                        }
                        required
                      />

                      <div className="row">
                        <div className="col-6">
                          <label className="form-label">Category *</label>
                          <select
                            className="form-select mb-3"
                            value={productForm.category}
                            onChange={(e) =>
                              setProductForm({
                                ...productForm,
                                category: e.target.value,
                              })
                            }
                          >
                            {categories.slice(1).map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-6">
                          <label className="form-label">Brand</label>
                          <input
                            className="form-control mb-3"
                            value={productForm.brand}
                            onChange={(e) =>
                              setProductForm({
                                ...productForm,
                                brand: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="row">
                        <div className="col-6">
                          <label className="form-label">Price (₹) *</label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className="form-control mb-3"
                            value={productForm.price}
                            onChange={(e) =>
                              setProductForm({
                                ...productForm,
                                price: e.target.value,
                              })
                            }
                            required
                          />
                        </div>

                        <div className="col-6">
                          <label className="form-label">Stock quantity *</label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className="form-control mb-3"
                            value={productForm.stock}
                            onChange={(e) =>
                              setProductForm({
                                ...productForm,
                                stock: e.target.value,
                              })
                            }
                            required
                          />
                        </div>
                      </div>

                      <label className="form-label">Image URL (optional)</label>
                      <input
                        type="url"
                        className="form-control mb-3"
                        placeholder="https://..."
                        value={productForm.image_url}
                        onChange={(e) =>
                          setProductForm({
                            ...productForm,
                            image_url: e.target.value,
                          })
                        }
                      />
                      <div className="mt-3 p-3 rounded" style={{ border: "1px solid rgba(16,24,40,.10)", background: "rgba(16,24,40,.02)" }}>
  <h6 className="mb-2">Upload product images (Cloudinary)</h6>

  <div className="row g-2">
    <div className="col-md-6">
      <label className="form-label">Select images (you can choose 3–4)</label>
      <input
        className="form-control"
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => setUploadFiles(Array.from(e.target.files || []))}
      />
    </div>

    <div className="col-md-3">
      <label className="form-label">Variant/Color (optional)</label>
      <input
        className="form-control"
        placeholder="Black / Blue / etc"
        value={uploadVariant}
        onChange={(e) => setUploadVariant(e.target.value)}
      />
    </div>

    <div className="col-md-3 d-flex align-items-end">
      <div className="form-check">
        <input
          className="form-check-input"
          type="checkbox"
          id="setPrimary"
          checked={uploadPrimary}
          onChange={(e) => setUploadPrimary(e.target.checked)}
        />
        <label className="form-check-label" htmlFor="setPrimary">
          Set as main image
        </label>
      </div>
    </div>
  </div>

  <button
    className="btn btn-outline-dark rounded-pill mt-3"
    onClick={uploadProductImages}
    disabled={uploading || !editingId}
    type="button"
  >
    {uploading ? "Uploading..." : "Upload images"}
  </button>

  <div className="mt-3">
    <div className="small text-secondary mb-2">Uploaded images for this product:</div>
    {productImages.length === 0 ? (
      <div className="text-secondary small">No extra images yet.</div>
    ) : (
      <div className="d-flex flex-wrap gap-2">
        {productImages.map((img) => (
          <div key={img.id} style={{ width: 92 }}>
            <img
              src={img.url}
              alt={img.variant || "product"}
              style={{ width: "92px", height: "70px", objectFit: "cover", borderRadius: 12, border: "1px solid rgba(16,24,40,.10)" }}
            />
            <div className="small text-secondary" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {img.variant || "Image"}
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger w-100 mt-1"
              onClick={() => deleteProductImage(img.id)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    )}
  </div>
</div>

                      <label className="form-label">Description</label>
                      <textarea
                        className="form-control mb-3"
                        rows="3"
                        value={productForm.description}
                        onChange={(e) =>
                          setProductForm({
                            ...productForm,
                            description: e.target.value,
                          })
                        }
                      />

                      <button
                        className="btn btn-dark rounded-pill px-4"
                        disabled={busy}
                      >
                        {editingId ? "Save changes" : "Add product"}
                      </button>

                      {editingId && (
                        <button
                          type="button"
                          className="btn btn-link text-secondary"
                          onClick={() => {
                            setEditingId(null);
                            setProductForm(blankProduct);
                             setProductImages([]);
  setUploadFiles([]);
  setUploadVariant("");
  setUploadPrimary(false);
                          }}
                        >
                          Cancel edit
                        </button>
                      )}
                    </form>
                  </div>
                </div>

                <div className="col-lg-7">
                  <div className="dashboard-panel">
                    <h2>Products & stock</h2>
                    <div className="table-responsive">
                      <table className="table align-middle">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Price</th>
                            <th>Stock</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ownerProducts.map((p) => (
                            <tr key={p.id}>
                              <td>
                                <strong>{p.name}</strong>
                                <div className="small text-secondary">{p.category}</div>
                              </td>
                              <td>{money(p.price)}</td>
                              <td>
                                <span className={`stock-pill ${p.stock <= 3 ? "low" : ""}`}>
                                  {p.stock}
                                </span>
                              </td>
                              <td>
                                <div className="d-flex gap-2">
                                  <button
                                    className="btn btn-sm btn-outline-dark"
                                    onClick={() => editProduct(p)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() => hideProduct(p.id)}
                                  >
                                    Hide
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* NEW: orders tab (uses your src/pages/ownerorderspage.jsx component) */}
            {ownerTab === "orders" && (
              <OwnerOrdersPage
                orders={orders}
                setOrders={setOrders}
                onRefresh={loadOwnerData}
                setNotice={setNotice}
                money={money}
              />
            )}
          </section>
        )}
      </main>

      <footer className="site-footer">
        <div className="container d-flex flex-column flex-md-row justify-content-between gap-2">
          <div className="footer-brand">
            <Glasses size={20} /> lens<span>&</span>look
          </div>
          <p className="mb-0">A little more clarity, every day.</p>
          <small>Demo shop name — customize it for your business.</small>
        </div>
      </footer>

      {showRequest && (
        <div
          className="modal-backdrop-custom"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowRequest(false);
          }}
        >
          <div
            className="request-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="requestTitle"
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">ONE LAST STEP</span>
                <h2 id="requestTitle">Send your request.</h2>
                <p>We'll contact you to confirm stock and details.</p>
              </div>
              <button
                className="icon-close"
                onClick={() => setShowRequest(false)}
                aria-label="Close form"
              >
                <X />
              </button>
            </div>

            <div className="selected-summary">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <strong>Your selection</strong>
                <span>{cartCount} item(s)</span>
              </div>
              {cartItems.map(([id, qty]) => {
                const p = products.find((x) => x.id === Number(id));
                return p ? (
                  <div className="summary-line" key={id}>
                    <span>
                      {p.name} × {qty}
                    </span>
                    <strong>{money(p.price * qty)}</strong>
                  </div>
                ) : null;
              })}
              <div className="summary-total">
                <span>Estimated total</span>
                <strong>{money(cartTotal)}</strong>
              </div>
            </div>

            <form onSubmit={submitRequest}>
              <label className="form-label">Your full name *</label>
              <input
                className="form-control mb-3"
                autoComplete="name"
                maxLength="120"
                value={customer.customer_name}
                onChange={(e) =>
                  setCustomer({ ...customer, customer_name: e.target.value })
                }
                required
              />
              <label className="form-label">Mobile number *</label>
              <input
                className="form-control mb-3"
                type="tel"
                autoComplete="tel"
                maxLength="30"
                placeholder="e.g. 98XXXXXXXX"
                value={customer.phone}
                onChange={(e) =>
                  setCustomer({ ...customer, phone: e.target.value })
                }
                required
              />
              <label className="form-label">Address or pickup preference</label>
              <input
                className="form-control mb-3"
                maxLength="300"
                placeholder="Optional"
                value={customer.address}
                onChange={(e) =>
                  setCustomer({ ...customer, address: e.target.value })
                }
              />
              <label className="form-label">Message (optional)</label>
              <textarea
                className="form-control mb-3"
                rows="2"
                maxLength="500"
                placeholder="Any questions or preferences?"
                value={customer.message}
                onChange={(e) =>
                  setCustomer({ ...customer, message: e.target.value })
                }
              />
              <p className="form-hint">
                This is a purchase request, not a confirmed order. The shop will
                contact you before finalizing it.
              </p>
              <button
                className="btn btn-dark btn-lg rounded-pill w-100"
                disabled={busy || !cartCount}
              >
                {busy ? "Sending request…" : "Submit purchase request"}{" "}
                <ArrowRight size={17} className="ms-2" />
              </button>
            </form>
          </div>
        </div>
      )}

      
      <ProductQuickViewModal
      open={quickView.open}
      product={quickView.product}
      fallbackImage={quickView.fallbackImage}
      onClose={closeQuickView}
      money={money}
      cartQty={quickView.product ? (cart[quickView.product.id] || 0) : 0}
      updateQty={updateQty}
      setNotice={setNotice}
      />
    </div>
  );
}