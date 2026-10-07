/**
 * VaultWealth Assistant — tool definitions + implementations.
 *
 * The LLM never sees raw SQL or the full ledger. It calls these typed tools,
 * the server does all the arithmetic, and only compact results go back to
 * the model, which keeps answers numerically exact and token usage low.
 */
const { fetchTransactions } = require('./supabase');

// Mirrors frontend/js/mock-data.js → CATEGORIES
const CATEGORIES = {
  expense: [
    'Food & Dining', 'Transport', 'Shopping', 'Bills & Utilities', 'Entertainment',
    'Education', 'Healthcare', 'Travel', 'Subscriptions', 'Other'
  ],
  income: [
    'Salary / Stipend', 'Freelance / Projects', 'Allowance / Pocket Money',
    'Investments / Returns', 'Other Income'
  ]
};

// Rough 50/30/20 classification used for budgeting
const NEEDS = new Set(['Food & Dining', 'Transport', 'Bills & Utilities', 'Education', 'Healthcare']);
const WANTS = new Set(['Shopping', 'Entertainment', 'Travel', 'Subscriptions', 'Other']);

// ── Date helpers (all dates are YYYY-MM-DD strings, month keys are YYYY-MM) ──
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = n => String(n).padStart(2, '0');
const toIso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parseIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const monthKey = s => s.slice(0, 7);
function monthBounds(today, offset = 0) {
  const t = parseIso(today);
  const start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + offset, 1));
  const end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + offset + 1, 0));
  return { start: toIso(start), end: toIso(end), key: toIso(start).slice(0, 7) };
}
function addDays(iso, n) { const d = parseIso(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d); }
function validDate(s) { return typeof s === 'string' && ISO_DATE.test(s) && !isNaN(parseIso(s)); }

// ── Math helpers ─────────────────────────────────────────────────────────────
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const r0 = n => Math.round(Number(n) || 0);
function totals(rows) {
  let income = 0, expense = 0;
  for (const t of rows) t.type === 'income' ? (income += t.amount) : (expense += t.amount);
  return { income: r2(income), expense: r2(expense), net: r2(income - expense), count: rows.length };
}
function byCategory(rows, type = 'expense') {
  const map = new Map();
  for (const t of rows) {
    if (t.type !== type) continue;
    const e = map.get(t.category) || { category: t.category, total: 0, count: 0 };
    e.total += t.amount; e.count += 1;
    map.set(t.category, e);
  }
  const sum = [...map.values()].reduce((a, b) => a + b.total, 0) || 1;
  return [...map.values()]
    .sort((a, b) => b.total - a.total)
    .map(e => ({ category: e.category, total: r2(e.total), count: e.count, percent: r2((e.total / sum) * 100) }));
}
function slim(t) {
  return { date: t.transaction_date, type: t.type, amount: r2(t.amount), category: t.category, description: (t.description || '').slice(0, 80) };
}
function matchCategory(input, type) {
  if (!input) return null;
  const lists = type ? [CATEGORIES[type]] : [CATEGORIES.expense, CATEGORIES.income];
  const needle = String(input).toLowerCase().trim();
  for (const list of lists) {
    const exact = list.find(c => c.toLowerCase() === needle);
    if (exact) return exact;
  }
  for (const list of lists) {
    const partial = list.find(c => c.toLowerCase().includes(needle) || needle.includes(c.toLowerCase().split(/[ /&]+/)[0]));
    if (partial) return partial;
  }
  return null;
}

/**
 * Average monthly spend per expense category across the last N *complete* months.
 * Falls back to including the current month if there's no earlier data.
 */
function categoryMonthlyAverages(rows, today, months = 3) {
  const window = [];
  for (let i = 1; i <= months; i++) window.push(monthBounds(today, -i).key);
  let scoped = rows.filter(t => window.includes(monthKey(t.transaction_date)));
  let monthCount = new Set(scoped.map(t => monthKey(t.transaction_date))).size;
  if (monthCount === 0) {
    const cur = monthBounds(today, 0).key;
    scoped = rows.filter(t => monthKey(t.transaction_date) === cur);
    monthCount = scoped.length ? 1 : 0;
  }
  const div = monthCount || 1;
  const t = totals(scoped);
  return {
    months_used: monthCount,
    avg_income: r2(t.income / div),
    avg_expense: r2(t.expense / div),
    categories: byCategory(scoped, 'expense').map(c => ({ category: c.category, avg_monthly: r2(c.total / div) }))
  };
}

// ── Tool declarations (Gemini functionDeclarations format) ───────────────────
const DATE_PROP = desc => ({ type: 'string', description: `${desc} (YYYY-MM-DD)` });

const declarations = [
  {
    name: 'get_financial_overview',
    description: "Snapshot of the user's finances: this month vs last month, all-time balance, 3-month averages, savings rate and top spending categories. Call this first for general questions like 'how am I doing?'.",
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'get_summary',
    description: 'Total income, expenses, net and transaction count for a date range.',
    parameters: {
      type: 'object',
      properties: { start_date: DATE_PROP('Range start'), end_date: DATE_PROP('Range end, inclusive') },
      required: ['start_date', 'end_date']
    }
  },
  {
    name: 'get_category_breakdown',
    description: 'Totals per category (with share %) for a date range.',
    parameters: {
      type: 'object',
      properties: {
        start_date: DATE_PROP('Range start'),
        end_date: DATE_PROP('Range end, inclusive'),
        type: { type: 'string', enum: ['expense', 'income'], description: 'Defaults to expense' }
      },
      required: ['start_date', 'end_date']
    }
  },
  {
    name: 'search_transactions',
    description: 'Find individual transactions with optional filters. Use for "what did I spend on X", "biggest purchases", "last 5 transactions".',
    parameters: {
      type: 'object',
      properties: {
        start_date: DATE_PROP('Optional range start'),
        end_date: DATE_PROP('Optional range end'),
        type: { type: 'string', enum: ['expense', 'income'] },
        category: { type: 'string', description: `One of: ${[...CATEGORIES.expense, ...CATEGORIES.income].join(', ')}` },
        keyword: { type: 'string', description: 'Case-insensitive match on description' },
        sort: { type: 'string', enum: ['recent', 'largest'], description: 'Defaults to recent' },
        limit: { type: 'integer', description: 'Max rows, 1–30. Defaults to 10' }
      }
    }
  },
  {
    name: 'get_monthly_trend',
    description: 'Month-by-month income, expense and net for the last N months (including the current one).',
    parameters: {
      type: 'object',
      properties: { months: { type: 'integer', description: '2–12, defaults to 6' } }
    }
  },
  {
    name: 'build_budget_plan',
    description: "Creates a personalised monthly budget from the user's real spending history using a needs/wants/savings split. Use when the user asks for a budget or spending limits.",
    parameters: {
      type: 'object',
      properties: {
        monthly_income: { type: 'number', description: 'Override income in ₹. Omit to use the 3-month average.' },
        savings_percent: { type: 'number', description: 'Target savings share of income, 5–60. Defaults to 20.' }
      }
    }
  },
  {
    name: 'plan_savings_goal',
    description: 'Plans how to save a target amount by a deadline: required monthly saving, gap vs current savings, and concrete category cuts.',
    parameters: {
      type: 'object',
      properties: {
        target_amount: { type: 'number', description: 'Goal amount in ₹' },
        months: { type: 'integer', description: 'Months to reach the goal (use this OR target_date)' },
        target_date: DATE_PROP('Deadline'),
        goal_name: { type: 'string', description: 'e.g. "new laptop", "emergency fund"' }
      },
      required: ['target_amount']
    }
  },
  {
    name: 'find_savings_opportunities',
    description: 'Scans the last ~90 days for recurring charges/subscriptions, categories trending above normal, and frequent small purchases that add up.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'draft_transaction',
    description: 'Prepares a NEW income/expense entry for the user to confirm in the UI. It does NOT save anything by itself. Use whenever the user asks to add/log/record a transaction.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['expense', 'income'] },
        amount: { type: 'number', description: 'Positive amount in ₹' },
        category: { type: 'string', description: `Expense: ${CATEGORIES.expense.join(', ')}. Income: ${CATEGORIES.income.join(', ')}` },
        date: DATE_PROP('Defaults to today'),
        description: { type: 'string', description: 'Short note, e.g. "Lunch at canteen"' }
      },
      required: ['type', 'amount', 'category']
    }
  }
];

// ── Implementations ─────────────────────────────────────────────────────────
/**
 * @param {string} name
 * @param {object} args
 * @param {{ token: string, today: string, actions: object[] }} ctx
 */
async function runTool(name, args = {}, ctx) {
  const { token, today } = ctx;

  switch (name) {
    case 'get_financial_overview': {
      const rows = await fetchTransactions(token);
      if (!rows.length) return { empty: true, note: 'The user has no transactions yet.' };
      const cur = monthBounds(today, 0);
      const prev = monthBounds(today, -1);
      const inRange = (t, b) => t.transaction_date >= b.start && t.transaction_date <= b.end;
      const curRows = rows.filter(t => inRange(t, cur));
      const prevRows = rows.filter(t => inRange(t, prev));
      const avg = categoryMonthlyAverages(rows, today, 3);
      const all = totals(rows);
      const dates = rows.map(t => t.transaction_date).sort();
      const thisMonth = totals(curRows);
      const dayOfMonth = Number(today.slice(8, 10));
      const daysInMonth = Number(cur.end.slice(8, 10));
      return {
        today,
        this_month: { ...thisMonth, label: cur.key, day_of_month: dayOfMonth, days_in_month: daysInMonth,
          projected_month_expense: r0((thisMonth.expense / Math.max(dayOfMonth, 1)) * daysInMonth) },
        last_month: { ...totals(prevRows), label: prev.key },
        all_time: { ...all, first_date: dates[0], last_date: dates[dates.length - 1] },
        three_month_avg: {
          months_used: avg.months_used, income: avg.avg_income, expense: avg.avg_expense,
          savings_rate_percent: avg.avg_income ? r2(((avg.avg_income - avg.avg_expense) / avg.avg_income) * 100) : null
        },
        top_categories_this_month: byCategory(curRows, 'expense').slice(0, 5)
      };
    }

    case 'get_summary': {
      if (!validDate(args.start_date) || !validDate(args.end_date)) return { error: 'start_date and end_date must be YYYY-MM-DD' };
      const rows = await fetchTransactions(token, { start: args.start_date, end: args.end_date });
      return { start_date: args.start_date, end_date: args.end_date, ...totals(rows) };
    }

    case 'get_category_breakdown': {
      if (!validDate(args.start_date) || !validDate(args.end_date)) return { error: 'start_date and end_date must be YYYY-MM-DD' };
      const type = args.type === 'income' ? 'income' : 'expense';
      const rows = await fetchTransactions(token, { start: args.start_date, end: args.end_date, type });
      return { start_date: args.start_date, end_date: args.end_date, type, total: totals(rows)[type], categories: byCategory(rows, type) };
    }

    case 'search_transactions': {
      const filters = {};
      if (validDate(args.start_date)) filters.start = args.start_date;
      if (validDate(args.end_date)) filters.end = args.end_date;
      if (args.type === 'income' || args.type === 'expense') filters.type = args.type;
      if (args.category) {
        const cat = matchCategory(args.category, filters.type);
        if (!cat) return { error: `Unknown category "${args.category}"` };
        filters.category = cat;
      }
      let rows = await fetchTransactions(token, filters);
      if (args.keyword) {
        const k = String(args.keyword).toLowerCase();
        rows = rows.filter(t => (t.description || '').toLowerCase().includes(k) || t.category.toLowerCase().includes(k));
      }
      if (args.sort === 'largest') rows = [...rows].sort((a, b) => b.amount - a.amount);
      const limit = Math.min(Math.max(parseInt(args.limit, 10) || 10, 1), 30);
      return { matched: rows.length, matched_total: r2(rows.reduce((s, t) => s + t.amount, 0)), transactions: rows.slice(0, limit).map(slim) };
    }

    case 'get_monthly_trend': {
      const months = Math.min(Math.max(parseInt(args.months, 10) || 6, 2), 12);
      const first = monthBounds(today, -(months - 1));
      const rows = await fetchTransactions(token, { start: first.start, end: monthBounds(today, 0).end });
      const out = [];
      for (let i = months - 1; i >= 0; i--) {
        const b = monthBounds(today, -i);
        out.push({ month: b.key, ...totals(rows.filter(t => monthKey(t.transaction_date) === b.key)) });
      }
      return { months: out };
    }

    case 'build_budget_plan': {
      const since = monthBounds(today, -3).start;
      const rows = await fetchTransactions(token, { start: since });
      const avg = categoryMonthlyAverages(rows, today, 3);
      const savingsPct = Math.min(Math.max(Number(args.savings_percent) || 20, 5), 60);
      const income = Number(args.monthly_income) > 0 ? Number(args.monthly_income) : avg.avg_income;
      if (!income) {
        return { error: 'No income data found. Ask the user for their monthly income, then call again with monthly_income.' };
      }
      const savingsTarget = income * (savingsPct / 100);
      const spendable = income - savingsTarget;
      const needsCap = Math.min(income * 0.5, spendable);
      const wantsCap = Math.max(spendable - needsCap, 0);

      const cats = new Map(avg.categories.map(c => [c.category, c.avg_monthly]));
      const needsAvg = [...cats].filter(([c]) => NEEDS.has(c)).reduce((s, [, v]) => s + v, 0);
      const wantsAvg = [...cats].filter(([c]) => WANTS.has(c)).reduce((s, [, v]) => s + v, 0);
      // If needs run over their share, trim them gently (max 10%) and take the rest out of wants
      const needsScale = needsAvg > needsCap ? Math.max(needsCap / needsAvg, 0.9) : 1;
      const needsPlanned = needsAvg * needsScale;
      const wantsBudget = Math.max(Math.min(wantsCap, spendable - needsPlanned), 0);
      const wantsScale = wantsAvg > wantsBudget && wantsAvg > 0 ? wantsBudget / wantsAvg : 1;

      const lines = CATEGORIES.expense.map(category => {
        const current = cats.get(category) || 0;
        const scale = NEEDS.has(category) ? needsScale : wantsScale;
        const limit = current ? current * scale : 0;
        return {
          category, bucket: NEEDS.has(category) ? 'need' : 'want',
          current_avg: r0(current), suggested_limit: r0(Math.ceil(limit / 50) * 50), change: r0(limit - current)
        };
      }).filter(l => l.current_avg > 0);

      const plannedSpend = lines.reduce((s, l) => s + l.suggested_limit, 0);
      return {
        based_on_months: avg.months_used,
        monthly_income: r0(income),
        income_source: Number(args.monthly_income) > 0 ? 'user_provided' : '3_month_average',
        savings_percent: savingsPct,
        targets: { needs_max: r0(needsCap), wants_max: r0(wantsCap), savings_min: r0(savingsTarget) },
        current: { needs: r0(needsAvg), wants: r0(wantsAvg), total: r0(avg.avg_expense), savings: r0(income - avg.avg_expense) },
        plan: lines,
        planned_spend: r0(plannedSpend),
        planned_savings: r0(income - plannedSpend),
        note: needsAvg > needsCap ? 'Essential spending is above 50% of income; consider ways to lower fixed costs or raise income.' : undefined
      };
    }

    case 'plan_savings_goal': {
      const target = Number(args.target_amount);
      if (!(target > 0)) return { error: 'target_amount must be a positive number' };
      let months = parseInt(args.months, 10);
      if (!(months > 0) && validDate(args.target_date)) {
        const t = parseIso(today), d = parseIso(args.target_date);
        months = Math.max((d.getUTCFullYear() - t.getUTCFullYear()) * 12 + (d.getUTCMonth() - t.getUTCMonth()), 1);
      }
      if (!(months > 0)) months = 6;
      months = Math.min(months, 120);

      const rows = await fetchTransactions(token, { start: monthBounds(today, -3).start });
      const avg = categoryMonthlyAverages(rows, today, 3);
      const required = target / months;
      const currentSavings = avg.avg_income - avg.avg_expense;
      const gap = Math.max(required - currentSavings, 0);

      // Suggest cuts from discretionary categories first (up to 35% each), then needs (up to 10%)
      const cuts = [];
      let remaining = gap;
      const ordered = [
        ...avg.categories.filter(c => WANTS.has(c.category)).map(c => ({ ...c, maxCut: 0.35 })),
        ...avg.categories.filter(c => NEEDS.has(c.category)).map(c => ({ ...c, maxCut: 0.1 }))
      ];
      for (const c of ordered) {
        if (remaining <= 0) break;
        const cut = Math.min(c.avg_monthly * c.maxCut, remaining);
        if (cut < 50) continue;
        cuts.push({ category: c.category, current_avg: r0(c.avg_monthly), cut_by: r0(cut), new_limit: r0(c.avg_monthly - cut) });
        remaining -= cut;
      }
      return {
        goal_name: args.goal_name || null,
        target_amount: r0(target),
        months,
        required_monthly_saving: r0(required),
        required_weekly_saving: r0((target / months) * 12 / 52),
        current_avg_monthly_saving: r0(currentSavings),
        monthly_gap: r0(gap),
        on_track_already: gap === 0,
        suggested_cuts: cuts,
        uncovered_after_cuts: r0(Math.max(remaining, 0)),
        months_needed_at_current_rate: currentSavings > 0 ? Math.ceil(target / currentSavings) : null
      };
    }

    case 'find_savings_opportunities': {
      const start = addDays(today, -120);
      const rows = (await fetchTransactions(token, { start, type: 'expense' }));
      if (!rows.length) return { empty: true };

      // 1) Recurring charges — same normalised description in 2+ different months with similar amounts
      const norm = s => (s || '').toLowerCase().replace(/[0-9#*/\\-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
      const groups = new Map();
      for (const t of rows) {
        const key = norm(t.description);
        if (!key || key.length < 3) continue;
        const g = groups.get(key) || { label: t.description, category: t.category, items: [] };
        g.items.push(t);
        groups.set(key, g);
      }
      const recurring = [...groups.values()]
        .map(g => {
          const months = new Set(g.items.map(t => monthKey(t.transaction_date)));
          const amounts = g.items.map(t => t.amount);
          const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
          const similar = amounts.every(a => Math.abs(a - mean) <= Math.max(mean * 0.15, 20));
          return { g, months: months.size, mean, similar };
        })
        .filter(x => x.months >= 2 && (x.similar || x.g.category === 'Subscriptions'))
        .sort((a, b) => b.mean - a.mean)
        .slice(0, 8)
        .map(x => ({ description: x.g.label.slice(0, 60), category: x.g.category, typical_amount: r0(x.mean), seen_in_months: x.months, yearly_cost: r0(x.mean * 12) }));

      // 2) Categories trending above their usual level (last 30 days vs prior 90-day monthly avg)
      const last30Start = addDays(today, -29);
      const recent = rows.filter(t => t.transaction_date >= last30Start);
      const prior = rows.filter(t => t.transaction_date < last30Start);
      const priorAvg = new Map(byCategory(prior).map(c => [c.category, c.total / 3]));
      const trending = byCategory(recent)
        .map(c => ({ category: c.category, last_30_days: r0(c.total), usual_monthly: r0(priorAvg.get(c.category) || 0) }))
        .filter(c => c.usual_monthly > 0 && c.last_30_days > c.usual_monthly * 1.2 && c.last_30_days - c.usual_monthly >= 200)
        .map(c => ({ ...c, over_by: c.last_30_days - c.usual_monthly }));

      // 3) Small frequent purchases (latte factor)
      const small = recent.filter(t => t.amount <= 300);
      const smallByCat = byCategory(small).slice(0, 3).map(c => ({ category: c.category, count: c.count, total: r0(c.total) }));

      return {
        window: { from: start, to: today },
        recurring_charges: recurring,
        recurring_monthly_total: r0(recurring.reduce((s, r) => s + r.typical_amount, 0)),
        categories_above_normal: trending,
        small_purchases_last_30_days: { count: small.length, total: r0(small.reduce((s, t) => s + t.amount, 0)), top_categories: smallByCat }
      };
    }

    case 'draft_transaction': {
      const type = args.type === 'income' ? 'income' : 'expense';
      const amount = r2(args.amount);
      if (!(amount > 0) || amount > 100000000) return { error: 'amount must be a positive number' };
      const category = matchCategory(args.category, type) || (type === 'income' ? 'Other Income' : 'Other');
      const date = validDate(args.date) && args.date <= addDays(today, 1) ? args.date : today;
      const draft = {
        id: `draft_${Date.now().toString(36)}_${ctx.actions.length}`,
        type, amount, category, date,
        description: String(args.description || '').slice(0, 120)
      };
      ctx.actions.push({ kind: 'confirm_transaction', draft });
      return { status: 'awaiting_user_confirmation', draft, note: 'A confirmation card is shown to the user. Nothing is saved until they press Confirm.' };
    }

    default:
      return { error: `Unknown tool ${name}` };
  }
}

module.exports = { declarations, runTool, CATEGORIES };
