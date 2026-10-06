/**
 * VaultWealth — Dynamic Dashboard Engine
 * Fetches real user transactions from Supabase and computes live metrics,
 * High-DPI modern SVG visualizations, recent activity, and smart insights.
 */

import { renderModernCategoryBreakdown, renderModernMonthlyTrajectory } from './modern-visuals.js';

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
  if (!client) {
    updateMetricCards([]);
    renderRecentTransactions([]);
    renderCategoryDoughnutChart([]);
    renderMonthlyTrendChart([]);
    renderDashboardInsights([]);
    return;
  }

  const user = await getCurrentUser();
  if (!user) {
    updateMetricCards([]);
    renderRecentTransactions([]);
    renderCategoryDoughnutChart([]);
    renderMonthlyTrendChart([]);
    renderDashboardInsights([]);
    return;
  }

  try {
    const { data: transactions, error } = await client
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false });

    if (error) {
      console.error('[VaultWealth] Error fetching dashboard transactions:', error);
      updateMetricCards([]);
      renderRecentTransactions([]);
      renderCategoryDoughnutChart([]);
      renderMonthlyTrendChart([]);
      renderDashboardInsights([]);
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
    updateMetricCards([]);
    renderRecentTransactions([]);
    renderCategoryDoughnutChart([]);
    renderMonthlyTrendChart([]);
    renderDashboardInsights([]);
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

  if (balanceEl) balanceEl.textContent = formatCurrency(netBalance);
  if (incomeEl) incomeEl.textContent = formatCurrency(totalIncome);
  if (expenseEl) expenseEl.textContent = formatCurrency(totalExpense);

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
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem; display: flex; justify-content: center;">
            ${typeof getSvgIcon === 'function' ? getSvgIcon('memo', '', { width: 32, height: 32 }) : ''}
          </div>
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
 * Renders modern SVG category breakdown and proportional distribution
 */
function renderCategoryDoughnutChart(transactions) {
  const container = document.getElementById('categoryChartContainer');
  if (!container) return;
  renderModernCategoryBreakdown(container, transactions);
}

/**
 * Renders modern SVG monthly trajectory spline with live scrubber
 */
function renderMonthlyTrendChart(transactions) {
  const container = document.getElementById('monthlyTrendContainer');
  if (!container) return;
  renderModernMonthlyTrajectory(container, transactions);
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
        <div class="insight-icon">${typeof getSvgIcon === 'function' ? getSvgIcon('lightbulb') : ''}</div>
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
        <div class="insight-icon">${typeof getSvgIcon === 'function' ? getSvgIcon('food') : ''}</div>
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
          <div class="insight-icon">${typeof getSvgIcon === 'function' ? getSvgIcon('target') : ''}</div>
          <div class="insight-content">
            <h4>Positive Savings Rate</h4>
            <p>You have saved <strong>${savingsPercent}%</strong> of your income so far. Keep it up!</p>
          </div>
        </div>
      `;
    } else {
      insightsHtml += `
        <div class="insight-card danger" style="margin-top: 0; padding: 1rem;">
          <div class="insight-icon">${typeof getSvgIcon === 'function' ? getSvgIcon('warning') : ''}</div>
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
