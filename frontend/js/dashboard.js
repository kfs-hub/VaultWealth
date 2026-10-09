/**
 * VaultWealth — Dynamic Dashboard Engine
 * Fetches real user transactions from Supabase and computes live metrics,
 * High-DPI modern SVG visualizations, recent activity, and smart insights.
 */

import { renderModernCategoryBreakdown, renderModernMonthlyTrajectory } from './modern-visuals.js';

let currentDashboardTx = [];
let currentDashboardSubs = [];

function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

onReady(async () => {
  renderDashboardSkeletons();
  const user = await requireAuth();
  if (!user) return;

  await loadDashboardData();

  // Listen for refresh events (e.g. when user adds transaction via modal)
  window.addEventListener('vaultwealth:refresh', async () => {
    renderDashboardSkeletons();
    await loadDashboardData();
  });
});

/**
 * Injects skeleton placeholders across all dashboard widgets while fetching
 */
function renderDashboardSkeletons() {
  const balanceEl = document.getElementById('dashNetBalance');
  const incomeEl = document.getElementById('dashTotalIncome');
  const expenseEl = document.getElementById('dashTotalExpense');
  const savingsEl = document.getElementById('dashSavingsRate');
  const incomeFooterEl = document.getElementById('dashIncomeFooter');
  const expenseFooterEl = document.getElementById('dashExpenseFooter');
  const burnEl = document.getElementById('dashMonthlySubBurn');
  const countEl = document.getElementById('dashActiveSubsCount');
  const tbody = document.getElementById('recentTransactionsTableBody');
  const renewals = document.getElementById('dashboardUpcomingSubsList');
  const insights = document.getElementById('dashboardInsightsContainer');

  if (balanceEl) balanceEl.innerHTML = '<span class="skeleton skeleton-metric" style="width: 120px;"></span>';
  if (incomeEl) incomeEl.innerHTML = '<span class="skeleton skeleton-metric" style="width: 110px;"></span>';
  if (expenseEl) expenseEl.innerHTML = '<span class="skeleton skeleton-metric" style="width: 110px;"></span>';
  if (savingsEl) savingsEl.innerHTML = '<span class="skeleton skeleton-text-sm" style="width: 140px;"></span>';
  if (incomeFooterEl) incomeFooterEl.innerHTML = '<span class="skeleton skeleton-text-sm" style="width: 140px;"></span>';
  if (expenseFooterEl) expenseFooterEl.innerHTML = '<span class="skeleton skeleton-text-sm" style="width: 140px;"></span>';
  if (burnEl) burnEl.innerHTML = '<span class="skeleton skeleton-metric" style="width: 100px;"></span>';
  if (countEl) countEl.innerHTML = '<span class="skeleton skeleton-text-sm" style="width: 140px;"></span>';

  if (tbody && window.SkeletonTemplates) {
    tbody.innerHTML = window.SkeletonTemplates.tableRows(4, 4);
  }
  if (renewals && window.SkeletonTemplates) {
    renewals.innerHTML = window.SkeletonTemplates.renewalItems(2);
  }
  if (insights && window.SkeletonTemplates) {
    insights.innerHTML = window.SkeletonTemplates.insightCards(2);
  }
}

/**
 * Loads real transaction data from Supabase and updates all dashboard modules
 */
async function loadDashboardData() {
  window.VaultLoader?.start();
  renderDashboardSkeletons();

  const client = getSupabaseClient();
  if (!client) {
    updateMetricCards([]);
    renderRecentTransactions([]);
    renderCategoryDoughnutChart([]);
    renderMonthlyTrendChart([]);
    renderDashboardInsights([]);
    window.VaultLoader?.done();
    return;
  }

  const user = await getCurrentUser();
  if (!user) {
    updateMetricCards([]);
    renderRecentTransactions([]);
    renderCategoryDoughnutChart([]);
    renderMonthlyTrendChart([]);
    renderDashboardInsights([]);
    window.VaultLoader?.done();
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
    currentDashboardTx = txList;
    updateMetricCards(txList);
    renderRecentTransactions(txList.slice(0, 5));
    renderCategoryDoughnutChart(txList);
    renderMonthlyTrendChart(txList);
    renderDashboardInsights(txList, currentDashboardSubs);

    // Load and update subscription metrics and renewals widget
    await loadDashboardSubscriptions(client, user);

  } catch (err) {
    console.error('[VaultWealth] Unexpected error in loadDashboardData:', err);
    updateMetricCards([]);
    renderRecentTransactions([]);
    renderCategoryDoughnutChart([]);
    renderMonthlyTrendChart([]);
    renderDashboardInsights([]);
    await loadDashboardSubscriptions(null, null);
  } finally {
    window.VaultLoader?.done();
  }
}

/**
 * Computes and updates Net Balance, Total Income, Total Expenses, and Savings Rate
 */
function updateMetricCards(transactions) {
  let totalIncome = 0;
  let totalExpense = 0;
  let curMonthIncome = 0;
  let curMonthExpense = 0;
  let incomeTxCount = 0;
  let expenseTxCount = 0;

  const now = new Date();
  const currentYearMonth = now.toISOString().substring(0, 7); // "YYYY-MM"

  transactions.forEach(tx => {
    const amt = parseFloat(tx.amount) || 0;
    const yyyymm = tx.transaction_date ? tx.transaction_date.substring(0, 7) : '';
    if (tx.type === 'income') {
      totalIncome += amt;
      incomeTxCount++;
      if (yyyymm === currentYearMonth) {
        curMonthIncome += amt;
      }
    } else if (tx.type === 'expense') {
      totalExpense += amt;
      expenseTxCount++;
      if (yyyymm === currentYearMonth) {
        curMonthExpense += amt;
      }
    }
  });

  const netBalance = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? ((netBalance / totalIncome) * 100).toFixed(1) : 0;

  // DOM Elements
  const balanceEl = document.getElementById('dashNetBalance');
  const incomeEl = document.getElementById('dashTotalIncome');
  const expenseEl = document.getElementById('dashTotalExpense');
  const savingsEl = document.getElementById('dashSavingsRate');
  const incomeFooterEl = document.getElementById('dashIncomeFooter');
  const expenseFooterEl = document.getElementById('dashExpenseFooter');

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

  // Stat footer for Total Income
  if (incomeFooterEl) {
    if (totalIncome > 0) {
      incomeFooterEl.innerHTML = `<span><span style="color: #34d399; font-weight: 600;">${formatCurrency(curMonthIncome)}</span> this month · ${incomeTxCount} deposit${incomeTxCount === 1 ? '' : 's'}</span>`;
    } else {
      incomeFooterEl.textContent = '0 deposits recorded';
    }
  }

  // Stat footer for Total Expenses
  if (expenseFooterEl) {
    if (totalExpense > 0) {
      expenseFooterEl.innerHTML = `<span><span style="color: #fb7185; font-weight: 600;">${formatCurrency(curMonthExpense)}</span> this month · ${expenseTxCount} outflow${expenseTxCount === 1 ? '' : 's'}</span>`;
    } else {
      expenseFooterEl.textContent = '0 expenses recorded';
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
function renderDashboardInsights(transactions, subscriptions = currentDashboardSubs) {
  const container = document.getElementById('dashboardInsightsContainer');
  if (!container) return;

  if (window.SmartInsightsEngine) {
    window.SmartInsightsEngine.renderDashboardWidget(transactions, subscriptions);
  } else {
    container.innerHTML = `
      <div class="insight-card">
        <div class="insight-icon">${typeof getSvgIcon === 'function' ? getSvgIcon('lightbulb') : ''}</div>
        <div class="insight-content">
          <h4>Smart Insights Engine</h4>
          <p>Analyzing transaction velocity, budget pacing, and subscription renewals...</p>
        </div>
      </div>
    `;
  }
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

/**
 * Loads subscriptions for dashboard overview & upcoming renewals widget
 */
async function loadDashboardSubscriptions(client, user) {
  let subs = [];
  if (client && user) {
    try {
      const { data, error } = await client
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('next_billing_date', { ascending: true });
      if (!error && data) {
        subs = data;
      }
    } catch {
      subs = [];
    }
  } else {
    const raw = localStorage.getItem('vaultwealth_subscriptions');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        subs = Array.isArray(parsed) ? parsed.filter(s => !String(s.id).startsWith('sub-mock-')) : [];
      } catch {
        subs = [];
      }
    }
  }

  currentDashboardSubs = subs;
  updateSubscriptionMetrics(subs);
  renderDashboardUpcomingRenewals(subs);
  renderDashboardInsights(currentDashboardTx, subs);
}

function updateSubscriptionMetrics(subs) {
  let monthlyBurn = 0;
  let activeCount = 0;

  subs.forEach(s => {
    if (s.status === 'active') {
      activeCount++;
      const amt = parseFloat(s.amount) || 0;
      switch (s.billing_cycle) {
        case 'weekly': monthlyBurn += amt * (52 / 12); break;
        case 'monthly': monthlyBurn += amt; break;
        case 'quarterly': monthlyBurn += amt / 3; break;
        case 'yearly': monthlyBurn += amt / 12; break;
        case 'custom': monthlyBurn += amt * (30 / (s.custom_cycle_days || 30)); break;
        default: monthlyBurn += amt; break;
      }
    }
  });

  const burnEl = document.getElementById('dashMonthlySubBurn');
  if (burnEl) burnEl.textContent = formatCurrency(monthlyBurn);

  const countEl = document.getElementById('dashActiveSubsCount');
  if (countEl) countEl.innerHTML = `<span style="color: #a5b4fc;">${activeCount} Active</span> Recurring Services`;
}

function renderDashboardUpcomingRenewals(subs) {
  const container = document.getElementById('dashboardUpcomingSubsList');
  if (!container) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeSubs = subs
    .filter(s => s.status === 'active')
    .sort((a, b) => new Date(a.next_billing_date) - new Date(b.next_billing_date))
    .slice(0, 4);

  if (activeSubs.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
        No upcoming renewals found. <a href="/subscriptions" style="color: var(--brand-primary); text-decoration: underline;">Add a subscription</a> to start tracking.
      </div>`;
    return;
  }

  container.innerHTML = activeSubs.map(s => {
    const target = new Date(s.next_billing_date + 'T00:00:00');
    const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    const dayLabel = diffDays <= 0 ? 'Due Today' : diffDays === 1 ? 'Due Tomorrow' : `In ${diffDays} days`;
    const logoUrl = typeof getSubscriptionLogo === 'function' 
      ? getSubscriptionLogo(s) 
      : '/assets/subscriptions/default-subscription.svg';

    return `
      <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 1rem 1.15rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; cursor: pointer; transition: all 0.2s ease;" onclick="window.location.href='/subscriptions'">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div style="width: 38px; height: 38px; border-radius: 11px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 6px; overflow: hidden;">
            <img src="${logoUrl}" alt="${escapeHtml(s.name)}" style="width: 100%; height: 100%; object-fit: contain; ${logoUrl.includes('apple.svg') ? 'filter: brightness(0) invert(1);' : ''}" loading="lazy" onerror="this.src='/assets/subscriptions/default-subscription.svg'">
          </div>
          <div>
            <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">${escapeHtml(s.name)}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${formatDisplayDate(s.next_billing_date)} · ${escapeHtml(s.billing_cycle)}</div>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">${formatCurrency(s.amount)}</div>
          <span style="display: inline-block; padding: 0.15rem 0.45rem; border-radius: 999px; font-size: 0.68rem; font-weight: 600; background: ${diffDays <= 3 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(99, 102, 241, 0.12)'}; color: ${diffDays <= 3 ? '#fbbf24' : '#a5b4fc'};">
            ${dayLabel}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

