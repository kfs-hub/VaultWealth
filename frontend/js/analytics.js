/**
 * VaultWealth — Financial Analytics, Smart Insights & Machine Learning Forecasting
 * Phase 9: Financial Analytics Engine (MoM Calculations, Category Comparison, Cashflow)
 * Phase 10: Automated Rule-Based Smart Insights Engine
 * Phase 11: Machine Learning Expense Forecasting (OLS Linear Regression Model)
 */

let barChartInstance = null;
let pieChartInstance = null;
let mlForecastChartInstance = null;

// Benchmark ML Model parameters (derived from python ml/prediction.py on historical dataset)
const BENCHMARK_ML_MODEL = {
  historical_months_count: 12,
  historical_data: [
    { month: 'Oct 2025', amount: 14200.0 },
    { month: 'Nov 2025', amount: 15650.0 },
    { month: 'Dec 2025', amount: 16900.0 },
    { month: 'Jan 2026', amount: 17600.0 },
    { month: 'Feb 2026', amount: 18300.0 },
    { month: 'Mar 2026', amount: 19000.0 },
    { month: 'Apr 2026', amount: 19800.0 },
    { month: 'May 2026', amount: 20500.0 },
    { month: 'Jun 2026', amount: 21200.0 },
    { month: 'Jul 2026', amount: 21900.0 },
    { month: 'Aug 2026', amount: 22600.0 },
    { month: 'Sep 2026', amount: 23300.0 }
  ],
  forecast: {
    predicted_amount: 24315.15,
    confidence_lower: 23887.61,
    confidence_upper: 24742.69,
    trend_slope: 779.90,
    intercept: 14176.52,
    trend_direction: 'Increasing',
    r2_score: 0.9885,
    mae: 218.13,
    next_month_label: 'Oct 2026 (Forecast)'
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();
  if (!user) return;

  await loadAnalyticsData();

  window.addEventListener('vaultwealth:refresh', async () => {
    await loadAnalyticsData();
  });
});

/**
 * Main Data Loader for Analytics & ML
 */
async function loadAnalyticsData() {
  const client = getSupabaseClient();
  if (!client) return;

  const user = await getCurrentUser();
  if (!user) return;

  try {
    const { data: transactions, error } = await client
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false });

    if (error) {
      console.error('[VaultWealth] Error loading analytics data:', error);
      return;
    }

    const txList = transactions || [];
    
    // Phase 9: Metrics & Visualizations
    const momResult = computeAnalyticsMetrics(txList);
    renderCategoryBarChart(txList);
    renderCashFlowPieChart(txList);
    
    // Phase 10: Automated Smart Insights
    generateSmartInsightsFeed(txList, momResult);

    // Phase 11: AI / Machine Learning Expense Forecasting
    initForecastEngine(txList);

  } catch (err) {
    console.error('[VaultWealth] Unexpected error in loadAnalyticsData:', err);
  }
}

/* ==========================================================================
   PHASE 9: FINANCIAL ANALYTICS ENGINE (MoM, Largest Category, Daily Spend)
   ========================================================================== */

/**
 * Computes Month-over-Month change, Largest Category, and Daily Average Spend
 */
function computeAnalyticsMetrics(transactions) {
  const expenses = transactions.filter(t => t.type === 'expense');
  
  const now = new Date();
  const currentYearMonth = now.toISOString().substring(0, 7); // "YYYY-MM"
  
  // Previous month string
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYearMonth = prevDate.toISOString().substring(0, 7);

  let curMonthExpense = 0;
  let prevMonthExpense = 0;
  const categorySums = {};
  let totalExpenseAllTime = 0;

  expenses.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    const yyyymm = t.transaction_date.substring(0, 7);
    if (yyyymm === currentYearMonth) {
      curMonthExpense += amt;
    } else if (yyyymm === prevYearMonth) {
      prevMonthExpense += amt;
    }

    categorySums[t.category] = (categorySums[t.category] || 0) + amt;
    totalExpenseAllTime += amt;
  });

  // 1. Month-over-Month Shift Element
  const momValEl = document.getElementById('analyticMomValue');
  const momFooterEl = document.getElementById('analyticMomFooter');
  let momDiff = 0;
  let momPct = 0;

  if (momValEl && momFooterEl) {
    if (prevMonthExpense > 0) {
      momDiff = curMonthExpense - prevMonthExpense;
      momPct = parseFloat(((momDiff / prevMonthExpense) * 100).toFixed(1));
      const isIncrease = momDiff >= 0;
      momValEl.className = `stat-value amount ${isIncrease ? 'amount-expense' : 'amount-income'}`;
      momValEl.textContent = `${isIncrease ? '+' : ''}${momPct}%`;
      momFooterEl.textContent = `Prev: ${formatCurrency(prevMonthExpense)} → This Mo: ${formatCurrency(curMonthExpense)}`;
    } else if (curMonthExpense > 0) {
      momValEl.className = 'stat-value amount';
      momValEl.textContent = 'Baseline';
      momFooterEl.textContent = `Current Month Spend: ${formatCurrency(curMonthExpense)}`;
    } else {
      momValEl.className = 'stat-value amount';
      momValEl.textContent = '0.0%';
      momFooterEl.textContent = 'No expenses logged this month yet';
    }
  }

  // 2. Largest Expense Category
  const topCatValEl = document.getElementById('analyticTopCategory');
  const topCatFooterEl = document.getElementById('analyticTopCatFooter');
  let topCat = 'None';
  let topCatAmt = 0;

  for (const [cat, amt] of Object.entries(categorySums)) {
    if (amt > topCatAmt) {
      topCatAmt = amt;
      topCat = cat;
    }
  }

  if (topCatValEl && topCatFooterEl) {
    if (topCatAmt > 0 && totalExpenseAllTime > 0) {
      const catPct = ((topCatAmt / totalExpenseAllTime) * 100).toFixed(1);
      topCatValEl.textContent = topCat;
      topCatFooterEl.innerHTML = `<strong>${formatCurrency(topCatAmt)}</strong> (${catPct}% of total spend)`;
    } else {
      topCatValEl.textContent = 'None';
      topCatFooterEl.textContent = 'No expenses recorded yet';
    }
  }

  // 3. Daily Average Spend (Current Month)
  const dailyAvgValEl = document.getElementById('analyticDailyAvg');
  const dailyAvgFooterEl = document.getElementById('analyticDailyAvgFooter');
  const dayOfMonth = now.getDate() || 1;
  const avgDaily = curMonthExpense / dayOfMonth;

  if (dailyAvgValEl && dailyAvgFooterEl) {
    if (window.RollingNumber) {
      RollingNumber.animate(dailyAvgValEl, avgDaily, { suffix: ' / day' });
    } else {
      dailyAvgValEl.textContent = `${formatCurrency(avgDaily)} / day`;
    }
    dailyAvgFooterEl.textContent = `Averaged over ${dayOfMonth} active day(s) this month`;
  }

  return {
    curMonthExpense,
    prevMonthExpense,
    momDiff,
    momPct,
    avgDaily,
    dayOfMonth
  };
}

/**
 * Phase 9: Renders Category Comparison Bar Chart
 */
function renderCategoryBarChart(transactions) {
  const canvas = document.getElementById('analyticsCategoryBarChart');
  if (!canvas) return;

  const expenses = transactions.filter(t => t.type === 'expense');
  const categorySums = {};
  expenses.forEach(t => {
    categorySums[t.category] = (categorySums[t.category] || 0) + (parseFloat(t.amount) || 0);
  });

  const labels = Object.keys(categorySums);
  const data = Object.values(categorySums);

  if (barChartInstance) {
    barChartInstance.destroy();
  }

  const container = canvas.parentElement;
  const emptyId = 'barEmptyNotice';
  let emptyNotice = document.getElementById(emptyId);

  if (labels.length === 0) {
    canvas.style.display = 'none';
    if (!emptyNotice) {
      emptyNotice = document.createElement('div');
      emptyNotice.id = emptyId;
      emptyNotice.style.cssText = 'height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); text-align: center; padding: 2rem;';
      emptyNotice.innerHTML = `
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">📊</div>
        <p style="font-size: 0.875rem;">No expense categories recorded yet.</p>
      `;
      container.appendChild(emptyNotice);
    } else {
      emptyNotice.style.display = 'flex';
    }
    return;
  } else {
    canvas.style.display = 'block';
    if (emptyNotice) emptyNotice.style.display = 'none';
  }

  const colors = ['#f97316', '#ec4899', '#eab308', '#06b6d4', '#8b5cf6', '#6366f1', '#10b981', '#3b82f6'];

  barChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Spend Amount (₹)',
        data: data,
        backgroundColor: colors.slice(0, labels.length),
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ₹${ctx.raw.toLocaleString('en-IN')}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#64748b',
            font: { family: 'Inter', size: 11 },
            callback: (val) => '₹' + val
          }
        }
      }
    }
  });
}

/**
 * Phase 9: Renders Cash Flow (Savings vs Expenses) Pie Chart
 */
function renderCashFlowPieChart(transactions) {
  const canvas = document.getElementById('cashflowPieChart');
  if (!canvas) return;

  let totalIncome = 0;
  let totalExpense = 0;

  transactions.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'income') totalIncome += amt;
    else if (t.type === 'expense') totalExpense += amt;
  });

  const retainedSavings = Math.max(0, totalIncome - totalExpense);

  if (pieChartInstance) {
    pieChartInstance.destroy();
  }

  const container = canvas.parentElement;
  const emptyId = 'pieEmptyNotice';
  let emptyNotice = document.getElementById(emptyId);

  if (totalIncome === 0 && totalExpense === 0) {
    canvas.style.display = 'none';
    if (!emptyNotice) {
      emptyNotice = document.createElement('div');
      emptyNotice.id = emptyId;
      emptyNotice.style.cssText = 'height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); text-align: center; padding: 2rem;';
      emptyNotice.innerHTML = `
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">⚖️</div>
        <p style="font-size: 0.875rem;">No cashflow transactions recorded yet.</p>
      `;
      container.appendChild(emptyNotice);
    } else {
      emptyNotice.style.display = 'flex';
    }
    return;
  } else {
    canvas.style.display = 'block';
    if (emptyNotice) emptyNotice.style.display = 'none';
  }

  // Update header badge
  const headerBadge = canvas.closest('.card')?.querySelector('.badge-income');
  if (headerBadge) {
    headerBadge.textContent = `Net Savings: ${formatCurrency(totalIncome - totalExpense)}`;
  }

  pieChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'pie',
    data: {
      labels: ['Retained Savings', 'Spent (Expenses)'],
      datasets: [{
        data: [retainedSavings, totalExpense],
        backgroundColor: ['#10b981', '#f43f5e'],
        borderColor: '#111827',
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#94a3b8',
            padding: 14,
            font: { family: 'Inter', size: 11 }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ₹${ctx.raw.toLocaleString('en-IN')}`
          }
        }
      }
    }
  });
}

/* ==========================================================================
   PHASE 10: AUTOMATED RULE-BASED SMART INSIGHTS ENGINE
   ========================================================================== */

/**
 * Generates automated rule-based insights feed from live data
 */
function generateSmartInsightsFeed(transactions, momData) {
  const container = document.getElementById('analyticsInsightsContainer');
  const countBadge = document.getElementById('analyticsInsightsCount');
  if (!container) return;

  if (transactions.length === 0) {
    container.innerHTML = `
      <div class="insight-card" style="border-left-color: var(--color-accent);">
        <div class="insight-icon">💡</div>
        <div class="insight-content">
          <h4>No Transactions Recorded Yet</h4>
          <p>Once you begin logging income and expenses, the analytics rule engine will automatically detect spending habits, category concentration, and savings velocity.</p>
        </div>
      </div>
    `;
    if (countBadge) countBadge.textContent = '0 Insights';
    return;
  }

  const expenses = transactions.filter(t => t.type === 'expense');
  const incomes = transactions.filter(t => t.type === 'income');

  let totalIncome = 0;
  let totalExpense = 0;
  const categorySums = {};

  incomes.forEach(t => totalIncome += (parseFloat(t.amount) || 0));
  expenses.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    totalExpense += amt;
    categorySums[t.category] = (categorySums[t.category] || 0) + amt;
  });

  const insights = [];

  // Insight Rule 1: Category Dominance Rule (>30% of total expenses)
  let topCat = null;
  let topAmt = 0;
  for (const [cat, amt] of Object.entries(categorySums)) {
    if (amt > topAmt) {
      topAmt = amt;
      topCat = cat;
    }
  }

  if (topCat && totalExpense > 0) {
    const pct = ((topAmt / totalExpense) * 100).toFixed(1);
    if (pct >= 30) {
      insights.push({
        type: 'danger',
        icon: '🍔',
        title: 'High Category Concentration Risk',
        body: `<strong>${escapeHtml(topCat)}</strong> consumes <strong>${pct}%</strong> (${formatCurrency(topAmt)}) of your total expenditures. Consider budgeting a strict monthly ceiling for this category.`
      });
    } else {
      insights.push({
        type: 'warning',
        icon: '📊',
        title: 'Primary Spending Category',
        body: `Your largest expense area is <strong>${escapeHtml(topCat)}</strong> at <strong>${formatCurrency(topAmt)}</strong> (${pct}% of total expenses).`
      });
    }
  }

  // Insight Rule 2: Savings Health Rule (20% standard savings ratio)
  if (totalIncome > 0) {
    const net = totalIncome - totalExpense;
    const rate = ((net / totalIncome) * 100).toFixed(1);

    if (rate >= 20) {
      insights.push({
        type: 'success',
        icon: '🎯',
        title: 'Healthy Savings Rate',
        body: `You are currently saving <strong>${rate}%</strong> of your total earnings. Maintaining above 20% adheres to standard 50-30-20 financial planning rules.`
      });
    } else if (rate > 0) {
      insights.push({
        type: 'warning',
        icon: '⚠️',
        title: 'Modest Savings Buffer',
        body: `You are saving <strong>${rate}%</strong> of your earnings. Aim to elevate your monthly savings toward 20% to build a liquid emergency fund.`
      });
    } else {
      insights.push({
        type: 'danger',
        icon: '🚨',
        title: 'Deficit Warning',
        body: `Your total expenses exceed your recorded income by <strong>${formatCurrency(Math.abs(net))}</strong>. Immediate expense trimming is recommended.`
      });
    }
  }

  // Insight Rule 3: Month-over-Month Velocity Spike Rule
  if (momData && momData.prevMonthExpense > 0) {
    if (momData.momPct >= 15) {
      insights.push({
        type: 'danger',
        icon: '📈',
        title: 'Spending Acceleration Alert',
        body: `Your monthly expenditures grew by <strong>+${momData.momPct}%</strong> (${formatCurrency(momData.momDiff)}) compared to last month. Review recent purchases to prevent recurring lifestyle creep.`
      });
    } else if (momData.momPct <= -10) {
      insights.push({
        type: 'success',
        icon: '📉',
        title: 'Expenditure Optimization',
        body: `Great discipline! Your spending dropped by <strong>${Math.abs(momData.momPct)}%</strong> compared to the previous month, freeing up additional capital for savings.`
      });
    }
  }

  // Insight Rule 4: Daily Burn Rate & Month-End Projection Rule
  if (momData && momData.avgDaily > 0) {
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const projectedMonthTotal = momData.avgDaily * daysInMonth;
    insights.push({
      type: 'warning',
      icon: '🗓️',
      title: 'Monthly Burn Rate Projection',
      body: `At your current velocity of <strong>${formatCurrency(momData.avgDaily)}/day</strong>, your forecasted total expenditure for this month is estimated at <strong>${formatCurrency(projectedMonthTotal)}</strong>.`
    });
  }

  // Insight Rule 5: Active Tracking Consistency Rule
  if (transactions.length >= 5) {
    insights.push({
      type: 'success',
      icon: '🛡️',
      title: 'Robust Dataset for Forecasting',
      body: `You have logged <strong>${transactions.length}</strong> transactions. Continued regular logging enhances the accuracy of the Phase 11 Ordinary Least Squares ML model.`
    });
  }

  let html = '';
  insights.forEach(item => {
    html += `
      <div class="insight-card ${item.type}">
        <div class="insight-icon">${item.icon}</div>
        <div class="insight-content">
          <h4>${item.title}</h4>
          <p>${item.body}</p>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  if (countBadge) countBadge.textContent = `${insights.length} Active Insights`;
}

/* ==========================================================================
   PHASE 11: MACHINE LEARNING EXPENSE PREDICTION & FORECASTING ENGINE
   ========================================================================== */

/**
 * Phase 11: In-Browser & Python Bridge ML Forecasting Engine
 * Employs Ordinary Least Squares (OLS) Linear Regression: y_hat = beta_0 + beta_1 * X
 */
function initForecastEngine(transactions) {
  const expenses = transactions.filter(t => t.type === 'expense');

  // Aggregate expenses chronologically by month
  const monthlyTotals = {};
  const sorted = [...expenses].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

  sorted.forEach(t => {
    const m = t.transaction_date.substring(0, 7); // YYYY-MM
    monthlyTotals[m] = (monthlyTotals[m] || 0) + (parseFloat(t.amount) || 0);
  });

  const monthKeys = Object.keys(monthlyTotals);
  const isUserLiveModel = monthKeys.length >= 2;

  let modelData;

  if (isUserLiveModel) {
    // 1. Train Live OLS Linear Regression on User's Supabase Historical Data
    modelData = trainLiveOlsModel(monthlyTotals);
    updateForecastUI(modelData, true);
  } else {
    // 2. Use Historical 12-Month Benchmark Model (From Python ml/prediction.py)
    modelData = BENCHMARK_ML_MODEL;
    updateForecastUI(modelData, false);
  }

  // Setup Export Button for Python ML CLI
  setupExportMlButton(transactions);
}

/**
 * Fits Ordinary Least Squares (OLS) Linear Regression model directly in JavaScript
 * Equation: y_hat = beta_0 + beta_1 * X
 */
function trainLiveOlsModel(monthlyTotals) {
  const months = Object.keys(monthlyTotals);
  const n = months.length;

  const x_vals = [];
  const y_vals = [];
  const historical_data = [];

  months.forEach((m, idx) => {
    const x = idx + 1; // 1, 2, ..., N
    const y = monthlyTotals[m];
    x_vals.push(x);
    y_vals.push(y);

    const [year, month] = m.split('-');
    const dateObj = new Date(year, month - 1, 1);
    const label = dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    historical_data.push({ month: label, amount: y });
  });

  // Calculate Means
  const x_mean = x_vals.reduce((a, b) => a + b, 0) / n;
  const y_mean = y_vals.reduce((a, b) => a + b, 0) / n;

  // Compute Slope (beta_1)
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (x_vals[i] - x_mean) * (y_vals[i] - y_mean);
    denominator += Math.pow(x_vals[i] - x_mean, 2);
  }

  const slope = denominator === 0 ? 0 : (numerator / denominator);
  const intercept = y_mean - (slope * x_mean);

  // Model Evaluation: MAE & R² Score
  const predictions = x_vals.map(x => intercept + (slope * x));
  let sumAbsError = 0;
  let ss_res = 0;
  let ss_tot = 0;

  for (let i = 0; i < n; i++) {
    const err = Math.abs(y_vals[i] - predictions[i]);
    sumAbsError += err;
    ss_res += Math.pow(y_vals[i] - predictions[i], 2);
    ss_tot += Math.pow(y_vals[i] - y_mean, 2);
  }

  const mae = sumAbsError / n;
  const r2_score = ss_tot === 0 ? 1.0 : Math.max(0, 1.0 - (ss_res / ss_tot));

  // Predict Next Step (N + 1)
  const next_step = n + 1;
  const predicted_amount = Math.max(0, intercept + (slope * next_step));
  const confidence_margin = mae * 1.96; // 95% Confidence Interval
  const confidence_lower = Math.max(0, predicted_amount - confidence_margin);
  const confidence_upper = predicted_amount + confidence_margin;

  const trend_direction = slope > 10 ? 'Increasing' : (slope < -10 ? 'Decreasing' : 'Stable');

  // Next month label
  const lastMonthKey = months[months.length - 1];
  const [lastY, lastM] = lastMonthKey.split('-').map(Number);
  const nextDate = new Date(lastY, lastM, 1); // next month
  const next_month_label = nextDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) + ' (Forecast)';

  return {
    historical_months_count: n,
    historical_data,
    forecast: {
      predicted_amount: Math.round(predicted_amount * 100) / 100,
      confidence_lower: Math.round(confidence_lower * 100) / 100,
      confidence_upper: Math.round(confidence_upper * 100) / 100,
      trend_slope: Math.round(slope * 100) / 100,
      intercept: Math.round(intercept * 100) / 100,
      trend_direction,
      r2_score: Math.round(r2_score * 10000) / 10000,
      mae: Math.round(mae * 100) / 100,
      next_month_label
    }
  };
}

/**
 * Updates UI Cards, Equation Callout, and Chart for Phase 11
 */
function updateForecastUI(modelData, isUserLive) {
  const f = modelData.forecast;

  // 1. Top Stat Card Metric
  const topForecastValEl = document.getElementById('analyticForecastValue');
  const topForecastFootEl = document.getElementById('analyticForecastFooter');
  if (topForecastValEl && topForecastFootEl) {
    if (window.RollingNumber) {
      RollingNumber.animate(topForecastValEl, f.predicted_amount);
    } else {
      topForecastValEl.textContent = formatCurrency(f.predicted_amount);
    }
    topForecastFootEl.innerHTML = isUserLive
      ? `<span class="stat-trend-${f.trend_direction === 'Decreasing' ? 'up' : 'down'}">${f.trend_direction}</span> (${formatCurrency(Math.abs(f.trend_slope))}/mo)`
      : `<span>Trained on 12-mo Python ML model</span>`;
  }

  // 2. Source Badge
  const badgeEl = document.getElementById('forecastSourceBadge');
  if (badgeEl) {
    if (isUserLive) {
      badgeEl.className = 'badge badge-income';
      badgeEl.textContent = 'Live Model (User Account)';
    } else {
      badgeEl.className = 'badge badge-category';
      badgeEl.textContent = 'Benchmark Model (12-Mo)';
    }
  }

  // 3. Predicted Amount & Confidence Interval
  const predEl = document.getElementById('mlPredictedAmount');
  const confEl = document.getElementById('mlConfidenceRange');
  if (predEl && confEl) {
    if (window.RollingNumber) {
      RollingNumber.animate(predEl, f.predicted_amount);
    } else {
      predEl.textContent = formatCurrency(f.predicted_amount);
    }
    confEl.textContent = `95% CI: ${formatCurrency(f.confidence_lower)} - ${formatCurrency(f.confidence_upper)}`;
  }

  // 4. Trend Slope & Velocity
  const slopeEl = document.getElementById('mlTrendSlope');
  const dirEl = document.getElementById('mlTrendDirection');
  if (slopeEl && dirEl) {
    const sign = f.trend_slope >= 0 ? '+' : '';
    slopeEl.textContent = `${sign}${formatCurrency(f.trend_slope)} / mo`;
    slopeEl.className = `stat-value amount ${f.trend_slope > 0 ? 'amount-expense' : 'amount-income'}`;
    dirEl.textContent = `Spending Velocity: ${f.trend_direction}`;
  }

  // 5. Model Fit (R²) & MAE
  const r2El = document.getElementById('mlR2Score');
  const maeEl = document.getElementById('mlMaeScore');
  if (r2El && maeEl) {
    r2El.textContent = f.r2_score.toFixed(4);
    maeEl.textContent = `Mean Abs Error: ${formatCurrency(f.mae)}`;
  }

  // 6. Data Timeline & Equation
  const countEl = document.getElementById('mlMonthsCount');
  const eqEl = document.getElementById('mlEquationSnippet');
  if (countEl && eqEl) {
    countEl.textContent = `${modelData.historical_months_count} Months`;
    eqEl.textContent = `ŷ = ${formatCurrency(f.intercept || 0)} + (${formatCurrency(f.trend_slope)} × X)`;
  }

  // 7. Render Visualization Chart
  renderForecastChart(modelData);
}

/**
 * Phase 11: Renders Time-Series Trajectory & Projected Forecast Line Chart
 */
function renderForecastChart(modelData) {
  const canvas = document.getElementById('mlForecastChart');
  if (!canvas) return;

  const historical = modelData.historical_data;
  const f = modelData.forecast;

  const labels = historical.map(h => h.month);
  labels.push(f.next_month_label);

  // Dataset 1: Historical Actuals (null for forecast step)
  const actualsData = historical.map(h => h.amount);
  actualsData.push(null);

  // Dataset 2: Forecast Projection Line (starts from last historical point to forecast point)
  const projectionData = new Array(historical.length - 1).fill(null);
  projectionData.push(historical[historical.length - 1].amount); // connect seamless
  projectionData.push(f.predicted_amount);

  if (mlForecastChartInstance) {
    mlForecastChartInstance.destroy();
  }

  mlForecastChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Historical Actual Expenses',
          data: actualsData,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.25,
          borderWidth: 2.5,
          pointBackgroundColor: '#3b82f6',
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: 'OLS Machine Learning Forecast',
          data: projectionData,
          borderColor: '#38bdf8',
          borderDash: [6, 6],
          backgroundColor: 'rgba(56, 189, 248, 0.12)',
          fill: true,
          tension: 0,
          borderWidth: 2.5,
          pointBackgroundColor: '#38bdf8',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#94a3b8',
            font: { family: 'Inter', size: 11 },
            boxWidth: 14
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.raw;
              if (val === null || val === undefined) return '';
              return ` ${ctx.dataset.label}: ₹${val.toLocaleString('en-IN')}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#64748b',
            font: { family: 'Inter', size: 11 },
            callback: (val) => '₹' + val
          }
        }
      }
    }
  });
}

/**
 * Sets up CSV Exporter for Python ML module CLI training
 */
function setupExportMlButton(transactions) {
  const btn = document.getElementById('exportMlDataBtn');
  if (!btn) return;

  btn.onclick = () => {
    let csvContent = 'date,amount,category,type,description\n';

    if (transactions.length > 0) {
      transactions.forEach(t => {
        const cleanDesc = (t.description || '').replace(/"/g, '""');
        csvContent += `"${t.transaction_date}",${t.amount},"${t.category}","${t.type}","${cleanDesc}"\n`;
      });
    } else {
      // Export benchmark format if no live transactions
      BENCHMARK_ML_MODEL.historical_data.forEach(h => {
        csvContent += `"2026-01-01",${h.amount},"General","expense","Benchmark sample"\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'vaultwealth_ml_transactions.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    alert('✅ Transactions exported as "vaultwealth_ml_transactions.csv"!\n\nTo run the Python ML pipeline on this dataset, run in your terminal:\npython ml/prediction.py --data vaultwealth_ml_transactions.csv');
  };
}
