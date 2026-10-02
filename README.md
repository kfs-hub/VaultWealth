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
* **Hosting:** Vercel

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
│   │
│   ├── css/
│   │   ├── style.css             # Design tokens, typography & app shell layout
│   │   ├── dashboard.css         # Metric cards, chart grids & insight cards
│   │   └── forms.css             # Input controls, auth cards & type toggles
│   │
│   └── js/
│       ├── app.js                # Shared UI navigation & modal controllers
│       └── mock-data.js          # Static testing categories & sample transactions
│
├── database/                     # Supabase schema & SQL migrations (Phase 4)
│   └── schema.sql
│
├── ml/                           # Python expense prediction module (Phase 11)
│   ├── preprocessing.py
│   └── prediction.py
│
├── README.md
└── .gitignore
```

---

## 🧭 Phased Development Roadmap
1. ✅ **Phase 1:** Problem Statement, SRS & System Architecture Planning
2. ✅ **Phase 2:** UI/UX Wireframing & Design System
3. ✅ **Phase 3:** Frontend Foundation (HTML5, CSS3, & Static Mock UI)
4. ⏳ **Phase 4:** Supabase PostgreSQL Database Setup & Row Level Security (RLS)
5. ⏳ **Phase 5:** User Authentication (Register, Login, Session Management)
6. ⏳ **Phase 6:** Dynamic Transaction Management (CRUD Operations)
7. ⏳ **Phase 7:** Dynamic Financial Dashboard Integration
8. ⏳ **Phase 8:** Dynamic Chart.js Data Visualizations
9. ⏳ **Phase 9:** Financial Analytics Engine (MoM Calculations)
10. ⏳ **Phase 10:** Automated Rule-Based Smart Insights
11. ⏳ **Phase 11:** Python Machine Learning Expense Forecasting
12. ⏳ **Phase 12:** End-to-End Testing & Security Audit
13. ⏳ **Phase 13:** Vercel Deployment & GitHub CI/CD

---

## 💻 How to Run Locally (Phase 3)
1. Open any file in `frontend/` (e.g. `frontend/dashboard.html` or `frontend/index.html`) directly in your web browser.
2. Alternatively, use a local live server or VS Code Live Server extension.
