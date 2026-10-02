/**
 * VaultWealth — Dynamic Financial Analytics & Smart Insights Engine
 * Phase 9 & 10: Real-time MoM Calculations, Category Distribution & Automated Rule-based Insights
 */

let barChartInstance = null;
let pieChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();
  if (!user) return;

  await loadAnalyticsData();

  window.addEventListener('vaultwealth:refresh', async () => {
    await loadAnalyticsData();
  });
});

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
    computeAnalyticsMetrics(txList);
    renderCategoryBarChart(txList);
    renderCashFlowPieChart(txList);
    generateSmartInsightsFeed(txList);

  } catch (err) {
    console.error('[VaultWealth] Unexpected error in loadAnalyticsData:', err);
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
 * Renders Category Comparison Bar Chart
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
        <div style="font-size: 2rem; margin-bottom: 0.5rem; display: flex; justify-content: center;">
          ${typeof getSvgIcon === 'function' ? getSvgIcon('bar-chart', '', { width: 36, height: 36 }) : ''}
        </div>
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
 * Renders Cash Flow (Savings vs Expenses) Pie Chart
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
        <div style="font-size: 2rem; margin-bottom: 0.5rem; display: flex; justify-content: center;">
          ${typeof getSvgIcon === 'function' ? getSvgIcon('scales', '', { width: 36, height: 36 }) : ''}
        </div>
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
function exportMLTransactions() {
  const transactions = JSON.parse(localStorage.getItem('transactions') || '[]');
  if (!transactions.length) {
    alert('No transactions to export.');
    return;
  }
  const csv = ['Date,Description,Amount,Category,Type']
    .concat(transactions.map(t =>
      `${t.date || ''},"${(t.description || '').replace(/"/g, '""')}",${t.amount || 0},${t.category || ''},${t.type || ''}`
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

  alert('Transactions exported as "vaultwealth_ml_transactions.csv"!\n\nTo run the Python ML pipeline on this dataset, run in your terminal:\npython ml/prediction.py --data vaultwealth_ml_transactions.csv');
}
