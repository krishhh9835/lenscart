import os
from datetime import datetime
from functools import wraps
from dotenv import load_dotenv
from flask import Flask, jsonify, request, session
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import re

load_dotenv()

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-only-change-this-secret")
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", "sqlite:///chashma_shop.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# --- Updated Dynamic Cookie Configuration ---
is_prod = os.getenv("ENV", "").lower() == "production"
app.config["SESSION_COOKIE_HTTPONLY"] = True

if is_prod:
    app.config["SESSION_COOKIE_SAMESITE"] = "None"
    app.config["SESSION_COOKIE_SECURE"] = True
else:
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    
# --------------------------------------------

# For production over HTTPS, configure secure cookies and a precise CORS origin.
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

VALID_CATEGORIES = {"Frames", "Sunglasses", "Lenses", "Accessories"}


class Product(db.Model):
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
        }


class PurchaseRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    customer_name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(30), nullable=False)
    address = db.Column(db.String(300), nullable=True, default="")
    message = db.Column(db.String(500), nullable=True, default="")
    status = db.Column(db.String(30), nullable=False, default="New")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    items = db.relationship("RequestItem", backref="purchase_request", cascade="all, delete-orphan")

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
    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(db.Integer, db.ForeignKey("purchase_request.id"), nullable=False)
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


def owner_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("owner_logged_in"):
            return jsonify({"error": "Please log in as the shop owner."}), 401
        return fn(*args, **kwargs)
    return wrapper


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


@app.get("/api/products")
def list_products():
    products = Product.query.filter_by(active=True).order_by(Product.id.desc()).all()
    return jsonify([p.to_dict() for p in products])


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

    purchase = PurchaseRequest(
        customer_name=name,
        phone=phone,
        address=address[:300],
        message=message[:500],
    )
    db.session.add(purchase)
    db.session.flush()

    for product, quantity in clean_items:
        db.session.add(RequestItem(
            request_id=purchase.id,
            product_id=product.id,
            product_name=product.name,
            quantity=quantity,
            price_each=product.price,
        ))

    db.session.commit()
    return jsonify({
        "message": "Your purchase request has been submitted. The shop owner will contact you.",
        "request_id": purchase.id,
    }), 201


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
    db.session.commit()
    return jsonify(row.to_dict())


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
    if category not in VALID_CATEGORIES:
        return jsonify({"error": "Choose a valid category."}), 400

    product = Product(
        name=name,
        category=category,
        price=price,
        stock=stock,
        brand=str(data.get("brand", "")).strip()[:80],
        description=str(data.get("description", "")).strip()[:500],
        image_url=str(data.get("image_url", "")).strip()[:500],
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
            if data["category"] not in VALID_CATEGORIES:
                db.session.rollback()
                return jsonify({"error": "Choose a valid category."}), 400
            product.category = data["category"]
    except (TypeError, ValueError):
        db.session.rollback()
        return jsonify({"error": "Enter valid product details."}), 400

    if product.price < 0 or product.stock < 0:
        db.session.rollback()
        return jsonify({"error": "Price and stock cannot be negative."}), 400

    limits = {"brand": 80, "description": 500, "image_url": 500}
    for key, limit in limits.items():
        if key in data:
            setattr(product, key, str(data[key]).strip()[:limit])
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


def seed_products():
    if Product.query.count() == 0:
        db.session.add_all([
            Product(name="Classic Black Frame", category="Frames", brand="Everyday",
                    description="Lightweight everyday frame.", price=799, stock=12),
            Product(name="Modern Round Frame", category="Frames", brand="Studio",
                    description="Round frame with a clean, modern look.", price=999, stock=8),
            Product(name="UV Protection Sunglasses", category="Sunglasses", brand="Sunline",
                    description="Stylish sunglasses for everyday outdoor use.", price=1299, stock=6),
            Product(name="Lens Pair - Standard", category="Lenses", brand="ClearView",
                    description="Lens option; prescription suitability will be confirmed by the shop.",
                    price=599, stock=10),
        ])
        db.session.commit()


with app.app_context():
    db.create_all()
    seed_products()


if __name__ == "__main__":
    app.run(debug=True, port=5000)