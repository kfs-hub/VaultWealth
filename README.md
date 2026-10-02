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
3. ✅ **Phase 3:** Frontend Foundation (HTML5, CSS3, & Clean Architecture)
4. ✅ **Phase 4:** Supabase PostgreSQL Database Setup & Row Level Security (RLS)
5. ✅ **Phase 5:** User Authentication (Register, Login, Session Management)
6. ✅ **Phase 6:** Dynamic Transaction Management (Real CRUD Operations & Filters)
7. ✅ **Phase 7:** Dynamic Financial Dashboard Integration (Real-time Supabase Queries)
8. ✅ **Phase 8:** Dynamic Chart.js Data Visualizations (Doughnut & Curved Line Charts)
9. ✅ **Phase 9:** Financial Analytics Engine (MoM Calculations, Daily Burn Rate, Proportions)
10. ✅ **Phase 10:** Automated Rule-Based Smart Insights Engine (5 Proactive Financial Rules)
11. ✅ **Phase 11:** Python Machine Learning Expense Forecasting (Explainable OLS Model)
12. ⏳ **Phase 12:** End-to-End Testing & Security Audit
13. ⏳ **Phase 13:** Vercel Deployment & GitHub CI/CD

---

## 🔬 Phase 9, 10 & 11 Details (Analytics, Insights & ML)

### 📊 Phase 9: Financial Analytics Engine
* **Month-over-Month (MoM) Shift:** Computes variance and percentage change between the current and previous calendar months.
* **Largest Expense Category:** Dynamically aggregates total spend by category to highlight top spending areas.
* **Daily Average Burn Rate:** Analyzes spending rate across active days in the current month.
* **Visualizations:** Category Spending Comparison (Bar Chart) and Cash Flow Proportions (Pie Chart: Savings vs Expenses).

### 💡 Phase 10: Automated Smart Insights Engine
* **Rule 1 (Category Dominance):** Warns if a single category accounts for &ge; 30% of total expenditures.
* **Rule 2 (Savings Health):** Evaluates savings ratio (&ge; 20% Healthy, 0–20% Modest Buffer, &lt; 0% Deficit Warning).
* **Rule 3 (Spending Acceleration Spike):** Detects &ge; 15% increase in monthly spending compared to the previous month.
* **Rule 4 (Monthly Burn Rate Projection):** Projects anticipated month-end spend based on daily velocity.
* **Rule 5 (Tracking Consistency):** Monitors transaction logging frequency to gauge statistical robustness.

### 🧠 Phase 11: Machine Learning Expense Forecasting
* **Algorithm:** Ordinary Least Squares (OLS) Time-Series Linear Regression ($\hat{y} = \beta_0 + \beta_1 X$).
* **Evaluation Metrics:** Mean Absolute Error (MAE), Coefficient of Determination ($R^2$), and 95% Confidence Interval.
* **Dual Execution:**
  1. **Python CLI Service (`ml/prediction.py`):** Trains on exported CSV data and outputs JSON forecast.
  2. **In-Browser ML Engine (`frontend/js/analytics.js`):** Trains on user's real Supabase data when &ge; 2 months of records exist, or provides benchmark projection with visual trend chart.

---

## 💻 How to Run Locally

### 1. Web Application (Frontend)
1. Open `frontend/index.html` or `frontend/login.html` directly in any modern browser.
2. Sign in with your registered credentials (e.g. `student@vaultwealth.com` / `Vault@1234`).
3. Navigate to **Analytics** to view live MoM metrics, rule-based insights, and ML forecasts.

### 2. Python Machine Learning Service
Run the standalone ML forecasting pipeline in your terminal:
```bash
# Run with historical benchmark dataset (12 months):
python ml/prediction.py

# Or run with your own exported VaultWealth transactions CSV:
python ml/prediction.py --data path/to/vaultwealth_ml_transactions.csv
```
