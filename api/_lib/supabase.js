/**
 * VaultWealth — Server-side Supabase REST helpers (no SDK dependency).
 *
 * Every request is made with the *user's* access token, so the existing
 * Row Level Security policies still apply: the assistant can only ever
 * see / write the signed-in user's own rows.
 */

// The anon/publishable key is public by design (it already ships in frontend/js/config.js).
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://czdnalkrtvuvvevvtdds.supabase.co').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_jlg2rxNKKwarCkLLhJjeTw_xmWu24Wt';

const PAGE_SIZE = 1000;
const MAX_ROWS = 5000;

function headers(token, extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

/** Validates the JWT with Supabase Auth and returns the user, or null. */
async function getUser(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: headers(token) });
    if (!res.ok) return null;
    const user = await res.json();
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}

/**
 * Fetches the user's transactions (RLS-scoped), newest first.
 * @param {string} token
 * @param {{ start?: string, end?: string, type?: 'income'|'expense', category?: string }} filters
 */
async function fetchTransactions(token, filters = {}) {
  const params = new URLSearchParams();
  params.set('select', 'id,type,amount,category,description,transaction_date');
  params.set('order', 'transaction_date.desc,created_at.desc');
  if (filters.start) params.append('transaction_date', `gte.${filters.start}`);
  if (filters.end) params.append('transaction_date', `lte.${filters.end}`);
  if (filters.type) params.set('type', `eq.${filters.type}`);
  if (filters.category) params.set('category', `eq.${filters.category}`);

  const rows = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    const res = await fetch(`${SUPABASE_URL}/rest/v1/transactions?${params}`, { headers: headers(token) });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`Supabase query failed (${res.status}): ${msg.slice(0, 200)}`);
    }
    const page = await res.json();
    for (const r of page) rows.push({ ...r, amount: Number(r.amount) || 0 });
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

module.exports = { getUser, fetchTransactions, SUPABASE_URL };
