# Chashma Shop Website (Version 1)

A starter full-stack app for an optical shop:
- Public product catalogue with prices and available stock
- Customer purchase-request form supporting multiple products
- Owner login and dashboard
- Owner can add/edit/delete products and review/update request status
- Flask + SQLAlchemy + SQLite backend
- React + Vite + Bootstrap frontend

## Requirements
- Python 3.10+
- Node.js 20+ recommended
- VS Code (optional)

## 1. Start the backend (Windows PowerShell)

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python app.py
```

Backend runs at `http://127.0.0.1:5000`.

Demo owner login:
- Username: `owner`
- Password: `change-this-password`

Change `OWNER_PASSWORD` in `backend/.env` before using this beyond local testing.

## 2. Start the frontend (open a second PowerShell window)

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` on the same device running the backend and frontend. Keep the hostname consistent: use `localhost` for the frontend and API during local testing.

## How to use
1. Open the customer catalogue and add one or more products to a request.
2. Submit customer name, phone number, and optional address/message.
3. Click **Owner Login** in the navigation.
4. Log in with the demo credentials and open **Requests** or **Products**.
5. Add sample products, update stock, or change request status.

## Important before real use
This is a learning/starter app, not yet production-hardened. Before putting real customer data online:
- Set a strong unique owner password and a long random `SECRET_KEY`.
- Use HTTPS and configure allowed frontend origins in `backend/.env`.
- Add rate limiting, password reset/account management, audit logging and automated backups.
- Use persistent database storage; do not rely on a temporary hosting filesystem.
- Review privacy requirements and collect only necessary customer data.
- A submitted request is not a confirmed order and does not reserve or deduct stock.
- Deleting a product is disabled if it is already part of a request; set it inactive instead.

## Project structure
```text
chashma-shop-website/
  backend/
    app.py
    requirements.txt
    .env.example
  frontend/
    index.html
    package.json
    vite.config.js
    src/
      main.jsx
      App.jsx
      api.js
      styles.css
```
