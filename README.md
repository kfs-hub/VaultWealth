# VaultWealth — Personal Finance Analyzer

A web-based personal finance management and analytics platform that helps users record, categorize, visualize, analyze, and predict their income and expenses.

## 🚀 Academic Context
* **Project Name:** VaultWealth
* **Program:** B.Tech Computer Science & Engineering (5th Semester Mini Project)
* **Architecture:** 3-Tier Architecture (Client Web UI + Supabase BaaS + Python ML Service)

---

## 🛠️ Technology Stack
* **Frontend:** HTML5, CSS3 (Custom Design System with CSS Variables), Modern Vanilla JavaScript (ES6+)
* **Visualization:** Chart.js
* **Backend / Database:** Supabase (PostgreSQL, Row Level Security, Auth, REST APIs)
* **Forecasting / ML:** Python (Time-Series & Linear Regression)
* **Hosting:** Vercel (Static Frontend)

---

## 📁 Project Structure
```
VaultWealth/
│
├── frontend/                     # Web Application Frontend
│   ├── index.html                # Entry Landing page
│   ├── login.html                # User Login screen
│   ├── register.html             # User Registration screen
│   ├── dashboard.html            # Primary financial metrics & charts
│   ├── transactions.html         # CRUD transaction management & filters
│   ├── analytics.html            # Month-over-Month & Smart Insights
│   ├── profile.html              # Account settings & data export
│   ├── vercel.json               # Vercel config (when deploying frontend/ as root)
│   │
│   ├── css/
│   │   ├── style.css             # Design tokens, typography & app shell layout
│   │   ├── dashboard.css         # Metric cards, chart grids & insight cards
│   │   ├── forms.css             # Input controls, auth cards & type toggles
│   │   └── upload.css            # Statement upload modal styles
│   │
│   └── js/
│       ├── config.js             # Supabase credentials (NOT committed — copy from config.example.js)
│       ├── config.example.js     # Template for Supabase credentials
│       ├── app.js                # Shared UI navigation & modal controllers
│       ├── auth.js               # Login, Register & Session management
│       ├── supabase.js           # Supabase client wrapper
│       ├── dashboard.js          # Dashboard charts & metrics
│       ├── transactions.js       # Transaction CRUD logic
│       ├── analytics.js          # Analytics & insights engine
│       ├── profile.js            # Profile & settings logic
│       ├── statement-parser.js   # Bank statement parser (CSV/Excel/PDF)
│       ├── statement-upload.js   # Statement upload UI flow
│       ├── icons.js              # SVG icon library
│       └── mock-data.js          # Static test categories & sample data
│
├── database/                     # Supabase schema & SQL migrations
│   └── schema.sql
│
├── ml/                           # Python expense prediction module
│   └── prediction_result.json
│
├── vercel.json                   # Root Vercel deployment config (clean URLs + headers)
├── .vercelignore                 # Files excluded from Vercel deployment
├── README.md
└── .gitignore
```

---

## ☁️ Deploying to Vercel

### Option A — Recommended (Set Root Directory to `frontend/`)
1. Push this repo to GitHub.
2. Import the project on [vercel.com](https://vercel.com).
3. In **Settings → General → Root Directory**, set it to **`frontend`**.
4. Vercel will auto-detect static output and use `frontend/vercel.json` for clean URL routing.
5. No build command needed — leave it blank.

### Option B — Deploy from repo root
1. Push to GitHub and import on Vercel.
2. Leave Root Directory as **`/`** (default).
3. The root `vercel.json` maps all clean URLs to `frontend/*.html` automatically.

### Environment / Secrets
> **Never commit `config.js` with real credentials!**

Copy `frontend/js/config.example.js` → `frontend/js/config.js` locally and fill in your credentials. The file is gitignored. On Vercel, you can optionally inject secrets via **Settings → Environment Variables** (future phase using a server-side proxy).

---

## 💻 How to Run Locally
1. Open any file in `frontend/` (e.g. `frontend/dashboard.html`) directly in a browser, **or**
2. Run a local dev server from the `frontend/` folder:
   ```bash
   cd frontend
   python -m http.server 8080
   # then open http://localhost:8080
   ```
3. Or use the VS Code Live Server extension.

---

## 🧭 Phased Development Roadmap
1. ✅ **Phase 1:** Problem Statement, SRS & System Architecture Planning
2. ✅ **Phase 2:** UI/UX Wireframing & Design System
3. ✅ **Phase 3:** Frontend Foundation (HTML5, CSS3, & Static Mock UI)
4. ✅ **Phase 4:** Supabase PostgreSQL Database Setup & Row Level Security (RLS)
5. ✅ **Phase 5:** User Authentication (Register, Login, Session Management)
6. ✅ **Phase 6:** Dynamic Transaction Management (CRUD Operations)
7. ✅ **Phase 7:** Dynamic Financial Dashboard Integration
8. ✅ **Phase 8:** Dynamic Chart.js Data Visualizations
9. ✅ **Phase 9:** Financial Analytics Engine (MoM Calculations)
10. ✅ **Phase 10:** Automated Rule-Based Smart Insights
11. ✅ **Phase 11:** Bank Statement Upload & Parser (CSV/Excel/PDF)
12. ✅ **Phase 13:** Vercel Deployment & GitHub CI/CD
13. ⏳ **Phase 12:** Python Machine Learning Expense Forecasting
14. ⏳ **Phase 14:** End-to-End Testing & Security Audit
