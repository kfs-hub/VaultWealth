/**
 * VaultWealth — Smart Insights & Financial Intelligence Engine
 * 
 * Provides dynamic, algorithmic financial pattern detection, month-end
 * pacing projections, 0-100 financial health scoring, and actionable 1-click CTAs.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SmartInsightsEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 50/30/20 Categories Classification
  const NEEDS_CATEGORIES = new Set([
    'Food & Dining', 'Bills & Utilities', 'Transport', 'Healthcare', 'Education'
  ]);
  const WANTS_CATEGORIES = new Set([
    'Shopping', 'Entertainment', 'Travel', 'Subscriptions', 'Other'
  ]);

  const DISMISS_STORAGE_KEY = 'vaultwealth_dismissed_insights_v1';

  // Helper: Format INR Currency
  function formatINR(num) {
    const val = Number(num) || 0;
    return '₹' + Math.round(val).toLocaleString('en-IN');
  }

  // Helper: Escape HTML
  function escapeHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Helper: Safe date parsing
  function parseDate(dateStr) {
    if (!dateStr) return new Date();
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  // Load dismissed insights
  function getDismissedSet() {
    try {
      const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
      if (!raw) return new Map();
      const obj = JSON.parse(raw);
      const now = Date.now();
      const valid = new Map();
      for (const [id, exp] of Object.entries(obj)) {
        if (exp > now) valid.set(id, exp);
      }
      return valid;
    } catch {
      return new Map();
    }
  }

  function dismissInsight(id, days = 14) {
    try {
      const map = getDismissedSet();
      map.set(id, Date.now() + days * 24 * 60 * 60 * 1000);
      const obj = {};
      map.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn('[SmartInsights] Could not save dismissal:', e);
    }
  }

  // ===========================================================================
  // 1. Core Analytics Calculation
  // ===========================================================================
  function analyzeFinances(transactions, subscriptions = []) {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-indexed
    const dayOfMonth = today.getDate();
    const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

    const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

    let totalIncome = 0;
    let totalExpense = 0;
    let thisMonthIncome = 0;
    let thisMonthExpense = 0;
    let prevMonthExpense = 0;

    const allCatSums = {};
    const thisMonthCatSums = {};
    const prevMonthCatSums = {};
    const monthTotals = {}; // { 'YYYY-MM': { income, expense } }

    const microExpenses = []; // <= 250 in last 30 days
    let weekendExpense = 0;
    let weekdayExpense = 0;

    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    transactions.forEach(tx => {
      const amt = Math.abs(parseFloat(tx.amount) || 0);
      const type = tx.type || (amt >= 0 ? 'expense' : 'income');
      const d = parseDate(tx.transaction_date);
      const ym = (tx.transaction_date || '').substring(0, 7);

      if (ym) {
        if (!monthTotals[ym]) monthTotals[ym] = { income: 0, expense: 0 };
        if (type === 'income') monthTotals[ym].income += amt;
        else monthTotals[ym].expense += amt;
      }

      if (type === 'income') {
        totalIncome += amt;
        if (ym === monthKey) thisMonthIncome += amt;
      } else {
        totalExpense += amt;
        allCatSums[tx.category] = (allCatSums[tx.category] || 0) + amt;

        if (ym === monthKey) {
          thisMonthExpense += amt;
          thisMonthCatSums[tx.category] = (thisMonthCatSums[tx.category] || 0) + amt;
        } else if (ym === prevMonthKey) {
          prevMonthExpense += amt;
          prevMonthCatSums[tx.category] = (prevMonthCatSums[tx.category] || 0) + amt;
        }

        // Micro-transactions in last 30 days
        if (d >= thirtyDaysAgo && amt <= 250) {
          microExpenses.push(tx);
        }

        // Weekend vs weekday analysis (last 30 days)
        if (d >= thirtyDaysAgo) {
          const dayOfWeek = d.getDay(); // 0 is Sun, 6 is Sat, 5 is Fri
          if (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) {
            weekendExpense += amt;
          } else {
            weekdayExpense += amt;
          }
        }
      }
    });

    // Baseline monthly average expense from previous complete months
    const priorMonthKeys = Object.keys(monthTotals).filter(k => k < monthKey);
    let avgMonthlyExpense = 0;
    if (priorMonthKeys.length > 0) {
      const sumPrior = priorMonthKeys.reduce((acc, k) => acc + monthTotals[k].expense, 0);
      avgMonthlyExpense = sumPrior / priorMonthKeys.length;
    } else {
      avgMonthlyExpense = thisMonthExpense;
    }

    // Normalized subscription monthly burn
    let activeSubsBurn = 0;
    const upcomingRenewals = [];
    subscriptions.forEach(s => {
      if (s.status === 'active') {
        const amt = parseFloat(s.amount) || 0;
        let norm = amt;
        switch (s.billing_cycle) {
          case 'weekly': norm = amt * (52 / 12); break;
          case 'monthly': norm = amt; break;
          case 'quarterly': norm = amt / 3; break;
          case 'yearly': norm = amt / 12; break;
          case 'custom': norm = amt * (30 / (s.custom_cycle_days || 30)); break;
        }
        activeSubsBurn += norm;

        // Check renewal in next 5 days
        if (s.next_billing_date) {
          const renewDate = parseDate(s.next_billing_date);
          const diffDays = Math.ceil((renewDate - today) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays <= 5) {
            upcomingRenewals.push({ ...s, diffDays });
          }
        }
      }
    });

    // Pacing calculations
    const daysElapsed = Math.max(1, dayOfMonth);
    const dailyBurn = thisMonthExpense / daysElapsed;
    const projectedMonthExpense = dailyBurn * daysInCurrentMonth;

    // Needs vs Wants split this month
    let needsSpend = 0;
    let wantsSpend = 0;
    for (const [cat, amt] of Object.entries(thisMonthCatSums)) {
      if (NEEDS_CATEGORIES.has(cat)) needsSpend += amt;
      else wantsSpend += amt;
    }

    return {
      today,
      monthKey,
      dayOfMonth,
      daysInCurrentMonth,
      totalIncome,
      totalExpense,
      thisMonthIncome,
      thisMonthExpense,
      prevMonthExpense,
      avgMonthlyExpense,
      allCatSums,
      thisMonthCatSums,
      prevMonthCatSums,
      microExpenses,
      weekendExpense,
      weekdayExpense,
      activeSubsBurn,
      upcomingRenewals,
      dailyBurn,
      projectedMonthExpense,
      needsSpend,
      wantsSpend
    };
  }

  // ===========================================================================
  // 2. Financial Health Score (0 - 100)
  // ===========================================================================
  function calculateHealthScore(metrics) {
    const { thisMonthIncome, thisMonthExpense, projectedMonthExpense, avgMonthlyExpense, wantsSpend, activeSubsBurn } = metrics;

    // 1. Savings Velocity (0 - 30 pts)
    let savingsScore = 15;
    if (thisMonthIncome > 0) {
      const net = thisMonthIncome - thisMonthExpense;
      const rate = (net / thisMonthIncome) * 100;
      if (rate >= 25) savingsScore = 30;
      else if (rate >= 20) savingsScore = 26;
      else if (rate >= 10) savingsScore = 18;
      else if (rate > 0) savingsScore = 12;
      else savingsScore = 0;
    } else {
      // Default to neutral if no income logged yet
      savingsScore = thisMonthExpense > 0 ? 12 : 20;
    }

    // 2. Spending Pacing (0 - 25 pts)
    let pacingScore = 20;
    if (avgMonthlyExpense > 0) {
      const ratio = projectedMonthExpense / avgMonthlyExpense;
      if (ratio <= 0.95) pacingScore = 25;
      else if (ratio <= 1.05) pacingScore = 22;
      else if (ratio <= 1.2) pacingScore = 15;
      else if (ratio <= 1.4) pacingScore = 8;
      else pacingScore = 4;
    }

    // 3. 50/30/20 Budget Balance (0 - 25 pts)
    let balanceScore = 18;
    const effectiveIncome = thisMonthIncome > 0 ? thisMonthIncome : (avgMonthlyExpense || 1);
    const wantsRatio = (wantsSpend / effectiveIncome) * 100;
    if (wantsRatio <= 30) balanceScore = 25;
    else if (wantsRatio <= 40) balanceScore = 19;
    else if (wantsRatio <= 50) balanceScore = 12;
    else balanceScore = 5;

    // 4. Fixed Recurring / Subscription Burden (0 - 20 pts)
    let subsScore = 18;
    const benchmark = thisMonthIncome > 0 ? thisMonthIncome : (avgMonthlyExpense || 1);
    const subRatio = (activeSubsBurn / benchmark) * 100;
    if (subRatio <= 8) subsScore = 20;
    else if (subRatio <= 15) subsScore = 16;
    else if (subRatio <= 25) subsScore = 9;
    else subsScore = 4;

    const totalScore = Math.min(100, Math.max(0, Math.round(savingsScore + pacingScore + balanceScore + subsScore)));

    let grade = 'Healthy';
    let gradeColor = 'emerald';
    if (totalScore >= 85) { grade = 'Excellent'; gradeColor = 'emerald'; }
    else if (totalScore >= 70) { grade = 'Healthy'; gradeColor = 'cyan'; }
    else if (totalScore >= 55) { grade = 'Moderate'; gradeColor = 'amber'; }
    else { grade = 'Needs Attention'; gradeColor = 'rose'; }

    return {
      score: totalScore,
      grade,
      gradeColor,
      breakdown: {
        savings: { score: savingsScore, max: 30, label: 'Savings Rate' },
        pacing: { score: pacingScore, max: 25, label: 'Spending Pacing' },
        balance: { score: balanceScore, max: 25, label: 'Budget Balance (Needs/Wants)' },
        fixedCosts: { score: subsScore, max: 20, label: 'Recurring Burden' }
      }
    };
  }

  // ===========================================================================
  // 3. Algorithmic Detectors Generator
  // ===========================================================================
  function generateInsights(transactions, subscriptions = []) {
    if (!transactions || transactions.length === 0) {
      return {
        health: { score: 100, grade: 'Fresh Vault', gradeColor: 'emerald', breakdown: {} },
        insights: [
          {
            id: 'empty_vault',
            category: 'Getting Started',
            priority: 'ACTIONABLE',
            type: 'info',
            icon: 'lightbulb',
            title: 'Smart Insights Engine Ready',
            body: 'Once you begin logging transactions or import your bank statement, VaultWealth will detect automated spending velocity, category spikes, and savings optimizations.',
            action: { label: 'Upload Bank Statement', href: '/upload' }
          }
        ]
      };
    }

    const metrics = analyzeFinances(transactions, subscriptions);
    const health = calculateHealthScore(metrics);
    const dismissed = getDismissedSet();
    const insights = [];

    // --- Detector 1: Upcoming Renewal Alerts (High Priority) ---
    if (metrics.upcomingRenewals.length > 0) {
      const topRenewal = metrics.upcomingRenewals[0];
      const daysText = topRenewal.diffDays === 0 ? 'today' : (topRenewal.diffDays === 1 ? 'tomorrow' : `in ${topRenewal.diffDays} days`);
      insights.push({
        id: `renewal_${topRenewal.id}_${topRenewal.next_billing_date}`,
        category: 'Subscriptions',
        priority: 'HIGH IMPACT',
        type: 'warning',
        icon: 'calendar',
        title: `Upcoming Renewal: ${topRenewal.name}`,
        body: `<strong>${escapeHTML(topRenewal.name)}</strong> is scheduled to renew <strong>${daysText}</strong> for <strong>${formatINR(topRenewal.amount)}</strong>. Ensure your payment method is ready.`,
        action: { label: 'Audit Subscriptions', href: '/subscriptions' }
      });
    }

    // --- Detector 2: Month-End Pacing Predictor ---
    if (metrics.dayOfMonth >= 4 && metrics.avgMonthlyExpense > 0 && metrics.thisMonthExpense > 0) {
      const ratio = metrics.projectedMonthExpense / metrics.avgMonthlyExpense;
      if (ratio >= 1.2) {
        const overPct = Math.round((ratio - 1) * 100);
        insights.push({
          id: `pacing_high_${metrics.monthKey}`,
          category: 'Pacing Alert',
          priority: 'HIGH IMPACT',
          type: 'danger',
          icon: 'trending-up',
          title: 'High Spending Pacing',
          body: `At your current rate of <strong>${formatINR(metrics.dailyBurn)}/day</strong>, you're projected to spend <strong>${formatINR(metrics.projectedMonthExpense)}</strong> this month (+${overPct}% above your usual baseline).`,
          action: { label: 'Ask Vault AI to Trim', aiPrompt: `I am currently projected to overspend by ${overPct}% this month. Help me identify categories I can easily trim.` }
        });
      } else if (ratio <= 0.85 && metrics.dayOfMonth >= 12) {
        const savingsEst = Math.round(metrics.avgMonthlyExpense - metrics.projectedMonthExpense);
        insights.push({
          id: `pacing_good_${metrics.monthKey}`,
          category: 'Spending Win',
          priority: 'WIN',
          type: 'success',
          icon: 'target',
          title: 'Disciplined Spending Pacing',
          body: `Great discipline! You are pacing <strong>${Math.round((1 - ratio) * 100)}% lower</strong> than your typical monthly burn, putting you on track to save an extra <strong>${formatINR(savingsEst)}</strong>.`,
          action: { label: 'View Analytics', href: '/analytics' }
        });
      }
    }

    // --- Detector 3: Category Surge Anomaly ---
    for (const [cat, thisAmt] of Object.entries(metrics.thisMonthCatSums)) {
      const prevAmt = metrics.prevMonthCatSums[cat] || (metrics.allCatSums[cat] ? metrics.allCatSums[cat] / 3 : 0);
      if (prevAmt >= 400 && thisAmt >= prevAmt * 1.3 && (thisAmt - prevAmt) >= 400) {
        const surgeDiff = Math.round(thisAmt - prevAmt);
        const pctIncrease = Math.round(((thisAmt - prevAmt) / prevAmt) * 100);
        insights.push({
          id: `cat_surge_${cat}_${metrics.monthKey}`,
          category: cat,
          priority: 'ACTIONABLE',
          type: 'warning',
          icon: 'zap',
          title: `${cat} Surge (+${pctIncrease}%)`,
          body: `Spending in <strong>${escapeHTML(cat)}</strong> is <strong>${pctIncrease}% higher</strong> than last month (+${formatINR(surgeDiff)}). Consider reviewing your recent transactions in this area.`,
          action: { label: `View ${cat}`, href: `/transactions?category=${encodeURIComponent(cat)}` }
        });
        break; // Show most significant surge to prevent overwhelming
      }
    }

    // --- Detector 4: 50/30/20 Discretionary "Wants" Creep ---
    if (metrics.thisMonthExpense > 0) {
      const benchmark = metrics.thisMonthIncome > 0 ? metrics.thisMonthIncome : metrics.thisMonthExpense;
      const wantsRatio = (metrics.wantsSpend / benchmark) * 100;
      if (wantsRatio >= 40 && metrics.wantsSpend >= 1500) {
        insights.push({
          id: `wants_creep_${metrics.monthKey}`,
          category: 'Budget Health',
          priority: 'SAVINGS TIP',
          type: 'warning',
          icon: 'shopping-bag',
          title: 'Discretionary Wants Exceeding 30%',
          body: `Discretionary purchases (shopping, dining, entertainment) account for <strong>${wantsRatio.toFixed(0)}%</strong> (${formatINR(metrics.wantsSpend)}) of outflows. Trimming non-essentials can boost your savings rate.`,
          action: { label: 'Get Budget Plan', aiPrompt: 'Build me a personalized 50/30/20 budget plan based on my recent spending.' }
        });
      }
    }

    // --- Detector 5: Micro-Transaction Drain ("Latte Factor") ---
    if (metrics.microExpenses.length >= 6) {
      const totalMicro = metrics.microExpenses.reduce((s, t) => s + (Math.abs(parseFloat(t.amount)) || 0), 0);
      if (totalMicro >= 800) {
        insights.push({
          id: `latte_factor_${metrics.monthKey}`,
          category: 'Micro-Spending',
          priority: 'SAVINGS TIP',
          type: 'info',
          icon: 'coffee',
          title: 'Micro-Transaction Accumulator',
          body: `You logged <strong>${metrics.microExpenses.length} small purchases</strong> under ₹250 totaling <strong>${formatINR(totalMicro)}</strong> over the last 30 days. These quick taps silently accumulate.`,
          action: { label: 'Analyze Transactions', href: '/transactions' }
        });
      }
    }

    // --- Detector 6: Weekend Spending Surge ---
    if (metrics.weekendExpense > 0 && metrics.weekdayExpense > 0) {
      // 3 weekend days (Fri, Sat, Sun) vs 4 weekday days (Mon, Tue, Wed, Thu)
      const weekendDaily = metrics.weekendExpense / 3;
      const weekdayDaily = metrics.weekdayExpense / 4;
      if (weekendDaily >= weekdayDaily * 2.2 && metrics.weekendExpense >= 1200) {
        const spikePct = Math.round(((weekendDaily / weekdayDaily) - 1) * 100);
        insights.push({
          id: `weekend_spike_${metrics.monthKey}`,
          category: 'Behavioral Trend',
          priority: 'ACTIONABLE',
          type: 'info',
          icon: 'sun',
          title: `Weekend Spending Spike (+${spikePct}%)`,
          body: `Your daily spend on weekends is <strong>${spikePct}% higher</strong> than weekdays. Setting a dedicated weekend entertainment limit can help curb impulse buys.`,
          action: { label: 'Explore Trends', href: '/analytics' }
        });
      }
    }

    // --- Detector 7: Subscription Drag Burden ---
    if (metrics.activeSubsBurn >= 1000) {
      const annualBurn = Math.round(metrics.activeSubsBurn * 12);
      insights.push({
        id: `subs_drag_${metrics.monthKey}`,
        category: 'Recurring Costs',
        priority: 'SAVINGS TIP',
        type: 'info',
        icon: 'credit-card',
        title: 'Recurring Subscription Outflow',
        body: `Your active subscriptions total <strong>${formatINR(metrics.activeSubsBurn)} / month</strong> (projected <strong>${formatINR(annualBurn)} / year</strong>). Review services you rarely use.`,
        action: { label: 'Audit Subscriptions', href: '/subscriptions' }
      });
    }

    // --- Detector 8: Positive Win Milestone ---
    for (const [cat, thisAmt] of Object.entries(metrics.thisMonthCatSums)) {
      const prevAmt = metrics.prevMonthCatSums[cat] || 0;
      if (prevAmt >= 1000 && thisAmt <= prevAmt * 0.75 && metrics.dayOfMonth >= 15) {
        const cutPct = Math.round(((prevAmt - thisAmt) / prevAmt) * 100);
        insights.push({
          id: `cat_win_${cat}_${metrics.monthKey}`,
          category: 'Spending Win',
          priority: 'WIN',
          type: 'success',
          icon: 'award',
          title: `Cut ${cat} Spending by ${cutPct}%`,
          body: `Fantastic progress! You reduced your <strong>${escapeHTML(cat)}</strong> expenses by <strong>${cutPct}%</strong> compared to last month (${formatINR(prevAmt - thisAmt)} saved).`,
          action: { label: 'View Savings', href: '/analytics' }
        });
        break;
      }
    }

    // Filter out dismissed insights
    const activeInsights = insights.filter(item => !dismissed.has(item.id));

    // Fallback if all dismissed or none triggered
    if (activeInsights.length === 0) {
      activeInsights.push({
        id: 'steady_cadence',
        category: 'Financial Health',
        priority: 'ACTIONABLE',
        type: 'success',
        icon: 'check-circle',
        title: 'Finances in Steady Balance',
        body: 'No spending spikes or budget anomalies detected this period. Your cash flow and recurring obligations are tracking smoothly.',
        action: { label: 'View Full Analytics', href: '/analytics' }
      });
    }

    return { health, insights: activeInsights };
  }

  // ===========================================================================
  // 4. UI Rendering Helpers
  // ===========================================================================
  function renderHealthScoreBadge(health) {
    if (!health) return '';
    const { score, grade, gradeColor, breakdown } = health;

    return `
      <div class="si-health-card si-health-${gradeColor}">
        <div class="si-health-top-row">
          <div class="si-health-brand-box">
            <div class="si-health-score-ring">
              <span class="si-health-score-val">${score}</span>
              <span class="si-health-score-total">/100</span>
            </div>
            <div class="si-health-info">
              <div class="si-health-status">
                <span class="si-health-dot"></span>
                <strong>${grade} Financial Health</strong>
              </div>
              <div class="si-health-desc">
                ${score >= 80 ? 'Optimal savings velocity & balanced discretionary outflows.' : (score >= 65 ? 'Stable cash flow with identifiable savings opportunities.' : 'Spending pacing exceeds recommended benchmarks.')}
              </div>
            </div>
          </div>
          <span class="si-prio-pill si-prio-score-${gradeColor}">HEALTH SCORE</span>
        </div>
      </div>
    `;
  }

  function getIconSvg(name) {
    switch (name) {
      case 'calendar':
        return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
      case 'trending-up':
        return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>';
      case 'target':
        return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';
      case 'zap':
        return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
      case 'shopping-bag':
        return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>';
      case 'coffee':
        return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>';
      case 'sun':
        return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
      case 'credit-card':
        return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>';
      case 'award':
        return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>';
      case 'check-circle':
        return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
      default:
        return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>';
    }
  }

  function renderInsightCard(item) {
    const iconSvg = getIconSvg(item.icon);
    const priorityClass = `si-prio-${(item.priority || 'ACTIONABLE').toLowerCase().replace(/\s+/g, '-')}`;
    const typeClass = `si-type-${item.type || 'info'}`;

    let actionBtnHtml = '';
    if (item.action) {
      if (item.action.aiPrompt) {
        actionBtnHtml = `
          <button type="button" class="btn-si-action btn-si-ai" onclick="SmartInsightsEngine.askAI('${escapeHTML(item.action.aiPrompt)}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>
            ${escapeHTML(item.action.label)}
          </button>
        `;
      } else if (item.action.href) {
        actionBtnHtml = `
          <a href="${item.action.href}" class="btn-si-action">
            ${escapeHTML(item.action.label)}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </a>
        `;
      }
    }

    return `
      <div class="si-card ${typeClass}" data-id="${item.id}" data-category="${item.category || ''}" data-priority="${item.priority || ''}">
        <div class="si-card-top-row">
          <div class="si-card-brand-box">
            <div class="si-card-icon">${iconSvg}</div>
            <div class="si-card-identity">
              <h4 class="si-card-title">${item.title}</h4>
              <div class="si-card-cat-badge">
                <span class="si-cat-dot"></span>
                <span>${escapeHTML(item.category || 'General')}</span>
              </div>
            </div>
          </div>
          <div class="si-card-top-actions">
            <span class="si-prio-pill ${priorityClass}">${item.priority || 'ACTIONABLE'}</span>
            <button type="button" class="si-dismiss-btn" title="Dismiss for 14 days" onclick="SmartInsightsEngine.dismiss('${item.id}', this)" aria-label="Dismiss insight">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div class="si-card-desc">${item.body}</div>

        ${actionBtnHtml ? `<div class="si-card-footer">${actionBtnHtml}</div>` : ''}
      </div>
    `;
  }

  // ===========================================================================
  // 5. Public Controller Methods
  // ===========================================================================
  function renderDashboardWidget(transactions, subscriptions = []) {
    const container = document.getElementById('dashboardInsightsContainer');
    if (!container) return;

    const data = generateInsights(transactions, subscriptions);
    const health = data.health;
    const items = data.insights.slice(0, 3); // Top 3 most pertinent on Dashboard

    let html = renderHealthScoreBadge(health);
    html += '<div class="si-cards-list">';
    items.forEach(it => {
      html += renderInsightCard(it);
    });
    html += '</div>';

    container.innerHTML = html;
  }

  function renderAnalyticsFeed(transactions, subscriptions = []) {
    const container = document.getElementById('analyticsInsightsContainer');
    const countBadge = document.getElementById('analyticsInsightsCount');
    if (!container) return;

    const data = generateInsights(transactions, subscriptions);
    const health = data.health;
    const items = data.insights;

    if (countBadge) {
      countBadge.textContent = `${items.length} Active Insights`;
    }

    let html = renderHealthScoreBadge(health);

    // Filter pill tabs for Analytics page
    html += `
      <div class="si-filter-bar">
        <button type="button" class="si-filter-pill active" onclick="SmartInsightsEngine.filterFeed('all', this)">All (${items.length})</button>
        <button type="button" class="si-filter-pill" onclick="SmartInsightsEngine.filterFeed('alerts', this)">Alerts</button>
        <button type="button" class="si-filter-pill" onclick="SmartInsightsEngine.filterFeed('tips', this)">Opportunities</button>
        <button type="button" class="si-filter-pill" onclick="SmartInsightsEngine.filterFeed('wins', this)">Wins</button>
      </div>
      <div class="si-cards-list" id="siAnalyticsCardsList">
    `;

    items.forEach(it => {
      html += renderInsightCard(it);
    });
    html += '</div>';

    container.innerHTML = html;
  }

  function filterFeed(type, btnEl) {
    const parent = btnEl.parentElement;
    if (parent) {
      parent.querySelectorAll('.si-filter-pill').forEach(b => b.classList.remove('active'));
      btnEl.classList.add('active');
    }

    const cards = document.querySelectorAll('#siAnalyticsCardsList .si-card');
    cards.forEach(card => {
      const prio = (card.getAttribute('data-priority') || '').toUpperCase();
      if (type === 'all') {
        card.style.display = 'flex';
      } else if (type === 'alerts') {
        card.style.display = (prio === 'HIGH IMPACT' || card.classList.contains('si-type-danger') || card.classList.contains('si-type-warning')) ? 'flex' : 'none';
      } else if (type === 'tips') {
        card.style.display = (prio === 'SAVINGS TIP' || prio === 'ACTIONABLE') ? 'flex' : 'none';
      } else if (type === 'wins') {
        card.style.display = (prio === 'WIN' || card.classList.contains('si-type-success')) ? 'flex' : 'none';
      }
    });
  }

  function dismiss(id, btn) {
    dismissInsight(id);
    const card = btn.closest('.si-card');
    if (card) {
      card.style.opacity = '0';
      card.style.transform = 'scale(0.95)';
      card.style.transition = 'all 0.2s ease';
      setTimeout(() => {
        card.remove();
        // If no more cards in container, show empty state
        const list = document.querySelector('.si-cards-list');
        if (list && list.children.length === 0) {
          list.innerHTML = `
            <div class="si-card si-type-success">
              <div class="si-card-body">
                <div class="si-card-icon">${getIconSvg('check-circle')}</div>
                <div class="si-card-text">
                  <h4 class="si-card-title">All Caught Up</h4>
                  <div class="si-card-desc">You've reviewed or dismissed all active insight recommendations for now.</div>
                </div>
              </div>
            </div>
          `;
        }
      }, 200);
    }
  }

  function askAI(prompt) {
    if (typeof window.openVaultAssistant === 'function') {
      window.openVaultAssistant(prompt);
    } else {
      const launcher = document.getElementById('vwChatLauncher');
      if (launcher) {
        launcher.click();
        setTimeout(() => {
          const input = document.getElementById('vwChatInput');
          const send = document.getElementById('vwChatSend');
          if (input && send) {
            input.value = prompt;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            send.click();
          }
        }, 150);
      } else {
        alert(prompt);
      }
    }
  }

  return {
    analyzeFinances,
    calculateHealthScore,
    generateInsights,
    renderDashboardWidget,
    renderAnalyticsFeed,
    filterFeed,
    dismiss,
    askAI
  };
});
