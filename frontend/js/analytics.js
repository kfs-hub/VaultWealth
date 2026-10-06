/**
 * VaultWealth — Dynamic Financial Analytics & Smart Insights Engine
 * Phase 9 & 10: Real-time MoM Calculations, Category Distribution & Automated Rule-based Insights
 */

import {
  renderModernCategoryRankings,
  renderModernCashFlowGauge
} from './modern-visuals.js';

let mlForecastChartInstance = null;

function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

onReady(async () => {
  const user = await requireAuth();
  if (!user) return;

  await loadAnalyticsData();

  window.addEventListener('vaultwealth:refresh', async () => {
    await loadAnalyticsData();
  });
});

async function loadAnalyticsData() {
  const client = getSupabaseClient();
  if (!client) {
    computeAnalyticsMetrics([]);
    renderCategoryBarChart([]);
    renderCashFlowPieChart([]);
    generateSmartInsightsFeed([]);
    runMLForecasting([]);
    return;
  }

  const user = await getCurrentUser();
  if (!user) {
    computeAnalyticsMetrics([]);
    renderCategoryBarChart([]);
    renderCashFlowPieChart([]);
    generateSmartInsightsFeed([]);
    runMLForecasting([]);
    return;
  }

  try {
    const { data: transactions, error } = await client
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false });

    if (error) {
      console.error('[VaultWealth] Error loading analytics data:', error);
      computeAnalyticsMetrics([]);
      renderCategoryBarChart([]);
      renderCashFlowPieChart([]);
      generateSmartInsightsFeed([]);
      runMLForecasting([]);
      return;
    }

    const txList = transactions || [];
    computeAnalyticsMetrics(txList);
    renderCategoryBarChart(txList);
    renderCashFlowPieChart(txList);
    generateSmartInsightsFeed(txList);
    runMLForecasting(txList);

  } catch (err) {
    console.error('[VaultWealth] Unexpected error in loadAnalyticsData:', err);
    computeAnalyticsMetrics([]);
    renderCategoryBarChart([]);
    renderCashFlowPieChart([]);
    generateSmartInsightsFeed([]);
    runMLForecasting([]);
  }
}

/**
 * Computes Month-over-Month, Largest Category, and Daily Average
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

  // 1. Month-over-Month Element
  const momValEl = document.getElementById('analyticMomValue');
  const momFooterEl = document.getElementById('analyticMomFooter');
  if (momValEl && momFooterEl) {
    if (prevMonthExpense > 0) {
      const diff = curMonthExpense - prevMonthExpense;
      const pct = ((diff / prevMonthExpense) * 100).toFixed(1);
      const isIncrease = diff >= 0;
      momValEl.className = `stat-value amount ${isIncrease ? 'amount-expense' : 'amount-income'}`;
      momValEl.textContent = `${isIncrease ? '+' : ''}${pct}%`;
      momFooterEl.textContent = `Prev: ${formatCurrency(prevMonthExpense)} → This Month: ${formatCurrency(curMonthExpense)}`;
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
  if (dailyAvgValEl && dailyAvgFooterEl) {
    const dayOfMonth = now.getDate() || 1;
    const avg = curMonthExpense / dayOfMonth;
    dailyAvgValEl.textContent = `${formatCurrency(avg)} / day`;
    dailyAvgFooterEl.textContent = `Averaged over ${dayOfMonth} day(s) this month`;
  }
}

/**
 * Renders Category Comparison Volume Breakdown
 */
function renderCategoryBarChart(transactions) {
  const container = document.getElementById('categoryBarChartContainer');
  if (!container) return;
  renderModernCategoryRankings(container, transactions);
}

/**
 * Renders Cash Flow Proportions (Retained Savings vs Outflow)
 */
function renderCashFlowPieChart(transactions) {
  const container = document.getElementById('cashflowChartContainer');
  if (!container) return;
  renderModernCashFlowGauge(container, transactions);

  // Update header badge if present
  let totalIncome = 0;
  let totalExpense = 0;
  transactions.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'income') totalIncome += amt;
    else if (t.type === 'expense') totalExpense += amt;
  });
  const badge = document.getElementById('cashflowBadge');
  if (badge) {
    badge.textContent = `Net: ${formatCurrency(totalIncome - totalExpense)}`;
  }
}

/**
 * Generates automated rule-based insights feed from live data
 */
function generateSmartInsightsFeed(transactions) {
  const container = document.getElementById('analyticsInsightsContainer');
  const countBadge = document.getElementById('analyticsInsightsCount');
  if (!container) return;

  if (transactions.length === 0) {
    container.innerHTML = `
      <div class="insight-card" style="border-left-color: var(--color-accent);">
        <div class="insight-icon">${typeof getSvgIcon === 'function' ? getSvgIcon('lightbulb') : ''}</div>
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

  // Insight 1: Category Dominance Rule
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
        icon: typeof getSvgIcon === 'function' ? getSvgIcon('food') : '',
        title: 'High Category Concentration',
        body: `<strong>${escapeHtml(topCat)}</strong> makes up <strong>${pct}%</strong> (${formatCurrency(topAmt)}) of your total spending. Consider creating a sub-budget for this category.`
      });
    } else {
      insights.push({
        type: 'warning',
        icon: typeof getSvgIcon === 'function' ? getSvgIcon('bar-chart') : '',
        title: 'Primary Spending Category',
        body: `Your largest expense area is <strong>${escapeHtml(topCat)}</strong> at <strong>${formatCurrency(topAmt)}</strong> (${pct}% of total expenses).`
      });
    }
  }

  // Insight 2: Savings Health Rule
  if (totalIncome > 0) {
    const net = totalIncome - totalExpense;
    const rate = ((net / totalIncome) * 100).toFixed(1);

    if (rate >= 20) {
      insights.push({
        type: 'success',
        icon: typeof getSvgIcon === 'function' ? getSvgIcon('target') : '',
        title: 'Healthy Savings Rate',
        body: `You are currently saving <strong>${rate}%</strong> of your total earnings. Maintaining above 20% is ideal for long-term financial security.`
      });
    } else if (rate > 0) {
      insights.push({
        type: 'warning',
        icon: typeof getSvgIcon === 'function' ? getSvgIcon('warning') : '',
        title: 'Modest Savings Buffer',
        body: `You are saving <strong>${rate}%</strong> of your earnings. Try aiming for at least 20% to build an emergency fund.`
      });
    } else {
      insights.push({
        type: 'danger',
        icon: typeof getSvgIcon === 'function' ? getSvgIcon('siren') : '',
        title: 'Deficit Warning',
        body: `Your total expenses exceed your recorded income by <strong>${formatCurrency(Math.abs(net))}</strong>. Look for non-essential expenses to trim.`
      });
    }
  }

  // Insight 3: Transaction Count & Tracking Consistency
  if (transactions.length >= 5) {
    insights.push({
      type: 'success',
      icon: typeof getSvgIcon === 'function' ? getSvgIcon('trending-up') : '',
      title: 'Active Financial Logging',
      body: `You have logged <strong>${transactions.length}</strong> transactions in your Vault. Consistent tracking provides more accurate predictive models.`
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
  if (countBadge) countBadge.textContent = `${insights.length} Insights Generated`;
}
/**
 * ═══════════════════════════════════════════════════════════════════════
 * Phase 11 — Machine Learning Expense Forecasting Engine
 * Pure client-side OLS (Ordinary Least Squares) Linear Regression.
 *   Model:  ŷ = β₀ + β₁·X
 *   X     = chronological month index (1, 2, 3, ...)
 *   ŷ     = predicted total monthly expense
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * Main entry point — called from loadAnalyticsData() with live Supabase transactions.
 */
function runMLForecasting(transactions) {
  const expenses = transactions.filter(t => t.type === 'expense');

  // ── 1. Aggregate expenses into monthly totals ────────────────────────
  const monthlyMap = {};  // { 'YYYY-MM': totalAmount }
  expenses.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    const ym = (t.transaction_date || '').substring(0, 7); // 'YYYY-MM'
    if (ym.length === 7) {
      monthlyMap[ym] = (monthlyMap[ym] || 0) + amt;
    }
  });

  // Sort chronologically
  const sortedKeys = Object.keys(monthlyMap).sort();
  const n = sortedKeys.length;

  // ── 2. Guard: need at least 2 months for regression ──────────────────
  if (n < 2) {
    setForecastUIState('insufficient', n);
    return;
  }

  // ── 3. Build X (1-indexed month) and Y (monthly spend) arrays ────────
  const X = [];
  const Y = [];
  const monthLabels = [];

  sortedKeys.forEach((key, idx) => {
    X.push(idx + 1);
    Y.push(monthlyMap[key]);
    monthLabels.push(formatMonthLabel(key));
  });

  // ── 4. OLS Linear Regression: ŷ = β₀ + β₁·X ────────────────────────
  const sumX  = X.reduce((a, b) => a + b, 0);
  const sumY  = Y.reduce((a, b) => a + b, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;

  let ssXY = 0;  // Σ(xi - x̄)(yi - ȳ)
  let ssXX = 0;  // Σ(xi - x̄)²
  for (let i = 0; i < n; i++) {
    ssXY += (X[i] - meanX) * (Y[i] - meanY);
    ssXX += (X[i] - meanX) * (X[i] - meanX);
  }

  const beta1 = ssXX !== 0 ? ssXY / ssXX : 0;  // slope
  const beta0 = meanY - beta1 * meanX;           // intercept

  // ── 5. Predicted values & error metrics ──────────────────────────────
  const predicted = X.map(x => beta0 + beta1 * x);

  // R² (coefficient of determination)
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (Y[i] - meanY) ** 2;
    ssRes += (Y[i] - predicted[i]) ** 2;
  }
  const r2 = ssTot !== 0 ? 1 - ssRes / ssTot : 0;

  // MAE (mean absolute error)
  let absErrorSum = 0;
  for (let i = 0; i < n; i++) {
    absErrorSum += Math.abs(Y[i] - predicted[i]);
  }
  const mae = absErrorSum / n;

  // ── 6. Forecast next month ───────────────────────────────────────────
  const nextX = n + 1;
  const forecastAmount = beta0 + beta1 * nextX;
  const confidenceLower = forecastAmount - 1.96 * mae;
  const confidenceUpper = forecastAmount + 1.96 * mae;

  // Next month label
  const lastKey = sortedKeys[sortedKeys.length - 1];
  const [ly, lm] = lastKey.split('-').map(Number);
  const nextDate = new Date(ly, lm); // lm is already 0-indexed +1, so this gives next month
  const nextMonthLabel = formatMonthLabel(
    `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`
  );

  // Determine trend direction
  let trendDirection = 'Stable';
  if (beta1 > 50)  trendDirection = 'Increasing';
  if (beta1 < -50) trendDirection = 'Decreasing';

  // ── 7. Update all DOM elements ───────────────────────────────────────
  updateForecastDOM({
    forecastAmount,
    confidenceLower,
    confidenceUpper,
    beta0,
    beta1,
    r2,
    mae,
    n,
    trendDirection,
    nextMonthLabel
  });

  // ── 8. Render the forecast chart ─────────────────────────────────────
  renderForecastChart(monthLabels, Y, predicted, nextMonthLabel, forecastAmount);

  // ── 9. Wire up the Export CSV button with live Supabase data ─────────
  wireExportButton(transactions);
}

/**
 * Updates all Phase 11 DOM elements with computed values.
 */
function updateForecastDOM({ forecastAmount, confidenceLower, confidenceUpper, beta0, beta1, r2, mae, n, trendDirection, nextMonthLabel }) {
  // Top stat card: AI Forecast (Next Mo)
  const topForecastVal = document.getElementById('analyticForecastValue');
  const topForecastFooter = document.getElementById('analyticForecastFooter');
  if (topForecastVal) topForecastVal.textContent = formatCurrency(forecastAmount);
  if (topForecastFooter) topForecastFooter.innerHTML = `<span>OLS Prediction for ${escapeHtml(nextMonthLabel)}</span>`;

  // Source badge
  const sourceBadge = document.getElementById('forecastSourceBadge');
  if (sourceBadge) sourceBadge.textContent = `Model: JS OLS (${n} months)`;

  // Next Month Forecast
  const predictedEl = document.getElementById('mlPredictedAmount');
  if (predictedEl) predictedEl.textContent = formatCurrency(forecastAmount);

  // Confidence interval
  const ciEl = document.getElementById('mlConfidenceRange');
  if (ciEl) ciEl.innerHTML = `<span>95% CI: ${formatCurrency(Math.max(0, confidenceLower))} – ${formatCurrency(confidenceUpper)}</span>`;

  // Trend slope
  const slopeEl = document.getElementById('mlTrendSlope');
  if (slopeEl) {
    const sign = beta1 >= 0 ? '+' : '';
    slopeEl.textContent = `${sign}${formatCurrency(beta1)}`;
    slopeEl.style.color = beta1 >= 0 ? '#f97316' : '#10b981';
  }

  // Trend direction
  const dirEl = document.getElementById('mlTrendDirection');
  if (dirEl) dirEl.innerHTML = `<span>Spending Velocity: ${trendDirection}</span>`;

  // R² score
  const r2El = document.getElementById('mlR2Score');
  if (r2El) {
    r2El.textContent = r2.toFixed(4);
    r2El.style.color = r2 >= 0.7 ? '#10b981' : r2 >= 0.4 ? '#eab308' : '#f43f5e';
  }

  // MAE
  const maeEl = document.getElementById('mlMaeScore');
  if (maeEl) maeEl.innerHTML = `<span>Mean Abs Error: ${formatCurrency(mae)}</span>`;

  // Month count
  const monthsEl = document.getElementById('mlMonthsCount');
  if (monthsEl) monthsEl.textContent = `${n} Months`;

  // Equation snippet
  const eqEl = document.getElementById('mlEquationSnippet');
  if (eqEl) eqEl.textContent = `ŷ = ${beta0.toFixed(1)} + ${beta1.toFixed(1)}·X`;
}

/**
 * Sets UI state when there's insufficient data for regression.
 */
function setForecastUIState(reason, n) {
  const ids = ['analyticForecastValue', 'mlPredictedAmount'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });

  const badge = document.getElementById('forecastSourceBadge');
  if (badge) badge.textContent = n === 0 ? 'No expense data' : `Need ≥ 2 months (have ${n})`;

  const footerIds = ['analyticForecastFooter', 'mlConfidenceRange', 'mlTrendDirection', 'mlMaeScore'];
  footerIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<span>Insufficient data for regression</span>';
  });

  const monthsEl = document.getElementById('mlMonthsCount');
  if (monthsEl) monthsEl.textContent = `${n} Month${n !== 1 ? 's' : ''}`;

  const eqEl = document.getElementById('mlEquationSnippet');
  if (eqEl) eqEl.textContent = 'ŷ = β₀ + β₁·X (awaiting data)';

  const canvas = document.getElementById('mlForecastChart');
  if (canvas) {
    if (mlForecastChartInstance) {
      mlForecastChartInstance.destroy();
      mlForecastChartInstance = null;
    }
    canvas.style.display = 'none';
    const container = canvas.parentElement;
    let emptyNotice = document.getElementById('mlEmptyNotice');
    if (!emptyNotice && container) {
      emptyNotice = document.createElement('div');
      emptyNotice.id = 'mlEmptyNotice';
      emptyNotice.style.cssText = 'height: 100%; min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); text-align: center; padding: 2rem;';
      emptyNotice.innerHTML = `
        <div style="font-size: 2rem; margin-bottom: 0.5rem; display: flex; justify-content: center; color: #38bdf8;">
          ${typeof getSvgIcon === 'function' ? getSvgIcon('lightbulb', '', { width: 36, height: 36 }) : ''}
        </div>
        <p style="font-size: 0.875rem; font-weight: 500; color: var(--text-primary);">Awaiting Historical Transaction Series</p>
        <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">The Ordinary Least Squares model requires at least 2 distinct months of expense logs.</p>
      `;
      container.appendChild(emptyNotice);
    } else if (emptyNotice) {
      emptyNotice.style.display = 'flex';
    }
  }
}

/**
 * Renders the Historical vs Forecast line chart on the mlForecastChart canvas.
 */
function renderForecastChart(monthLabels, actuals, predicted, nextMonthLabel, forecastAmount) {
  const canvas = document.getElementById('mlForecastChart');
  if (!canvas) return;

  const emptyNotice = document.getElementById('mlEmptyNotice');
  if (emptyNotice) emptyNotice.style.display = 'none';
  canvas.style.display = 'block';

  if (mlForecastChartInstance) {
    mlForecastChartInstance.destroy();
  }

  // Extend arrays for the forecast point
  const allLabels = [...monthLabels, nextMonthLabel];
  const actualData = [...actuals, null]; // no actual for forecast month

  // Regression line extended to include forecast
  const regressionData = [...predicted, forecastAmount];

  const ctx = canvas.getContext('2d');
  const chartHeight = canvas.parentElement.clientHeight || 280;
  const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
  gradient.addColorStop(0, 'rgba(56, 189, 248, 0.18)');
  gradient.addColorStop(0.7, 'rgba(56, 189, 248, 0.02)');
  gradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

  mlForecastChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: allLabels,
      datasets: [
        {
          label: 'Actual Spend',
          data: actualData,
          borderColor: '#38bdf8',
          backgroundColor: gradient,
          pointBackgroundColor: '#38bdf8',
          pointBorderColor: '#09080e',
          pointBorderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 4.5,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: '#38bdf8',
          pointHoverBorderWidth: 2,
          borderWidth: 1.75,
          fill: true,
          tension: 0.38,
          spanGaps: false
        },
        {
          label: 'Forecast Trajectory',
          data: regressionData,
          borderColor: '#a855f7',
          backgroundColor: 'transparent',
          pointBackgroundColor: (ctx) => {
            return ctx.dataIndex === regressionData.length - 1 ? '#ffffff' : 'transparent';
          },
          pointBorderColor: (ctx) => {
            return ctx.dataIndex === regressionData.length - 1 ? '#a855f7' : 'transparent';
          },
          pointBorderWidth: 2,
          pointRadius: (ctx) => {
            return ctx.dataIndex === regressionData.length - 1 ? 5 : 0;
          },
          pointHoverRadius: (ctx) => {
            return ctx.dataIndex === regressionData.length - 1 ? 7 : 3;
          },
          pointStyle: 'circle',
          borderWidth: 1.5,
          borderDash: [4, 4],
          fill: false,
          tension: 0.2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(9, 8, 14, 0.95)',
          titleColor: 'rgba(242, 241, 245, 0.5)',
          bodyColor: '#f2f1f5',
          borderColor: 'rgba(255, 255, 255, 0.08)',
          borderWidth: 1,
          padding: { top: 8, bottom: 8, left: 12, right: 12 },
          cornerRadius: 8,
          boxWidth: 6,
          boxHeight: 6,
          usePointStyle: true,
          boxPadding: 4,
          callbacks: {
            label: (ctx) => {
              if (ctx.raw === null) return null;
              return `  ${ctx.dataset.label}: ₹${Number(ctx.raw).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: 'rgba(242, 241, 245, 0.4)',
            font: { family: 'Inter', size: 10 }
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.03)',
            borderDash: [4, 4]
          },
          border: { display: false },
          ticks: {
            color: 'rgba(242, 241, 245, 0.4)',
            font: { family: 'Inter', size: 10 },
            callback: (val) => '₹' + Number(val).toLocaleString('en-IN')
          }
        }
      }
    }
  });
}

/**
 * Converts 'YYYY-MM' to a human-readable label like 'Oct 2025'.
 */
function formatMonthLabel(ym) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [year, month] = ym.split('-');
  return `${months[parseInt(month, 10) - 1]} ${year}`;
}

/**
 * Wires the "Export ML CSV" button to export live Supabase transaction data.
 */
function wireExportButton(transactions) {
  const btn = document.getElementById('exportMlDataBtn');
  if (!btn) return;

  // Remove old listeners by cloning
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', () => {
    const expenses = transactions.filter(t => t.type === 'expense');
    if (!expenses.length) {
      alert('No expense transactions to export.');
      return;
    }

    const csv = ['Date,Description,Amount,Category,Type']
      .concat(expenses.map(t =>
        `${t.transaction_date || ''},"${(t.description || '').replace(/"/g, '""')}",${t.amount || 0},${t.category || ''},${t.type || ''}`
      ))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'vaultwealth_ml_transactions.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    alert(
      `Exported ${expenses.length} expense transactions as CSV.\n\n` +
      'To run the Python ML pipeline:\n' +
      'python ml/prediction.py --data vaultwealth_ml_transactions.csv'
    );
  });
}
