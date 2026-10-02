/**
 * VaultWealth — Dynamic Dashboard Engine
 * Fetches real user transactions from Supabase and computes live metrics,
 * real Chart.js visualizations, recent activity, and smart insights.
 */

let categoryChartInstance = null;
let trendChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();
  if (!user) return;

  await loadDashboardData();

  // Listen for refresh events (e.g. when user adds transaction via modal)
  window.addEventListener('vaultwealth:refresh', async () => {
    await loadDashboardData();
  });
});

/**
 * Loads real transaction data from Supabase and updates all dashboard modules
 */
async function loadDashboardData() {
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
      console.error('[VaultWealth] Error fetching dashboard transactions:', error);
      return;
    }

    const txList = transactions || [];
    updateMetricCards(txList);
    renderRecentTransactions(txList.slice(0, 5));
    renderCategoryDoughnutChart(txList);
    renderMonthlyTrendChart(txList);
    renderDashboardInsights(txList);

  } catch (err) {
    console.error('[VaultWealth] Unexpected error in loadDashboardData:', err);
  }
}

/**
 * Computes and updates Net Balance, Total Income, Total Expenses, and Savings Rate
 */
function updateMetricCards(transactions) {
  let totalIncome = 0;
  let totalExpense = 0;

  transactions.forEach(tx => {
    const amt = parseFloat(tx.amount) || 0;
    if (tx.type === 'income') {
      totalIncome += amt;
    } else if (tx.type === 'expense') {
      totalExpense += amt;
    }
  });

  const netBalance = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? ((netBalance / totalIncome) * 100).toFixed(1) : 0;

  // DOM Elements
  const balanceEl = document.getElementById('dashNetBalance');
  const incomeEl = document.getElementById('dashTotalIncome');
  const expenseEl = document.getElementById('dashTotalExpense');
  const savingsEl = document.getElementById('dashSavingsRate');

  if (window.RollingNumber) {
    RollingNumber.animate(balanceEl, netBalance);
    RollingNumber.animate(incomeEl, totalIncome);
    RollingNumber.animate(expenseEl, totalExpense);
  } else {
    if (balanceEl) balanceEl.textContent = formatCurrency(netBalance);
    if (incomeEl) incomeEl.textContent = formatCurrency(totalIncome);
    if (expenseEl) expenseEl.textContent = formatCurrency(totalExpense);
  }

  if (savingsEl) {
    if (totalIncome > 0) {
      savingsEl.innerHTML = `<span class="${netBalance >= 0 ? 'stat-trend-up' : 'stat-trend-down'}">${savingsRate}%</span> Savings Rate`;
    } else {
      savingsEl.textContent = 'No income recorded yet';
    }
  }
}

/**
 * Renders the 5 most recent transactions from Supabase
 */
function renderRecentTransactions(recentTxs) {
  const tbody = document.getElementById('recentTransactionsTableBody');
  if (!tbody) return;

  if (recentTxs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
          <div style="font-size: 1.5rem; margin-bottom: 0.25rem;">📝</div>
          No transactions yet. Click <strong>"+ Add Transaction"</strong> to record your first one!
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  recentTxs.forEach(tx => {
    const isIncome = tx.type === 'income';
    const amountClass = isIncome ? 'amount-income' : 'amount-expense';
    const badgeClass = isIncome ? 'badge-income' : 'badge-category';
    const sign = isIncome ? '+' : '-';
    const icon = getCategoryIcon(tx.category, tx.type);
    const dateFormatted = formatDisplayDate(tx.transaction_date);

    html += `
      <tr>
        <td><span class="badge ${badgeClass}">${icon} ${escapeHtml(tx.category)}</span></td>
        <td style="color: var(--text-primary); font-weight: 500;">${escapeHtml(tx.description || '—')}</td>
        <td>${dateFormatted}</td>
        <td style="text-align: right;" class="amount ${amountClass}">
          ${sign} ${formatCurrency(tx.amount)}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

/**
 * Calculates real category breakdown and renders Chart.js Doughnut
 */
function renderCategoryDoughnutChart(transactions) {
  const canvas = document.getElementById('categoryDoughnutChart');
  if (!canvas) return;

  const expenses = transactions.filter(tx => tx.type === 'expense');
  const categoryTotals = {};

  expenses.forEach(tx => {
    const cat = tx.category;
    categoryTotals[cat] = (categoryTotals[cat] || 0) + (parseFloat(tx.amount) || 0);
  });

  const labels = Object.keys(categoryTotals);
  const data = Object.values(categoryTotals);

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
  }

  const container = canvas.parentElement;
  const emptyNoticeId = 'doughnutEmptyNotice';
  let emptyNotice = document.getElementById(emptyNoticeId);

  if (labels.length === 0) {
    canvas.style.display = 'none';
    if (!emptyNotice) {
      emptyNotice = document.createElement('div');
      emptyNotice.id = emptyNoticeId;
      emptyNotice.style.cssText = 'height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); text-align: center; padding: 2rem;';
      emptyNotice.innerHTML = `
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🍩</div>
        <p style="font-size: 0.875rem;">No expenses recorded yet.</p>
        <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Expenses by category will appear here automatically.</p>
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

  // Pre-defined palette for categories matching screenshot accents
  const colorMap = [
    '#0077FE', '#38BDF8', '#FBBF24', '#F87171', '#8B5CF6',
    '#34D399', '#F97316', '#EC4899', '#6366F1', '#94A3B8'
  ];

  categoryChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colorMap.slice(0, labels.length),
        borderColor: '#1D1E22',
        borderWidth: 4,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#9CA3AF',
            boxWidth: 12,
            padding: 10,
            font: { family: 'Inter', size: 11 }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ₹${ctx.raw.toLocaleString('en-IN')}`
          }
        }
      },
      cutout: '68%'
    }
  });
}

/**
 * Groups expenses by month and renders Chart.js Monthly Trend Line
 */
function renderMonthlyTrendChart(transactions) {
  const canvas = document.getElementById('monthlyTrendChart');
  if (!canvas) return;

  const expenses = transactions.filter(tx => tx.type === 'expense');
  const monthTotals = {};

  // Sort chronologically for timeline
  const sorted = [...expenses].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

  sorted.forEach(tx => {
    const monthKey = tx.transaction_date.substring(0, 7); // YYYY-MM
    monthTotals[monthKey] = (monthTotals[monthKey] || 0) + (parseFloat(tx.amount) || 0);
  });

  const monthKeys = Object.keys(monthTotals);
  const data = Object.values(monthTotals);
  const labels = monthKeys.map(k => formatMonthLabel(k));

  if (trendChartInstance) {
    trendChartInstance.destroy();
  }

  const container = canvas.parentElement;
  const emptyNoticeId = 'trendEmptyNotice';
  let emptyNotice = document.getElementById(emptyNoticeId);

  if (monthKeys.length === 0) {
    canvas.style.display = 'none';
    if (!emptyNotice) {
      emptyNotice = document.createElement('div');
      emptyNotice.id = emptyNoticeId;
      emptyNotice.style.cssText = 'height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); text-align: center; padding: 2rem;';
      emptyNotice.innerHTML = `
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">📈</div>
        <p style="font-size: 0.875rem;">No historical expense trend yet.</p>
        <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Your spending curve will render as you log expenses.</p>
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

  trendChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Monthly Expenses',
        data: data,
        borderColor: '#0077FE',
        backgroundColor: 'rgba(0, 119, 254, 0.12)',
        borderWidth: 3,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#0077FE',
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2,
        pointRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#8E92A0', font: { family: 'Inter', size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: {
            color: '#8E92A0',
            font: { family: 'Inter', size: 11 },
            callback: (val) => '₹' + val
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Total: ₹${ctx.raw.toLocaleString('en-IN')}`
          }
        }
      }
    }
  });
}

/**
 * Dynamically computes Smart Insights from user's actual transactions
 */
function renderDashboardInsights(transactions) {
  const container = document.getElementById('dashboardInsightsContainer');
  if (!container) return;

  const expenses = transactions.filter(tx => tx.type === 'expense');
  const incomes = transactions.filter(tx => tx.type === 'income');

  if (transactions.length === 0) {
    container.innerHTML = `
      <div class="insight-card" style="margin-top: 0; padding: 1rem; border-left-color: var(--color-accent);">
        <div class="insight-icon">💡</div>
        <div class="insight-content">
          <h4>Smart Insights Engine</h4>
          <p>Add your income and expense transactions to see automated spending patterns and savings alerts.</p>
        </div>
      </div>
    `;
    return;
  }

  // 1. Calculate top spending category
  const catSums = {};
  let totalExpense = 0;
  expenses.forEach(tx => {
    const amt = parseFloat(tx.amount) || 0;
    catSums[tx.category] = (catSums[tx.category] || 0) + amt;
    totalExpense += amt;
  });

  let topCategory = null;
  let topAmount = 0;
  for (const [cat, amt] of Object.entries(catSums)) {
    if (amt > topAmount) {
      topAmount = amt;
      topCategory = cat;
    }
  }

  let insightsHtml = '';

  if (topCategory && totalExpense > 0) {
    const catPercent = ((topAmount / totalExpense) * 100).toFixed(1);
    insightsHtml += `
      <div class="insight-card warning" style="margin-top: 0; padding: 1rem;">
        <div class="insight-icon">🍔</div>
        <div class="insight-content">
          <h4>Top Spending Category</h4>
          <p><strong>${escapeHtml(topCategory)}</strong> accounts for <strong>${catPercent}%</strong> (${formatCurrency(topAmount)}) of your total expenses.</p>
        </div>
      </div>
    `;
  }

  // 2. Savings Ratio Insight
  let totalIncome = 0;
  incomes.forEach(tx => totalIncome += (parseFloat(tx.amount) || 0));

  if (totalIncome > 0) {
    const netBalance = totalIncome - totalExpense;
    const savingsPercent = ((netBalance / totalIncome) * 100).toFixed(1);

    if (netBalance >= 0) {
      insightsHtml += `
        <div class="insight-card success" style="margin-top: 0; padding: 1rem;">
          <div class="insight-icon">🎯</div>
          <div class="insight-content">
            <h4>Positive Savings Rate</h4>
            <p>You have saved <strong>${savingsPercent}%</strong> of your income so far. Keep it up!</p>
          </div>
        </div>
      `;
    } else {
      insightsHtml += `
        <div class="insight-card danger" style="margin-top: 0; padding: 1rem;">
          <div class="insight-icon">⚠️</div>
          <div class="insight-content">
            <h4>Deficit Warning</h4>
            <p>Your expenses currently exceed your recorded income by <strong>${formatCurrency(Math.abs(netBalance))}</strong>.</p>
          </div>
        </div>
      `;
    }
  }

  container.innerHTML = insightsHtml;
}

/**
 * Format YYYY-MM to "Mon YYYY"
 */
function formatMonthLabel(monthKey) {
  try {
    const [year, month] = monthKey.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(month, 10) - 1]} ${year}`;
  } catch {
    return monthKey;
  }
}
