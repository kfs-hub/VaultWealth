/**
 * VaultWealth — Subscription Tracker Engine
 * Phase 15: Subscriptions Management, Renewal Processing & Spend Analytics
 */

// Global State
let subscriptionsList = [];
let activeSubFilter = 'all';      // 'all' | 'active' | 'paused' | 'cancelled' | 'expired'
let activeCycleFilter = 'all';    // 'all' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'
let activeSearchQuery = '';
let activeSortOrder = 'date_asc'; // 'date_asc' | 'amount_desc' | 'name_asc'
let activeViewMode = 'grid';      // 'grid' | 'table'
let currentEditSubId = null;
let subCategoryChart = null;
let chartGroupMode = 'service';   // 'service' | 'category'
let activeChartFilter = null;     // selected label to filter by

function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

onReady(async () => {
  // 1. Enforce authentication guard
  const user = await requireAuth();

  // 2. Setup event listeners
  initSubEventListeners();

  // 3. Clean up runaway recursive subscriptions and process due renewals
  if (user) {
    await cleanupRunawaySubscriptions(user.id);
    await processSubscriptionRenewals(user.id);
  } else {
    cleanupLocalRunawaySubscriptions();
    processLocalRenewalsFallback(new Date().toISOString().split('T')[0]);
  }

  // 4. Load & render subscriptions
  await loadSubscriptions();

  // 5. Check and display proactive renewal reminders (in-app toasts & native device push)
  checkAndDisplayRenewalToasts();

  // 6. Initialize Device Notification Prompt Banner & Header Status
  initDeviceNotificationBanner();
});

window.addEventListener('vaultwealth:notif-permission-changed', () => {
  initDeviceNotificationBanner();
});

// =============================================================================
// 1. Math Normalization & Date Calculation Helpers
// =============================================================================

/**
 * Normalizes any billing cycle amount to an equivalent monthly value.
 */
function normalizeToMonthly(amount, cycle, customDays) {
  const num = parseFloat(amount) || 0;
  switch (cycle) {
    case 'weekly':
      return num * (52 / 12);
    case 'monthly':
      return num;
    case 'quarterly':
      return num / 3;
    case 'yearly':
      return num / 12;
    case 'custom': {
      const days = parseInt(customDays, 10) || 30;
      return num * (30 / days);
    }
    default:
      return num;
  }
}

/**
 * Normalizes any billing cycle amount to an equivalent annual value.
 */
function normalizeToAnnual(amount, cycle, customDays) {
  return normalizeToMonthly(amount, cycle, customDays) * 12;
}

/**
 * Calculates days remaining from today until target date.
 */
function getDaysUntil(dateStr) {
  if (!dateStr) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  const diffTime = target.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Safely computes the next billing date rolled forward by one cycle.
 * Prevents month-boundary overflow (e.g. Jan 31 + 1 month safely becomes Feb 28).
 */
function advanceBillingDate(currentDateStr, cycle, customDays) {
  const parts = currentDateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const d = new Date(year, month, day);

  switch (cycle) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly': {
      const expectedMonth = (d.getMonth() + 1) % 12;
      d.setMonth(d.getMonth() + 1);
      // Overflow handling
      if (d.getMonth() !== expectedMonth) {
        d.setDate(0);
      }
      break;
    }
    case 'quarterly': {
      const expectedMonth = (d.getMonth() + 3) % 12;
      d.setMonth(d.getMonth() + 3);
      if (d.getMonth() !== expectedMonth) {
        d.setDate(0);
      }
      break;
    }
    case 'yearly': {
      d.setFullYear(d.getFullYear() + 1);
      break;
    }
    case 'custom': {
      const days = parseInt(customDays, 10) || 30;
      d.setDate(d.getDate() + days);
      break;
    }
    default:
      d.setMonth(d.getMonth() + 1);
  }

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayStr}`;
}

// =============================================================================
// 2. Auto-Renewal Processing Engine (Background / On-Load Reconciliation)
// =============================================================================

/**
 * Automatically cleans up runaway duplicate subscriptions that were spawned
 * by recursive renewal triggers, and purges them from both Supabase and localStorage.
 */
async function cleanupRunawaySubscriptions(userId) {
  cleanupLocalRunawaySubscriptions();

  const client = getSupabaseClient();
  if (client && userId) {
    try {
      // Purge any subscription whose name contains '(Recurring renewal)'
      await client
        .from('subscriptions')
        .delete()
        .eq('user_id', userId)
        .ilike('name', '%(Recurring renewal)%');

      // Purge duplicate chained runaway transactions
      await client
        .from('transactions')
        .delete()
        .eq('user_id', userId)
        .ilike('description', '%(Recurring renewal)%(Recurring renewal)%');
    } catch (e) {
      console.warn('[VaultWealth] Cleanup warning:', e);
    }
  }
}

function cleanupLocalRunawaySubscriptions() {
  try {
    const raw = localStorage.getItem('vaultwealth_subscriptions');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const cleaned = list.filter(s => {
          const name = (s.name || '').toLowerCase();
          return !name.includes('(recurring renewal)') && !name.includes('recurring renewal');
        });
        if (cleaned.length !== list.length) {
          localStorage.setItem('vaultwealth_subscriptions', JSON.stringify(cleaned));
        }
      }
    }
  } catch (e) {
    console.warn('[VaultWealth] Local cleanup error:', e);
  }
}

/**
 * Iterates through active subscriptions. If `next_billing_date <= today` and
 * `auto_create_transaction = true`, an expense transaction is automatically generated
 * and `next_billing_date` is rolled forward into the future.
 */
async function processSubscriptionRenewals(userId) {
  const client = getSupabaseClient();
  const todayStr = new Date().toISOString().split('T')[0];

  if (!client || !userId) {
    processLocalRenewalsFallback(todayStr);
    return;
  }

  try {
    const { data: dueSubs, error } = await client
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('auto_create_transaction', true)
      .lte('next_billing_date', todayStr);

    if (error || !dueSubs || dueSubs.length === 0) return;

    for (const sub of dueSubs) {
      // Guard: Never process runaway renewal cards
      const subName = (sub.name || '').trim();
      if (subName.toLowerCase().includes('(recurring renewal)')) {
        continue;
      }

      // Roll next_billing_date strictly into the future to avoid repeated loops
      let nextDate = sub.next_billing_date;
      while (nextDate <= todayStr) {
        nextDate = advanceBillingDate(nextDate, sub.billing_cycle, sub.custom_cycle_days);
      }
      let updatedStatus = sub.status;
      if (sub.end_date && nextDate > sub.end_date) {
        updatedStatus = 'expired';
      }

      // 1. Advance next_billing_date in database FIRST
      await client
        .from('subscriptions')
        .update({
          next_billing_date: nextDate,
          status: updatedStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', sub.id)
        .eq('user_id', userId);

      // Clean the subscription name for the transaction description
      const cleanName = subName.replace(/\s*\(Recurring renewal\)/gi, '').trim() || 'Subscription';

      // 2. Insert expense transaction into transactions table with current date
      const txPayload = {
        user_id: userId,
        type: 'expense',
        amount: parseFloat(sub.amount),
        category: sub.category || 'Subscriptions',
        description: `${cleanName} (Recurring renewal)`,
        transaction_date: todayStr
      };

      const { error: txErr } = await client.from('transactions').insert([txPayload]);
      if (txErr) {
        console.error('[VaultWealth] Error creating subscription transaction:', txErr);
      }
    }

    // Notify other components (dashboard & transactions) to refresh
    window.dispatchEvent(new CustomEvent('vaultwealth:refresh'));
  } catch (err) {
    console.error('[VaultWealth] Subscription renewal engine error:', err);
  }
}

// Expose globally so dashboard and transactions can call it
window.processSubscriptionRenewals = processSubscriptionRenewals;

function processLocalRenewalsFallback(todayStr) {
  cleanupLocalRunawaySubscriptions();
  const raw = localStorage.getItem('vaultwealth_subscriptions');
  if (!raw) return;
  try {
    let subs = JSON.parse(raw);
    let changed = false;
    subs.forEach(s => {
      if ((s.name || '').toLowerCase().includes('(recurring renewal)')) return;
      if (s.status === 'active' && s.auto_create_transaction && s.next_billing_date <= todayStr) {
        while (s.next_billing_date <= todayStr) {
          s.next_billing_date = advanceBillingDate(s.next_billing_date, s.billing_cycle, s.custom_cycle_days);
        }
        if (s.end_date && s.next_billing_date > s.end_date) {
          s.status = 'expired';
        }
        changed = true;
      }
    });
    if (changed) {
      localStorage.setItem('vaultwealth_subscriptions', JSON.stringify(subs));
    }
  } catch (e) {
    console.warn(e);
  }
}

// Clean up any legacy mock entries from local storage
try {
  const raw = localStorage.getItem('vaultwealth_subscriptions');
  if (raw && raw.includes('sub-mock-')) {
    const parsed = JSON.parse(raw);
    const cleaned = Array.isArray(parsed) ? parsed.filter(s => !String(s.id).startsWith('sub-mock-')) : [];
    localStorage.setItem('vaultwealth_subscriptions', JSON.stringify(cleaned));
  }
} catch (e) {}

// =============================================================================
// 3. Data Fetching & Local Persistence
// =============================================================================

async function loadSubscriptions() {
  const client = getSupabaseClient();
  const user = await getCurrentUser();

  if (client && user) {
    try {
      const { data, error } = await client
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('next_billing_date', { ascending: true });

      if (error) {
        console.warn('[VaultWealth] Supabase query error, fallback to local storage:', error);
        loadLocalSubscriptions();
      } else {
        subscriptionsList = (data || []).filter(s => !(s.name || '').toLowerCase().includes('(recurring renewal)'));
      }
    } catch (err) {
      console.warn('[VaultWealth] Error fetching subscriptions:', err);
      loadLocalSubscriptions();
    }
  } else {
    loadLocalSubscriptions();
  }

  // Render all UI views
  renderAllViews();
}

function loadLocalSubscriptions() {
  const stored = localStorage.getItem('vaultwealth_subscriptions');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      subscriptionsList = Array.isArray(parsed)
        ? parsed.filter(s => !String(s.id).startsWith('sub-mock-') && !(s.name || '').toLowerCase().includes('(recurring renewal)'))
        : [];
    } catch {
      subscriptionsList = [];
    }
  } else {
    subscriptionsList = [];
  }
}

function saveLocalSubscriptions() {
  localStorage.setItem('vaultwealth_subscriptions', JSON.stringify(subscriptionsList));
}

// =============================================================================
// 4. UI Rendering Functions
// =============================================================================

function renderAllViews() {
  renderSummaryMetrics();
  renderUpcomingTimeline();
  renderSubscriptionsList();
  renderCategoryDonut();
}

/**
 * 4.1 Summary Metric Cards
 */
function renderSummaryMetrics() {
  let totalMonthlyBurn = 0;
  let activeCount = 0;
  let pausedCount = 0;
  let nextImmediateSub = null;
  let minDays = 9999;

  const today = new Date().toISOString().split('T')[0];

  subscriptionsList.forEach(sub => {
    if (sub.status === 'active') {
      const normMonthly = normalizeToMonthly(sub.amount, sub.billing_cycle, sub.custom_cycle_days);
      totalMonthlyBurn += normMonthly;
      activeCount++;

      const days = getDaysUntil(sub.next_billing_date);
      if (days >= 0 && days < minDays) {
        minDays = days;
        nextImmediateSub = sub;
      }
    } else if (sub.status === 'paused') {
      pausedCount++;
    }
  });

  const totalAnnual = totalMonthlyBurn * 12;

  // Monthly Burn
  const burnEl = document.getElementById('metricMonthlyBurn');
  if (burnEl) burnEl.textContent = formatCurrency(totalMonthlyBurn);

  // Annual Run Rate
  const annualEl = document.getElementById('metricAnnualRunRate');
  if (annualEl) annualEl.textContent = formatCurrency(totalAnnual);

  // Active Count
  const countEl = document.getElementById('metricActiveCount');
  if (countEl) countEl.textContent = `${activeCount} Active`;
  const countSubtext = document.getElementById('metricActiveSubtext');
  if (countSubtext) countSubtext.textContent = `${pausedCount} paused · ${subscriptionsList.length} total`;

  // Next Immediate Renewal
  const nextValEl = document.getElementById('metricNextRenewal');
  const nextSubtextEl = document.getElementById('metricNextSubtext');
  if (nextImmediateSub) {
    const days = getDaysUntil(nextImmediateSub.next_billing_date);
    const dayLabel = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days} days`;
    if (nextValEl) nextValEl.textContent = nextImmediateSub.name;
    if (nextSubtextEl) {
      nextSubtextEl.textContent = `${dayLabel} · ${formatCurrency(nextImmediateSub.amount)}`;
    }
  } else {
    if (nextValEl) nextValEl.textContent = 'None pending';
    if (nextSubtextEl) nextSubtextEl.textContent = 'No active renewals scheduled';
  }
}

/**
 * 4.2 Upcoming Renewals 30-Day Strip
 */
function renderUpcomingTimeline() {
  const stripEl = document.getElementById('upcomingTimelineStrip');
  if (!stripEl) return;

  const upcoming = subscriptionsList
    .filter(s => s.status === 'active')
    .sort((a, b) => new Date(a.next_billing_date) - new Date(b.next_billing_date))
    .slice(0, 8);

  if (upcoming.length === 0) {
    stripEl.innerHTML = `
      <div style="padding: 1.25rem; color: var(--text-muted); font-size: 0.85rem;">
        No active renewals due in the upcoming 30 days.
      </div>`;
    return;
  }

  stripEl.innerHTML = upcoming.map(sub => {
    const days = getDaysUntil(sub.next_billing_date);
    let chipClass = 'chip-normal';
    let chipText = `in ${days} days`;

    if (days < 0) {
      chipClass = 'chip-danger';
      chipText = 'Overdue';
    } else if (days === 0) {
      chipClass = 'chip-danger';
      chipText = 'Due Today';
    } else if (days <= 3) {
      chipClass = 'chip-warning';
      chipText = days === 1 ? 'Tomorrow' : `in ${days} days`;
    }

    const brand = detectBrandInfo(sub.name);
    const brandColor = sub.brand_color || brand.color;
    const brandLetter = brand.letter;

    return `
      <div class="timeline-pill-card ${days <= 3 ? 'imminent' : ''}" onclick="openEditSubscription('${sub.id}')">
        <div class="timeline-pill-top">
          <div class="timeline-brand-box">
            <div class="brand-badge-circle" style="background: ${brandColor};">
              ${escapeHtml(brandLetter)}
            </div>
            <div>
              <div class="timeline-sub-name" title="${escapeHtml(sub.name)}">${escapeHtml(sub.name)}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">${formatDisplayDate(sub.next_billing_date)}</div>
            </div>
          </div>
          <div class="timeline-sub-cost">${formatCurrency(sub.amount)}</div>
        </div>
        <div class="timeline-pill-bottom">
          <span class="days-left-chip ${chipClass}">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            ${chipText}
          </span>
          <span style="text-transform: capitalize;">${escapeHtml(sub.billing_cycle)}</span>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * 4.3 Subscriptions Cards Grid & Table View
 */
function renderSubscriptionsList() {
  const gridEl = document.getElementById('subscriptionsGrid');
  const tableBody = document.getElementById('subscriptionsTableBody');
  const countBadge = document.getElementById('subListCount');

  // Filter & Search
  let filtered = subscriptionsList.filter(sub => {
    // Status filter
    if (activeSubFilter !== 'all' && sub.status !== activeSubFilter) return false;
    // Cycle filter
    if (activeCycleFilter !== 'all' && sub.billing_cycle !== activeCycleFilter) return false;
    // Interactive chart filter
    if (activeChartFilter) {
      if (chartGroupMode === 'service') {
        if (sub.name !== activeChartFilter) return false;
      } else {
        const cat = sub.category || 'Subscriptions';
        if (cat !== activeChartFilter) return false;
      }
    }
    // Search query
    if (activeSearchQuery) {
      const q = activeSearchQuery.toLowerCase();
      const matchName = sub.name.toLowerCase().includes(q);
      const matchDesc = (sub.description || '').toLowerCase().includes(q);
      const matchCat = (sub.category || '').toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchCat) return false;
    }
    return true;
  });

  // Sorting
  filtered.sort((a, b) => {
    if (activeSortOrder === 'date_asc') {
      return new Date(a.next_billing_date) - new Date(b.next_billing_date);
    }
    if (activeSortOrder === 'amount_desc') {
      return parseFloat(b.amount) - parseFloat(a.amount);
    }
    if (activeSortOrder === 'name_asc') {
      return a.name.localeCompare(b.name);
    }
    return 0;
  });

  if (countBadge) {
    countBadge.textContent = `${filtered.length} found`;
  }

  // Active Chart Filter Tag in UI
  const filterPill = document.getElementById('chartActiveFilterPill');
  const filterText = document.getElementById('chartActiveFilterText');
  if (filterPill && filterText) {
    if (activeChartFilter) {
      filterText.textContent = `Filtered by ${chartGroupMode === 'service' ? 'Service' : 'Category'}: ${activeChartFilter}`;
      filterPill.style.display = 'block';
    } else {
      filterPill.style.display = 'none';
    }
  }

  // Handle Empty State
  if (filtered.length === 0) {
    const emptyHtml = `
      <div class="sub-empty-state">
        <div class="sub-empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </div>
        <div class="sub-empty-title">No subscriptions found</div>
        <div class="sub-empty-desc">
          ${activeSearchQuery || activeSubFilter !== 'all' || activeCycleFilter !== 'all'
            ? 'Try adjusting your search terms or active filters.'
            : 'Add your recurring expenses like Netflix, Spotify, or Gym to keep track of renewal dates and monthly commitments.'}
        </div>
        <button class="btn btn-primary btn-sm" onclick="openTransactionModalWithSubscription()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Add Subscription
        </button>
      </div>
    `;

    if (gridEl) gridEl.innerHTML = emptyHtml;
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">No subscriptions match criteria.</td></tr>`;
    return;
  }

  // Render Grid
  if (gridEl) {
    gridEl.innerHTML = filtered.map(sub => {
      const brand = detectBrandInfo(sub.name);
      const brandColor = sub.brand_color || brand.color;
      const brandLetter = brand.letter;
      const normMonthly = normalizeToMonthly(sub.amount, sub.billing_cycle, sub.custom_cycle_days);
      const days = getDaysUntil(sub.next_billing_date);

      let cycleLabel = sub.billing_cycle;
      if (sub.billing_cycle === 'custom') {
        cycleLabel = `Every ${sub.custom_cycle_days || 30}d`;
      }

      return `
        <div class="sub-card" data-sub-id="${sub.id}">
          <div class="sub-card-header">
            <div class="sub-card-brand-wrapper">
              <div class="sub-card-brand-icon" style="background: ${brandColor};">
                ${escapeHtml(brandLetter)}
              </div>
              <div class="sub-card-identity">
                <span class="sub-card-title">${escapeHtml(sub.name)}</span>
                <span class="sub-card-cat-badge">
                  <span style="width: 6px; height: 6px; border-radius: 50%; background: ${brandColor};"></span>
                  ${escapeHtml(sub.category || 'Subscriptions')}
                </span>
              </div>
            </div>
            <span class="sub-status-badge ${sub.status}">
              ${escapeHtml(sub.status)}
            </span>
          </div>

          <div class="sub-card-price-row">
            <div>
              <span class="sub-card-price-amount">${formatCurrency(sub.amount)}</span>
              <span class="sub-card-cycle-tag">/ ${escapeHtml(cycleLabel)}</span>
            </div>
            <div class="sub-card-norm-monthly" title="Normalized monthly cost">
              ≈ ${formatCurrency(normMonthly)}/mo
            </div>
          </div>

          <div class="sub-card-meta-list">
            <div class="sub-card-meta-item">
              <span>Next Renewal</span>
              <span class="sub-card-meta-value">${formatDisplayDate(sub.next_billing_date)} (${days < 0 ? `${Math.abs(days)}d overdue` : (days === 0 ? 'Today' : `in ${days}d`)})</span>
            </div>
            <div class="sub-card-meta-item">
              <span>Payment Via</span>
              <span class="sub-card-meta-value">${escapeHtml(sub.payment_method || 'Card')}</span>
            </div>
            <div class="sub-card-meta-item">
              <span>Auto-Log Transaction</span>
              <span class="sub-card-meta-value">${sub.auto_create_transaction ? '<span style="display:inline-flex;align-items:center;gap:3px;color:#34d399;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>Enabled</span>' : 'Off'}</span>
            </div>
          </div>

          <div class="sub-card-actions">
            <button class="btn-sub-action btn-log-now" onclick="logExpenseNow('${sub.id}')" title="Record expense right now & advance cycle">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Log Expense
            </button>
            <button class="btn-sub-menu" onclick="toggleSubStatus('${sub.id}')" title="${sub.status === 'active' ? 'Pause' : 'Activate'} subscription">
              ${sub.status === 'active'
                ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>'
                : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'}
            </button>
            <button class="btn-sub-menu" onclick="openEditSubscription('${sub.id}')" title="Edit subscription">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
              </svg>
            </button>
            <button class="btn-sub-menu" onclick="deleteSubscriptionConfirm('${sub.id}')" title="Delete subscription">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Render Table View
  if (tableBody) {
    tableBody.innerHTML = filtered.map(sub => {
      const brand = detectBrandInfo(sub.name);
      const brandColor = sub.brand_color || brand.color;
      const normMonthly = normalizeToMonthly(sub.amount, sub.billing_cycle, sub.custom_cycle_days);
      const days = getDaysUntil(sub.next_billing_date);

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span class="brand-badge-circle" style="width: 28px; height: 28px; font-size: 0.75rem; background: ${brandColor};">
                ${escapeHtml(brand.letter)}
              </span>
              <div>
                <strong style="color: var(--text-primary);">${escapeHtml(sub.name)}</strong>
                <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(sub.category || 'Subscriptions')}</div>
              </div>
            </div>
          </td>
          <td>
            <span style="font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--text-primary);">
              ${formatCurrency(sub.amount)}
            </span>
            <span style="font-size: 0.75rem; color: var(--text-muted);">/ ${escapeHtml(sub.billing_cycle)}</span>
          </td>
          <td>
            <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; color: var(--text-secondary);">
              ${formatCurrency(normMonthly)}/mo
            </span>
          </td>
          <td>
            <div>${formatDisplayDate(sub.next_billing_date)}</div>
            <div style="font-size: 0.72rem; color: ${days < 0 ? '#ef4444' : (days <= 3 ? '#fbbf24' : 'var(--text-muted)')}; font-weight: ${days <= 3 ? '600' : 'normal'};">
              ${days < 0 ? `${Math.abs(days)}d Overdue` : (days === 0 ? 'Due Today' : `${days} days left`)}
            </div>
          </td>
          <td>
            <span class="sub-status-badge ${sub.status}">${escapeHtml(sub.status)}</span>
          </td>
          <td style="text-align: right;">
            <div style="display: inline-flex; gap: 0.35rem;">
              <button class="btn-sub-menu" onclick="logExpenseNow('${sub.id}')" title="Log expense">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </button>
              <button class="btn-sub-menu" onclick="openEditSubscription('${sub.id}')" title="Edit">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
              </button>
              <button class="btn-sub-menu" onclick="deleteSubscriptionConfirm('${sub.id}')" title="Delete">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
}

/**
 * 4.4 Interactive Spend Breakdown Donut Chart (Chart.js)
 */
function renderCategoryDonut() {
  const canvas = document.getElementById('subCategoryDonutCanvas');
  if (!canvas || typeof Chart === 'undefined') return;

  const titleEl = document.getElementById('chartTitleText');
  const btnService = document.getElementById('btnChartByService');
  const btnCat = document.getElementById('btnChartByCategory');

  if (titleEl) {
    titleEl.textContent = chartGroupMode === 'service'
      ? 'Spend by Service (Monthly Burn)'
      : 'Spend by Category (Monthly Burn)';
  }
  if (btnService) btnService.classList.toggle('active', chartGroupMode === 'service');
  if (btnCat) btnCat.classList.toggle('active', chartGroupMode === 'category');

  const groupTotals = {};
  const groupColors = {};

  const defaultPalette = [
    '#6366f1', '#06b6d4', '#10b981', '#f59e0b',
    '#ec4899', '#8b5cf6', '#3b82f6', '#f43f5e',
    '#14b8a6', '#f97316', '#a855f7', '#0ea5e9'
  ];

  const categoryColorMap = {
    'Subscriptions': '#6366f1',
    'Entertainment': '#ec4899',
    'Bills & Utilities': '#f59e0b',
    'Healthcare': '#10b981',
    'Education': '#06b6d4',
    'Shopping': '#8b5cf6',
    'Transport': '#3b82f6',
    'Other': '#64748b'
  };

  const activeSubs = subscriptionsList.filter(s => s.status === 'active');

  if (chartGroupMode === 'service') {
    activeSubs.forEach((sub, i) => {
      const name = sub.name || 'Unnamed';
      const monthlyVal = normalizeToMonthly(sub.amount, sub.billing_cycle, sub.custom_cycle_days);
      groupTotals[name] = (groupTotals[name] || 0) + monthlyVal;

      if (!groupColors[name]) {
        const brand = typeof detectBrandInfo === 'function' ? detectBrandInfo(name) : { color: defaultPalette[i % defaultPalette.length] };
        groupColors[name] = sub.brand_color && sub.brand_color !== '#6366f1' ? sub.brand_color : (brand.color || defaultPalette[i % defaultPalette.length]);
      }
    });
  } else {
    activeSubs.forEach((sub, i) => {
      const cat = sub.category || 'Subscriptions';
      const monthlyVal = normalizeToMonthly(sub.amount, sub.billing_cycle, sub.custom_cycle_days);
      groupTotals[cat] = (groupTotals[cat] || 0) + monthlyVal;
      if (!groupColors[cat]) {
        groupColors[cat] = categoryColorMap[cat] || defaultPalette[i % defaultPalette.length];
      }
    });
  }

  let labels = Object.keys(groupTotals);
  let data = Object.values(groupTotals);
  let sliceColors = labels.map(l => groupColors[l] || '#6366f1');

  const totalBurn = data.reduce((acc, val) => acc + val, 0);

  if (subCategoryChart) {
    subCategoryChart.destroy();
    subCategoryChart = null;
  }

  const isEmpty = labels.length === 0 || totalBurn === 0;
  if (isEmpty) {
    labels = ['No Active Subscriptions'];
    data = [1];
    sliceColors = ['rgba(255, 255, 255, 0.08)'];
  }

  // Custom Center Label Plugin to draw live amount and subtitle inside cutout
  const centerTextPlugin = {
    id: 'centerDonutText',
    beforeDraw: function(chart) {
      const chartArea = chart.chartArea;
      if (!chartArea) return;
      const ctx = chart.ctx;
      const centerX = (chartArea.left + chartArea.right) / 2;
      const centerY = (chartArea.top + chartArea.bottom) / 2;

      ctx.save();
      const amountText = chart.config._hoverAmount || formatCurrency(totalBurn);
      const subText = chart.config._hoverLabel || (activeChartFilter ? `Filtered: ${activeChartFilter}` : 'Monthly Burn');

      // Amount text
      ctx.font = '700 1.15rem "JetBrains Mono", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(amountText, centerX, centerY - 8);

      // Subtitle text
      ctx.font = '500 0.72rem "Inter", sans-serif';
      ctx.fillStyle = activeChartFilter || chart.config._hoverLabel ? '#34d399' : '#94a3b8';
      ctx.fillText(subText, centerX, centerY + 14);

      ctx.restore();
    }
  };

  const ctx = canvas.getContext('2d');
  subCategoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: sliceColors,
        borderColor: '#09080e',
        borderWidth: 2,
        hoverOffset: isEmpty ? 0 : 8
      }]
    },
    plugins: [centerTextPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      onClick: (event, elements) => {
        if (isEmpty) return;
        if (elements && elements.length > 0) {
          const idx = elements[0].index;
          const clickedLabel = labels[idx];
          toggleChartFilter(clickedLabel);
        } else {
          clearChartFilter();
        }
      },
      onHover: (event, elements) => {
        if (isEmpty) return;
        if (elements && elements.length > 0) {
          const idx = elements[0].index;
          const val = data[idx];
          const label = labels[idx];
          const pct = totalBurn > 0 ? ((val / totalBurn) * 100).toFixed(0) : 0;
          subCategoryChart.config._hoverAmount = formatCurrency(val);
          subCategoryChart.config._hoverLabel = `${label} (${pct}%)`;
        } else {
          subCategoryChart.config._hoverAmount = null;
          subCategoryChart.config._hoverLabel = null;
        }
        subCategoryChart.draw();
      },
      plugins: {
        legend: {
          position: 'right',
          onClick: (event, legendItem) => {
            if (isEmpty) return;
            const clickedLabel = labels[legendItem.index];
            toggleChartFilter(clickedLabel);
          },
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            borderRadius: 3,
            color: '#f4f3f7',
            font: { family: 'Inter', size: 12 },
            padding: 12,
            generateLabels: function(chart) {
              const dataset = chart.data.datasets[0];
              return chart.data.labels.map((lbl, i) => {
                const val = dataset.data[i] || 0;
                const pct = totalBurn > 0 && !isEmpty ? ` (${((val / totalBurn) * 100).toFixed(0)}%)` : '';
                const isSelected = activeChartFilter === lbl;
                return {
                  text: `${lbl}${pct}`,
                  fillStyle: dataset.backgroundColor[i],
                  strokeStyle: isSelected ? '#ffffff' : '#09080e',
                  lineWidth: isSelected ? 2 : 1,
                  hidden: false,
                  index: i
                };
              });
            }
          }
        },
        tooltip: {
          enabled: !isEmpty,
          callbacks: {
            label: function(ctx) {
              const val = ctx.raw || 0;
              const pct = totalBurn > 0 ? ((val / totalBurn) * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${formatCurrency(val)}/mo (${pct}% of burn)`;
            }
          }
        }
      }
    }
  });
}

function setChartGroupMode(mode) {
  if (chartGroupMode === mode) return;
  chartGroupMode = mode;
  activeChartFilter = null;
  renderCategoryDonut();
  renderSubscriptionsList();
}

function toggleChartFilter(label) {
  if (activeChartFilter === label) {
    activeChartFilter = null;
  } else {
    activeChartFilter = label;
  }
  renderSubscriptionsList();
  if (subCategoryChart) subCategoryChart.draw();
}

function clearChartFilter() {
  activeChartFilter = null;
  renderSubscriptionsList();
  if (subCategoryChart) subCategoryChart.draw();
}

/**
 * 4.5 In-App Proactive Renewal Toast Reminders
 */
function checkAndDisplayRenewalToasts() {
  const container = document.getElementById('subAlertContainer');
  if (!container) return;

  container.innerHTML = '';

  const imminentSubs = subscriptionsList.filter(s => {
    if (s.status !== 'active') return false;
    const days = getDaysUntil(s.next_billing_date);
    const threshold = s.reminder_days_before || 3;
    return days >= 0 && days <= threshold;
  });

  imminentSubs.slice(0, 2).forEach(sub => {
    const days = getDaysUntil(sub.next_billing_date);
    const dayText = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;

    const toast = document.createElement('div');
    toast.className = 'sub-toast';
    toast.innerHTML = `
      <div class="sub-toast-icon" style="color: #f59e0b; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
      </div>
      <div class="sub-toast-content">
        <div class="sub-toast-title">Renewal Alert: ${escapeHtml(sub.name)}</div>
        <div class="sub-toast-msg">Due ${dayText} (${formatCurrency(sub.amount)}) via ${escapeHtml(sub.payment_method || 'Card')}.</div>
      </div>
      <button type="button" class="sub-toast-close" onclick="this.parentElement.remove()" title="Dismiss" aria-label="Dismiss">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;
    container.appendChild(toast);

    // Auto remove after 9 seconds
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 9000);
  });

  // Check and dispatch native 3-day device push notifications if enabled
  if (window.VaultNotifications && typeof window.VaultNotifications.checkSubscriptionReminders === 'function') {
    window.VaultNotifications.checkSubscriptionReminders(subscriptionsList);
  }
}

/**
 * 4.6 Device & Desktop 3-Day Notification Controls
 */
function initDeviceNotificationBanner() {
  const banner = document.getElementById('deviceNotifBanner');
  const headerBtn = document.getElementById('btnHeaderNotifStatus');
  const headerText = document.getElementById('headerNotifStatusText');

  if (!window.VaultNotifications || !window.VaultNotifications.isSupported()) {
    if (banner) banner.style.display = 'none';
    if (headerBtn) headerBtn.style.display = 'none';
    return;
  }

  const perm = window.VaultNotifications.getPermission();
  const isEnabled = window.VaultNotifications.isEnabled();
  const dismissed = sessionStorage.getItem('vaultwealth_notif_banner_dismissed') === 'true';

  // Header status pill
  if (headerBtn && headerText) {
    if (perm === 'granted' && isEnabled) {
      headerText.textContent = 'Alerts (3d) Active';
      headerBtn.style.borderColor = 'rgba(52, 211, 153, 0.4)';
      headerBtn.style.color = '#34d399';
    } else if (perm === 'denied') {
      headerText.textContent = 'Alerts Blocked';
      headerBtn.style.borderColor = 'rgba(244, 63, 94, 0.3)';
      headerBtn.style.color = '#fb7185';
    } else {
      headerText.textContent = 'Turn on Alerts';
      headerBtn.style.borderColor = '';
      headerBtn.style.color = '';
    }
  }

  // Show banner if permission has not been requested yet and not dismissed this session
  if (banner) {
    if (perm === 'default' && !dismissed) {
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
    }
  }
}

async function enableDeviceNotificationsFromBanner() {
  if (!window.VaultNotifications) return;
  const res = await window.VaultNotifications.requestPermission();
  const banner = document.getElementById('deviceNotifBanner');
  if (banner) banner.style.display = 'none';

  if (res === 'granted') {
    window.VaultNotifications.checkSubscriptionReminders(subscriptionsList);
    initDeviceNotificationBanner();
  } else if (res === 'denied') {
    alert('Notifications were blocked. You can enable them anytime from your browser site settings or Profile page.');
    initDeviceNotificationBanner();
  }
}

function dismissDeviceNotificationBanner() {
  sessionStorage.setItem('vaultwealth_notif_banner_dismissed', 'true');
  const banner = document.getElementById('deviceNotifBanner');
  if (banner) {
    banner.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    banner.style.opacity = '0';
    banner.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      banner.style.display = 'none';
    }, 250);
  }
}

async function handleNotificationToggleClick() {
  if (!window.VaultNotifications) return;
  const perm = window.VaultNotifications.getPermission();

  if (perm === 'granted') {
    const doTest = confirm('Device notifications are currently ACTIVE (3 days prior to renewal).\\n\\nWould you like to send a test notification right now?');
    if (doTest) {
      await window.VaultNotifications.sendTestNotification();
    }
  } else if (perm === 'default') {
    await enableDeviceNotificationsFromBanner();
  } else if (perm === 'denied') {
    alert('Notifications are currently blocked by your browser.\\n\\nTo enable them, click the lock or settings icon next to the address bar and set Notifications to "Allow", or manage them in Profile settings.');
  }
}

window.enableDeviceNotificationsFromBanner = enableDeviceNotificationsFromBanner;
window.dismissDeviceNotificationBanner = dismissDeviceNotificationBanner;
window.handleNotificationToggleClick = handleNotificationToggleClick;

// =============================================================================
// 5. CRUD Operations & State Mutators
// =============================================================================

async function handleSubscriptionFormSubmit(e) {
  e.preventDefault();

  const nameInput = document.getElementById('subFormName');
  const amountInput = document.getElementById('subFormAmount');
  const cycleSelect = document.getElementById('subFormCycle');
  const customDaysInput = document.getElementById('subFormCustomDays');
  const categorySelect = document.getElementById('subFormCategory');
  const nextDateInput = document.getElementById('subFormNextDate');
  const paymentSelect = document.getElementById('subFormPayment');
  const statusSelect = document.getElementById('subFormStatus');
  const autoLogCheckbox = document.getElementById('subFormAutoLog');
  const reminderDaysInput = document.getElementById('subFormReminderDays');
  const notesInput = document.getElementById('subFormNotes');
  const brandColorInput = document.getElementById('subFormBrandColor');

  const name = nameInput.value.trim();
  const amount = parseFloat(amountInput.value);
  const cycle = cycleSelect.value;
  const customDays = cycle === 'custom' ? parseInt(customDaysInput.value, 10) : null;
  const category = categorySelect.value || 'Subscriptions';
  const nextDate = nextDateInput.value;
  const paymentMethod = paymentSelect.value || 'Credit Card';
  const status = statusSelect.value || 'active';
  const autoLog = autoLogCheckbox ? autoLogCheckbox.checked : true;
  const reminderDays = parseInt(reminderDaysInput.value, 10) || 3;
  const descriptionText = notesInput ? notesInput.value.trim() : '';
  
  // Brand color logic
  let brandColor = brandColorInput ? brandColorInput.value : '';
  if (!brandColor || brandColor === '#6366f1') {
    brandColor = typeof detectBrandInfo === 'function' ? detectBrandInfo(name).color : '#6366f1';
  }

  if (!name || isNaN(amount) || amount <= 0 || !nextDate) {
    alert('Please enter a valid subscription name, amount, and renewal date.');
    return;
  }

  const client = getSupabaseClient();
  const user = await getCurrentUser();

  const payload = {
    name,
    amount,
    currency: 'INR',
    billing_cycle: cycle,
    custom_cycle_days: customDays,
    category,
    next_billing_date: nextDate,
    payment_method: paymentMethod,
    status,
    auto_create_transaction: autoLog,
    reminder_days_before: reminderDays,
    description: descriptionText,
    brand_color: brandColor,
    updated_at: new Date().toISOString()
  };

  if (currentEditSubId) {
    // UPDATE
    if (client && user) {
      const { data, error } = await client
        .from('subscriptions')
        .update(payload)
        .eq('id', currentEditSubId)
        .eq('user_id', user.id)
        .select();

      if (error) {
        console.error('[VaultWealth] Error updating subscription:', error);
        alert('Could not update subscription: ' + error.message);
        return;
      }

      // If subscription is linked to a transaction, keep transaction in sync
      const targetSub = subscriptionsList.find(s => String(s.id) === String(currentEditSubId));
      if (targetSub && targetSub.transaction_id) {
        try {
          await client
            .from('transactions')
            .update({
              amount: payload.amount,
              category: payload.category,
              description: payload.name,
              updated_at: new Date().toISOString()
            })
            .eq('id', targetSub.transaction_id)
            .eq('user_id', user.id);
        } catch (txErr) {
          console.warn('[VaultWealth] Could not update linked transaction:', txErr);
        }
      }
    }

    // Update local list
    const idx = subscriptionsList.findIndex(s => String(s.id) === String(currentEditSubId));
    if (idx !== -1) {
      subscriptionsList[idx] = { ...subscriptionsList[idx], ...payload, id: currentEditSubId };
    }
  } else {
    // CREATE
    if (client && user) {
      payload.user_id = user.id;
      payload.start_date = new Date().toISOString().split('T')[0];
      const { data, error } = await client
        .from('subscriptions')
        .insert([payload])
        .select();

      if (error) {
        console.error('[VaultWealth] Error creating subscription:', error);
        alert('Could not save subscription: ' + error.message);
        return;
      }
      if (data && data[0]) {
        subscriptionsList.push(data[0]);
      }
    } else {
      payload.id = 'sub-' + Date.now();
      payload.start_date = new Date().toISOString().split('T')[0];
      subscriptionsList.push(payload);
    }
  }

  saveLocalSubscriptions();
  closeSubscriptionModal();
  renderAllViews();
  window.dispatchEvent(new CustomEvent('vaultwealth:refresh'));
}

async function deleteSubscriptionConfirm(subId) {
  if (!confirm('Are you sure you want to remove this subscription from your tracker?')) return;

  const client = getSupabaseClient();
  const user = await getCurrentUser();

  if (client && user) {
    const { error } = await client
      .from('subscriptions')
      .delete()
      .eq('id', subId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[VaultWealth] Error deleting subscription:', error);
      alert('Could not delete subscription: ' + error.message);
      return;
    }
  }

  subscriptionsList = subscriptionsList.filter(s => s.id !== subId);
  saveLocalSubscriptions();
  renderAllViews();
}

async function toggleSubStatus(subId) {
  const sub = subscriptionsList.find(s => s.id === subId);
  if (!sub) return;

  const nextStatus = sub.status === 'active' ? 'paused' : 'active';
  const client = getSupabaseClient();
  const user = await getCurrentUser();

  if (client && user) {
    await client
      .from('subscriptions')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', subId)
      .eq('user_id', user.id);
  }

  sub.status = nextStatus;
  saveLocalSubscriptions();
  renderAllViews();
}

/**
 * One-click manual trigger: creates an expense transaction right away
 * and rolls the next_billing_date forward.
 */
async function logExpenseNow(subId) {
  const sub = subscriptionsList.find(s => s.id === subId);
  if (!sub) return;

  const client = getSupabaseClient();
  const user = await getCurrentUser();
  const today = new Date().toISOString().split('T')[0];
  const cleanName = (sub.name || 'Subscription').replace(/\s*\(Recurring renewal\)/gi, '').trim();

  let nextDate = advanceBillingDate(sub.next_billing_date, sub.billing_cycle, sub.custom_cycle_days);
  while (nextDate <= today) {
    nextDate = advanceBillingDate(nextDate, sub.billing_cycle, sub.custom_cycle_days);
  }

  if (client && user) {
    const txPayload = {
      user_id: user.id,
      type: 'expense',
      amount: parseFloat(sub.amount),
      category: sub.category || 'Subscriptions',
      description: `${cleanName} (Recurring renewal)`,
      transaction_date: today
    };

    const { error: txErr } = await client.from('transactions').insert([txPayload]);
    if (txErr) {
      alert('Error recording transaction: ' + txErr.message);
      return;
    }

    await client
      .from('subscriptions')
      .update({
        next_billing_date: nextDate,
        updated_at: new Date().toISOString()
      })
      .eq('id', subId)
      .eq('user_id', user.id);

    sub.next_billing_date = nextDate;
  } else {
    sub.next_billing_date = nextDate;
  }

  saveLocalSubscriptions();
  renderAllViews();

  alert(`Recorded ${formatCurrency(sub.amount)} expense for ${cleanName}. Next renewal scheduled for ${formatDisplayDate(sub.next_billing_date)}.`);
  window.dispatchEvent(new CustomEvent('vaultwealth:refresh'));
}

// =============================================================================
// 6. Modal Interactions & Event Binding
// =============================================================================

function syncSubColorSwatches(activeColor) {
  const brandColorInput = document.getElementById('subFormBrandColor');
  if (brandColorInput && activeColor) {
    brandColorInput.value = activeColor;
  }
  const swatches = document.querySelectorAll('.sub-color-swatch');
  swatches.forEach(swatch => {
    const swatchColor = swatch.getAttribute('data-color');
    if (swatchColor && activeColor && swatchColor.toLowerCase() === activeColor.toLowerCase()) {
      swatch.classList.add('active');
    } else {
      swatch.classList.remove('active');
    }
  });
}

function openAddSubscription() {
  if (typeof window.openTransactionModalWithSubscription === 'function') {
    window.openTransactionModalWithSubscription();
    return;
  }
  currentEditSubId = null;
  const modal = document.getElementById('subscriptionModal');
  const title = document.getElementById('subModalTitle');
  const form = document.getElementById('subscriptionForm');

  if (form) form.reset();
  if (title) title.textContent = 'Add New Subscription';

  // Default values
  const nextDateInput = document.getElementById('subFormNextDate');
  if (nextDateInput) {
    nextDateInput.value = new Date().toISOString().split('T')[0];
  }

  const customDaysGroup = document.getElementById('customCycleDaysGroup');
  if (customDaysGroup) customDaysGroup.style.display = 'none';

  syncSubColorSwatches('#10b981');

  if (modal) {
    modal.classList.add('active');
    document.body.classList.add('modal-open');
  }
}

function openEditSubscription(subId) {
  const sub = subscriptionsList.find(s => String(s.id) === String(subId));
  if (!sub) return;

  currentEditSubId = sub.id;
  const modal = document.getElementById('subscriptionModal');
  const title = document.getElementById('subModalTitle');

  if (title) title.textContent = `Edit Subscription — ${sub.name}`;

  const nameInput = document.getElementById('subFormName');
  if (nameInput) nameInput.value = sub.name || '';

  const amountInput = document.getElementById('subFormAmount');
  if (amountInput) amountInput.value = sub.amount || '';

  const cycleSelect = document.getElementById('subFormCycle');
  if (cycleSelect) cycleSelect.value = sub.billing_cycle || 'monthly';

  // Category handling with dynamic option fallback
  const catSelect = document.getElementById('subFormCategory');
  if (catSelect) {
    const targetCat = sub.category || 'Subscriptions';
    const exists = Array.from(catSelect.options).some(o => o.value === targetCat);
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = targetCat;
      opt.textContent = targetCat;
      catSelect.appendChild(opt);
    }
    catSelect.value = targetCat;
  }

  const nextDateInput = document.getElementById('subFormNextDate');
  if (nextDateInput) nextDateInput.value = sub.next_billing_date || '';

  const paySelect = document.getElementById('subFormPayment');
  if (paySelect) {
    const targetPay = sub.payment_method || 'Credit Card';
    const exists = Array.from(paySelect.options).some(o => o.value === targetPay);
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = targetPay;
      opt.textContent = targetPay;
      paySelect.appendChild(opt);
    }
    paySelect.value = targetPay;
  }

  const statusSelect = document.getElementById('subFormStatus');
  if (statusSelect) statusSelect.value = sub.status || 'active';
  
  const autoLog = document.getElementById('subFormAutoLog');
  if (autoLog) autoLog.checked = sub.auto_create_transaction !== false;

  const reminder = document.getElementById('subFormReminderDays');
  if (reminder) reminder.value = sub.reminder_days_before !== undefined ? sub.reminder_days_before : 3;

  const notes = document.getElementById('subFormNotes');
  if (notes) notes.value = sub.description || sub.notes || '';

  const targetColor = sub.brand_color || '#10b981';
  syncSubColorSwatches(targetColor);

  const customDaysGroup = document.getElementById('customCycleDaysGroup');
  const customDaysInput = document.getElementById('subFormCustomDays');
  if (sub.billing_cycle === 'custom') {
    if (customDaysGroup) customDaysGroup.style.display = 'block';
    if (customDaysInput) customDaysInput.value = sub.custom_cycle_days || 30;
  } else {
    if (customDaysGroup) customDaysGroup.style.display = 'none';
  }

  if (modal) {
    modal.classList.add('active');
    document.body.classList.add('modal-open');
  }
}

function closeSubscriptionModal() {
  const modal = document.getElementById('subscriptionModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
  }
  currentEditSubId = null;
}

function initSubEventListeners() {
  // Search input
  const searchInput = document.getElementById('subSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      activeSearchQuery = e.target.value.trim();
      renderSubscriptionsList();
    });
  }

  // Status Filter Tabs
  document.querySelectorAll('[data-status-filter]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('[data-status-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSubFilter = btn.dataset.statusFilter;
      renderSubscriptionsList();
    });
  });

  // Cycle filter dropdown
  const cycleSelect = document.getElementById('subCycleFilterSelect');
  if (cycleSelect) {
    cycleSelect.addEventListener('change', (e) => {
      activeCycleFilter = e.target.value;
      renderSubscriptionsList();
    });
  }

  // Sort dropdown
  const sortSelect = document.getElementById('subSortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      activeSortOrder = e.target.value;
      renderSubscriptionsList();
    });
  }

  // View mode toggles
  const gridViewBtn = document.getElementById('viewGridBtn');
  const tableViewBtn = document.getElementById('viewTableBtn');
  const gridContainer = document.getElementById('subscriptionsGrid');
  const tableContainer = document.getElementById('subscriptionsTableView');

  if (gridViewBtn && tableViewBtn) {
    gridViewBtn.addEventListener('click', () => {
      gridViewBtn.classList.add('active');
      tableViewBtn.classList.remove('active');
      gridContainer.style.display = 'grid';
      tableContainer.style.display = 'none';
    });

    tableViewBtn.addEventListener('click', () => {
      tableViewBtn.classList.add('active');
      gridViewBtn.classList.remove('active');
      gridContainer.style.display = 'none';
      tableContainer.style.display = 'block';
    });
  }

  // Cycle change in modal (show/hide custom days)
  const modalCycle = document.getElementById('subFormCycle');
  const customDaysGroup = document.getElementById('customCycleDaysGroup');
  if (modalCycle && customDaysGroup) {
    modalCycle.addEventListener('change', (e) => {
      customDaysGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
    });
  }

  // Modal form submit
  const subForm = document.getElementById('subscriptionForm');
  if (subForm) {
    subForm.addEventListener('submit', handleSubscriptionFormSubmit);
  }

  // Modal backdrop click
  const modal = document.getElementById('subscriptionModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeSubscriptionModal();
    });
  }

  // Escape key to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSubscriptionModal();
  });

  // Color swatch listeners
  const swatches = document.querySelectorAll('.sub-color-swatch');
  const brandColorInput = document.getElementById('subFormBrandColor');
  swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      const color = swatch.getAttribute('data-color');
      if (color) {
        syncSubColorSwatches(color);
      }
    });
  });

  if (brandColorInput) {
    brandColorInput.addEventListener('input', (e) => {
      syncSubColorSwatches(e.target.value);
    });
  }
}

// Expose modal handlers to global scope for HTML onclick attributes
window.openAddSubscription = openAddSubscription;
window.openEditSubscription = openEditSubscription;
window.closeSubscriptionModal = closeSubscriptionModal;
window.deleteSubscriptionConfirm = deleteSubscriptionConfirm;
window.toggleSubStatus = toggleSubStatus;
window.logExpenseNow = logExpenseNow;
window.loadSubscriptions = loadSubscriptions;
window.setChartGroupMode = setChartGroupMode;
window.toggleChartFilter = toggleChartFilter;
window.clearChartFilter = clearChartFilter;

window.addEventListener('vaultwealth:refresh', () => {
  if (typeof loadSubscriptions === 'function') {
    loadSubscriptions();
  }
});
