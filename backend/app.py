import os
import re
from datetime import datetime
from functools import wraps

import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv
from flask import Flask, jsonify, request, session
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func

load_dotenv()

app = Flask(__name__)

# -----------------------
# Cloudinary config
# -----------------------
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True,
)

# Optional: limit upload size (8MB)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024

# -----------------------
# App / DB / Session config
# -----------------------
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-only-change-this-secret")

db_url = os.getenv("DATABASE_URL", "sqlite:///chashma_shop.db")

# Render/Supabase often gives postgres:// ; psycopg2 needs postgresql+psycopg2://
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+psycopg2://", 1)
elif db_url.startswith("postgresql://"):
    # if you want to force psycopg2 driver:
    db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = db_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

is_prod = os.getenv("ENV", "").lower() == "production"

app.config["SESSION_COOKIE_HTTPONLY"] = True
if is_prod:
    app.config["SESSION_COOKIE_SAMESITE"] = "None"
    app.config["SESSION_COOKIE_SECURE"] = True
else:
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

CORS(
    app,
    supports_credentials=True,
    origins=[
        frontend_origin,
        re.compile(r"^https://.*\.vercel\.app$"),
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
)

db = SQLAlchemy(app)

OWNER_USERNAME = os.getenv("OWNER_USERNAME", "owner")
OWNER_PASSWORD = os.getenv("OWNER_PASSWORD", "change-this-password")

MAX_IMAGES_PER_PRODUCT = int(os.getenv("MAX_IMAGES_PER_PRODUCT", "6"))


# -----------------------
# Models
# -----------------------
class Product(db.Model):
    __tablename__ = "product"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(40), nullable=False, default="Frames")
    brand = db.Column(db.String(80), nullable=True, default="")
    description = db.Column(db.String(500), nullable=True, default="")
    image_url = db.Column(db.String(500), nullable=True, default="")
    price = db.Column(db.Integer, nullable=False)
    stock = db.Column(db.Integer, nullable=False, default=0)
    active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    images = db.relationship(
        "ProductImage",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductImage.sort_order.asc()",
    )

    reviews = db.relationship(
        "Review",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="Review.created_at.desc()",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "brand": self.brand or "",
            "description": self.description or "",
            "image_url": self.image_url or "",
            "price": self.price,
            "stock": self.stock,
            "active": self.active,
            "images": [img.to_dict() for img in self.images],
        }


class ProductImage(db.Model):
    __tablename__ = "product_image"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(
        db.Integer, db.ForeignKey("product.id"), nullable=False, index=True
    )

    url = db.Column(db.Text, nullable=False)
    public_id = db.Column(db.Text, nullable=True)

    variant = db.Column(db.String(60), nullable=True)  # e.g. "black", "blue"
    sort_order = db.Column(db.Integer, default=0, nullable=False)

    product = db.relationship("Product", back_populates="images")

    def to_dict(self):
        return {
            "id": self.id,
            "product_id": self.product_id,
            "url": self.url,
            "public_id": self.public_id,
            "variant": self.variant,
            "sort_order": self.sort_order,
        }


class Review(db.Model):
    __tablename__ = "review"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("product.id"), nullable=False)
    customer_name = db.Column(db.String(120), nullable=False)
    rating = db.Column(db.Integer, nullable=False)  # 1..5
    comment = db.Column(db.String(500), nullable=True, default="")
    approved = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    product = db.relationship("Product", back_populates="reviews")

    def to_dict(self):
        return {
            "id": self.id,
            "product_id": self.product_id,
            "customer_name": self.customer_name,
            "rating": self.rating,
            "comment": self.comment or "",
            "approved": self.approved,
            "created_at": self.created_at.isoformat(timespec="minutes") + "Z",
        }


class PurchaseRequest(db.Model):
    __tablename__ = "purchase_request"

    id = db.Column(db.Integer, primary_key=True)
    customer_name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(30), nullable=False)
    address = db.Column(db.String(300), nullable=True, default="")
    message = db.Column(db.String(500), nullable=True, default="")
    status = db.Column(db.String(30), nullable=False, default="New")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    items = db.relationship(
        "RequestItem", backref="purchase_request", cascade="all, delete-orphan"
    )
    orders = db.relationship(
        "Order", backref="purchase_request", cascade="all, delete-orphan"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "customer_name": self.customer_name,
            "phone": self.phone,
            "address": self.address or "",
            "message": self.message or "",
            "status": self.status,
            "created_at": self.created_at.isoformat(timespec="minutes") + "Z",
            "items": [item.to_dict() for item in self.items],
            "estimated_total": sum(item.price_each * item.quantity for item in self.items),
        }


class RequestItem(db.Model):
    __tablename__ = "request_item"

    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(
        db.Integer, db.ForeignKey("purchase_request.id"), nullable=False
    )
    product_id = db.Column(db.Integer, nullable=True)
    product_name = db.Column(db.String(120), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    price_each = db.Column(db.Integer, nullable=False)

    def to_dict(self):
        return {
            "product_id": self.product_id,
            "product_name": self.product_name,
            "quantity": self.quantity,
            "price_each": self.price_each,
        }


class Order(db.Model):
    __tablename__ = "order"

    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(db.Integer, db.ForeignKey("purchase_request.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    customer_name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(30), nullable=False)
    address = db.Column(db.String(300), nullable=True, default="")
    status = db.Column(db.String(30), nullable=False, default="Confirmed")

    summary = db.Column(db.String(300), nullable=True, default="")
    total_amount = db.Column(db.Integer, nullable=False, default=0)

    def to_dict(self):
        return {
            "id": self.id,
            "request_id": self.request_id,
            "created_at": self.created_at.isoformat(timespec="minutes") + "Z",
            "customer_name": self.customer_name,
            "phone": self.phone,
            "address": self.address or "",
            "status": self.status,
            "summary": self.summary or "",
            "total_amount": self.total_amount,
        }


# -----------------------
# Auth helper
# -----------------------
def owner_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("owner_logged_in"):
            return jsonify({"error": "Please log in as the shop owner."}), 401
        return fn(*args, **kwargs)

    return wrapper


# -----------------------
# Public APIs
# -----------------------
@app.get("/api/health")
def health():
    return jsonify({"ok": True})


@app.get("/api/products")
def list_products():
    products = Product.query.filter_by(active=True).order_by(Product.id.desc()).all()
    return jsonify([p.to_dict() for p in products])


@app.get("/api/products/<int:product_id>")
def product_detail(product_id):
    product = Product.query.filter_by(id=product_id, active=True).first()
    if not product:
        return jsonify({"error": "Product not found."}), 404

    images = []
    if product.image_url:
        images.append(product.image_url)
    images.extend([img.url for img in product.images])

    # de-dupe keep order
    seen = set()
    images = [u for u in images if u and not (u in seen or seen.add(u))]

    approved_reviews = [r for r in product.reviews if r.approved]
    count = len(approved_reviews)
    avg = round(sum(r.rating for r in approved_reviews) / count, 1) if count else 0

    payload = product.to_dict()
    payload.update({"images": images, "rating_avg": avg, "review_count": count})
    return jsonify(payload)


@app.get("/api/products/<int:product_id>/reviews")
def product_reviews(product_id):
    product = Product.query.filter_by(id=product_id, active=True).first()
    if not product:
        return jsonify({"error": "Product not found."}), 404
    rows = (
        Review.query.filter_by(product_id=product_id, approved=True)
        .order_by(Review.created_at.desc())
        .all()
    )
    return jsonify([r.to_dict() for r in rows])


@app.post("/api/products/<int:product_id>/reviews")
def add_review(product_id):
    product = Product.query.filter_by(id=product_id, active=True).first()
    if not product:
        return jsonify({"error": "Product not found."}), 404

    data = request.get_json(silent=True) or {}
    name = str(data.get("customer_name", "")).strip()
    comment = str(data.get("comment", "")).strip()

    try:
        rating = int(data.get("rating"))
    except (TypeError, ValueError):
        return jsonify({"error": "Rating must be a number (1 to 5)."}), 400

    if not name or len(name) > 120:
        return jsonify({"error": "Name is required (max 120 chars)."}), 400
    if rating < 1 or rating > 5:
        return jsonify({"error": "Rating must be between 1 and 5."}), 400
    if len(comment) > 500:
        return jsonify({"error": "Comment is too long (max 500 chars)."}), 400

    row = Review(
        product_id=product_id,
        customer_name=name,
        rating=rating,
        comment=comment[:500],
        approved=True,  # change to False if you want owner approval
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({"message": "Thanks! Your review was submitted."}), 201


@app.post("/api/requests")
def create_request():
    data = request.get_json(silent=True) or {}
    name = str(data.get("customer_name", "")).strip()
    phone = str(data.get("phone", "")).strip()
    address = str(data.get("address", "")).strip()
    message = str(data.get("message", "")).strip()
    items = data.get("items", [])

    if not name or len(name) > 120:
        return jsonify({"error": "Please enter your name (maximum 120 characters)."}), 400
    if not phone or len(phone) > 30:
        return jsonify({"error": "Please enter a valid contact number."}), 400
    if not isinstance(items, list) or not items or len(items) > 30:
        return jsonify({"error": "Please select at least one product (maximum 30 different items)."}), 400

    clean_items = []
    for row in items:
        try:
            product_id = int(row.get("product_id"))
            quantity = int(row.get("quantity"))
        except (TypeError, ValueError, AttributeError):
            return jsonify({"error": "Product or quantity is invalid."}), 400

        if quantity < 1 or quantity > 99:
            return jsonify({"error": "Each quantity must be between 1 and 99."}), 400

        product = Product.query.filter_by(id=product_id, active=True).first()
        if not product:
            return jsonify({"error": "A selected product is no longer available. Please refresh the page."}), 400
        if product.stock < quantity:
            return jsonify({"error": f"Only {product.stock} unit(s) currently available for {product.name}."}), 400

        clean_items.append((product, quantity))

    purchase = PurchaseRequest(customer_name=name, phone=phone, address=address, message=message)
    db.session.add(purchase)
    db.session.flush()

    for product, quantity in clean_items:
        db.session.add(
            RequestItem(
                request_id=purchase.id,
                product_id=product.id,
                product_name=product.name,
                quantity=quantity,
                price_each=product.price,
            )
        )

    db.session.commit()
    return jsonify({"message": "Your purchase request has been submitted. The shop owner will contact you.",
                    "request_id": purchase.id}), 201


# -----------------------
# Owner auth
# -----------------------
@app.post("/api/owner/login")
def owner_login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", ""))
    password = str(data.get("password", ""))

    if username != OWNER_USERNAME or password != OWNER_PASSWORD:
        return jsonify({"error": "Incorrect username or password."}), 401

    session.clear()
    session["owner_logged_in"] = True
    return jsonify({"message": "Logged in successfully."})


@app.post("/api/owner/logout")
def owner_logout():
    session.clear()
    return jsonify({"message": "Logged out."})


@app.get("/api/owner/me")
def owner_me():
    return jsonify({"logged_in": bool(session.get("owner_logged_in"))})


# -----------------------
# Owner - Requests
# -----------------------
@app.get("/api/owner/requests")
@owner_required
def owner_requests():
    rows = PurchaseRequest.query.order_by(PurchaseRequest.created_at.desc()).all()
    return jsonify([row.to_dict() for row in rows])


@app.patch("/api/owner/requests/<int:request_id>")
@owner_required
def update_request_status(request_id):
    row = db.session.get(PurchaseRequest, request_id)
    if not row:
        return jsonify({"error": "Request not found."}), 404

    data = request.get_json(silent=True) or {}
    allowed = {"New", "Contacted", "Confirmed", "Completed", "Cancelled"}
    status = data.get("status")
    if status not in allowed:
        return jsonify({"error": "Invalid request status."}), 400

    row.status = status

    # auto-create order when confirmed
    if status == "Confirmed":
        existing = Order.query.filter_by(request_id=row.id).first()
        if not existing:
            total = sum(item.price_each * item.quantity for item in row.items)
            summary_parts = [f"{it.product_name} x{it.quantity}" for it in row.items[:3]]
            summary = ", ".join(summary_parts)
            if len(row.items) > 3:
                summary += f" (+{len(row.items) - 3} more)"

            order = Order(
                request_id=row.id,
                customer_name=row.customer_name,
                phone=row.phone,
                address=row.address,
                status="Confirmed",
                summary=summary[:300],
                total_amount=total,
            )
            db.session.add(order)

    db.session.commit()
    return jsonify(row.to_dict())


# -----------------------
# Owner - Orders history
# -----------------------
@app.get("/api/owner/orders")
@owner_required
def list_orders():
    rows = Order.query.order_by(Order.created_at.desc()).all()
    return jsonify([row.to_dict() for row in rows])


@app.post("/api/owner/orders")
@owner_required
def create_order():
    data = request.get_json(silent=True) or {}

    try:
        customer_name = str(data.get("customer_name", "")).strip()
        phone = str(data.get("phone", "")).strip()
        address = str(data.get("address", "")).strip()
        summary = str(data.get("summary", "")).strip()
        status = str(data.get("status", "Confirmed")).strip()
        total_amount = int(data.get("total_amount", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "Enter valid order details."}), 400

    if not customer_name or len(customer_name) > 120:
        return jsonify({"error": "Customer name is required (max 120 characters)."}), 400
    if not phone or len(phone) > 30:
        return jsonify({"error": "Phone is required (max 30 characters)."}), 400
    if total_amount < 0:
        return jsonify({"error": "Total amount cannot be negative."}), 400

    allowed_statuses = {"Confirmed", "Completed", "Cancelled"}
    if status not in allowed_statuses:
        return jsonify({"error": "Invalid order status."}), 400

    order = Order(
        request_id=data.get("request_id"),
        customer_name=customer_name,
        phone=phone,
        address=address[:300],
        status=status,
        summary=summary[:300],
        total_amount=total_amount,
    )
    db.session.add(order)
    db.session.commit()
    return jsonify(order.to_dict()), 201


# -----------------------
# Owner - Products CRUD
# -----------------------
@app.get("/api/owner/products")
@owner_required
def owner_list_products():
    rows = Product.query.order_by(Product.id.desc()).all()
    return jsonify([p.to_dict() for p in rows])


@app.post("/api/owner/products")
@owner_required
def add_product():
    data = request.get_json(silent=True) or {}
    try:
        name = str(data.get("name", "")).strip()
        category = str(data.get("category", "Frames")).strip()
        price = int(data.get("price"))
        stock = int(data.get("stock"))
    except (TypeError, ValueError):
        return jsonify({"error": "Enter a valid price and stock quantity."}), 400

    if not name or len(name) > 120 or price < 0 or stock < 0:
        return jsonify({"error": "Product name is required; price and stock cannot be negative."}), 400
    if category not in {"Frames", "Sunglasses", "Lenses", "Accessories"}:
        return jsonify({"error": "Choose a valid category."}), 400

    product = Product(
        name=name,
        category=category,
        price=price,
        stock=stock,
        brand=str(data.get("brand", "")).strip()[:80],
        description=str(data.get("description", "")).strip()[:500],
        image_url=str(data.get("image_url", "")).strip()[:500],
        active=bool(data.get("active", True)),
    )
    db.session.add(product)
    db.session.commit()
    return jsonify(product.to_dict()), 201


@app.patch("/api/owner/products/<int:product_id>")
@owner_required
def edit_product(product_id):
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Product not found."}), 404

    data = request.get_json(silent=True) or {}

    try:
        if "name" in data:
            name = str(data["name"]).strip()
            if not name:
                raise ValueError()
            product.name = name[:120]

        if "price" in data:
            product.price = int(data["price"])
        if "stock" in data:
            product.stock = int(data["stock"])

        if "category" in data:
            if data["category"] not in {"Frames", "Sunglasses", "Lenses", "Accessories"}:
                return jsonify({"error": "Choose a valid category."}), 400
            product.category = data["category"]

    except (TypeError, ValueError):
        return jsonify({"error": "Enter valid product details."}), 400

    if product.price < 0 or product.stock < 0:
        return jsonify({"error": "Price and stock cannot be negative."}), 400

    for key in ("brand", "description", "image_url"):
        if key in data:
            setattr(product, key, str(data[key]).strip()[:500])

    if "active" in data:
        product.active = bool(data["active"])

    db.session.commit()
    return jsonify(product.to_dict())


@app.delete("/api/owner/products/<int:product_id>")
@owner_required
def deactivate_product(product_id):
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Product not found."}), 404
    product.active = False
    db.session.commit()
    return jsonify({"message": "Product hidden from the public catalogue."})


# -----------------------
# Owner - Product Images (Cloudinary)
# -----------------------
@app.get("/api/owner/products/<int:product_id>/images")
@owner_required
def owner_list_product_images(product_id):
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Product not found."}), 404
    return jsonify([img.to_dict() for img in product.images])


@app.post("/api/owner/products/<int:product_id>/images")
@owner_required
def owner_upload_product_images(product_id):
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Product not found."}), 404

    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "Please select image file(s)."}), 400

    current_count = ProductImage.query.filter_by(product_id=product.id).count()
    if current_count + len(files) > MAX_IMAGES_PER_PRODUCT:
        return jsonify({"error": f"Max {MAX_IMAGES_PER_PRODUCT} images allowed per product."}), 400

    variant = (request.form.get("variant") or "").strip()[:60]
    set_primary = (request.form.get("set_primary") or "").lower() in {"1", "true", "yes"}

    folder = os.getenv("CLOUDINARY_FOLDER", "chashma-wale/products")

    max_sort = (
        db.session.query(func.max(ProductImage.sort_order))
        .filter(ProductImage.product_id == product.id)
        .scalar()
    )
    next_sort = (max_sort + 1) if max_sort is not None else 0

    created = []

    for f in files:
        if not (f.mimetype or "").startswith("image/"):
            return jsonify({"error": "Only image uploads are allowed."}), 400

        res = cloudinary.uploader.upload(
            f,
            folder=folder,
            resource_type="image",
        )
        url = res.get("secure_url")
        public_id = res.get("public_id", "")

        row = ProductImage(
            product_id=product.id,
            url=url,
            public_id=public_id,
            variant=variant,
            sort_order=next_sort,
        )
        next_sort += 1
        db.session.add(row)
        created.append(row)

        if (not product.image_url) or set_primary:
            product.image_url = url

    db.session.commit()
    return jsonify([r.to_dict() for r in created]), 201


@app.delete("/api/owner/product-images/<int:image_id>")
@owner_required
def owner_delete_product_image(image_id):
    img = db.session.get(ProductImage, image_id)
    if not img:
        return jsonify({"error": "Image not found."}), 404

    product = db.session.get(Product, img.product_id)

    # delete from cloudinary (optional)
    try:
        if img.public_id:
            cloudinary.uploader.destroy(img.public_id, resource_type="image")
    except Exception:
        pass

    was_primary = bool(product and product.image_url and product.image_url == img.url)

    db.session.delete(img)
    db.session.commit()

    # if primary removed, set to another image (or blank)
    if product and was_primary:
        first = (
            ProductImage.query.filter_by(product_id=product.id)
            .order_by(ProductImage.sort_order.asc())
            .first()
        )
        product.image_url = first.url if first else ""
        db.session.commit()

    return jsonify({"message": "Image deleted."})


# -----------------------
# Seed demo products (optional)
# -----------------------
def seed_products():
    if Product.query.count() != 0:
        return

    db.session.add_all(
        [
            Product(
                name="Classic Black Frame",
                category="Frames",
                brand="Everyday",
                description="Lightweight everyday frame.",
                price=799,
                stock=12,
            ),
            Product(
                name="Modern Round Frame",
                category="Frames",
                brand="Studio",
                description="Round frame with a clean, modern look.",
                price=999,
                stock=8,
            ),
            Product(
                name="UV Protection Sunglasses",
                category="Sunglasses",
                brand="Sunline",
                description="Stylish sunglasses for everyday outdoor use.",
                price=1299,
                stock=6,
            ),
            Product(
                name="Lens Pair - Standard",
                category="Lenses",
                brand="ClearView",
                description="Lens option; prescription suitability will be confirmed by the shop.",
                price=599,
                stock=10,
            ),
        ]
    )
    db.session.commit()


with app.app_context():
    db.create_all()
    if os.getenv("SEED_PRODUCTS", "").lower() in {"1", "true", "yes"}:
        seed_products()


if __name__ == "__main__":
    app.run(debug=True, port=5000)