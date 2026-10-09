/**
 * VaultWealth — Core Category Constants & Formatting Helpers
 * Shared utility functions used across Dashboard, Transactions, and Analytics.
 */

const CATEGORIES = {
  expense: [
    { id: 'food', name: 'Food & Dining', iconId: 'food', color: '#f97316' },
    { id: 'transport', name: 'Transport', iconId: 'transport', color: '#06b6d4' },
    { id: 'shopping', name: 'Shopping', iconId: 'shopping', color: '#ec4899' },
    { id: 'bills', name: 'Bills & Utilities', iconId: 'bills', color: '#eab308' },
    { id: 'entertainment', name: 'Entertainment', iconId: 'entertainment', color: '#8b5cf6' },
    { id: 'education', name: 'Education', iconId: 'education', color: '#3b82f6' },
    { id: 'healthcare', name: 'Healthcare', iconId: 'healthcare', color: '#10b981' },
    { id: 'travel', name: 'Travel', iconId: 'travel', color: '#14b8a6' },
    { id: 'subscriptions', name: 'Subscriptions', iconId: 'subscriptions', color: '#6366f1' },
    { id: 'other', name: 'Other', iconId: 'package', color: '#64748b' }
  ],
  income: [
    { id: 'salary', name: 'Salary / Stipend', iconId: 'briefcase', color: '#10b981' },
    { id: 'freelance', name: 'Freelance / Projects', iconId: 'laptop', color: '#06b6d4' },
    { id: 'allowance', name: 'Allowance / Pocket Money', iconId: 'gift', color: '#f59e0b' },
    { id: 'investment', name: 'Investments / Returns', iconId: 'trending-up', color: '#8b5cf6' },
    { id: 'other_income', name: 'Other Income', iconId: 'banknote', color: '#64748b' }
  ],
  subscription: [
    { id: 'subscriptions', name: 'Subscriptions', iconId: 'subscriptions', color: '#6366f1' },
    { id: 'entertainment', name: 'Entertainment', iconId: 'entertainment', color: '#8b5cf6' },
    { id: 'bills', name: 'Bills & Utilities', iconId: 'bills', color: '#eab308' },
    { id: 'healthcare', name: 'Healthcare & Fitness', iconId: 'healthcare', color: '#10b981' },
    { id: 'education', name: 'Education', iconId: 'education', color: '#3b82f6' },
    { id: 'shopping', name: 'Shopping & Prime', iconId: 'shopping', color: '#ec4899' },
    { id: 'transport', name: 'Transport', iconId: 'transport', color: '#06b6d4' },
    { id: 'other', name: 'Other', iconId: 'package', color: '#64748b' }
  ]
};

// Bind dynamic SVG icon getter to category items
Object.values(CATEGORIES).forEach(list => {
  list.forEach(item => {
    Object.defineProperty(item, 'icon', {
      get() {
        return typeof getSvgIcon === 'function' ? getSvgIcon(this.iconId) : '';
      },
      configurable: true
    });
  });
});

// Formats number to Indian Rupee string (e.g. ₹50,000.00)
function formatCurrency(num) {
  const val = parseFloat(num) || 0;
  return '₹' + val.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Looks up category SVG icon
function getCategoryIcon(categoryName, type) {
  if (typeof CATEGORIES !== 'undefined') {
    const list = CATEGORIES[type] || [];
    const found = list.find(c => c.name.toLowerCase() === (categoryName || '').toLowerCase());
    if (found) {
      return typeof getSvgIcon === 'function' ? getSvgIcon(found.iconId || found.id) : '';
    }
  }
  const fallback = type === 'income' ? 'briefcase' : 'package';
  return typeof getSvgIcon === 'function' ? getSvgIcon(fallback) : '';
}

// Formats YYYY-MM-DD into "DD Mon YYYY"
function formatDisplayDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const [year, month, day] = dateStr.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[parseInt(month, 10) - 1]} ${year}`;
  } catch {
    return dateStr;
  }
}

// Sanitizes text output to prevent XSS attacks
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Brand Visual Database for Subscriptions
const BRAND_METADATA = {
  'netflix': { name: 'Netflix', color: '#E50914', letter: 'N' },
  'spotify': { name: 'Spotify', color: '#1DB954', letter: 'S' },
  'youtube': { name: 'YouTube', color: '#FF0000', letter: 'Y' },
  'aws': { name: 'AWS', color: '#FF9900', letter: 'A' },
  'github': { name: 'GitHub', color: '#333333', letter: 'G' },
  'apple': { name: 'Apple', color: '#888888', letter: 'A' },
  'icloud': { name: 'iCloud', color: '#0070C9', letter: 'iC' },
  'chatgpt': { name: 'ChatGPT', color: '#10A37F', letter: 'AI' },
  'openai': { name: 'OpenAI', color: '#10A37F', letter: 'AI' },
  'prime': { name: 'Amazon Prime', color: '#00A8E1', letter: 'P' },
  'amazon': { name: 'Amazon Prime', color: '#00A8E1', letter: 'P' },
  'disney': { name: 'Disney+', color: '#113CCF', letter: 'D' },
  'hotstar': { name: 'Disney+ Hotstar', color: '#113CCF', letter: 'H' },
  'gym': { name: 'Gym / Fitness', color: '#10B981', letter: 'G' },
  'fitness': { name: 'Fitness Club', color: '#10B981', letter: 'F' },
  'notion': { name: 'Notion', color: '#191919', letter: 'N' },
  'google': { name: 'Google One', color: '#4285F4', letter: 'G' },
  'figma': { name: 'Figma', color: '#F24E1E', letter: 'F' },
  'linkedin': { name: 'LinkedIn Premium', color: '#0A66C2', letter: 'in' },
  'coursera': { name: 'Coursera Plus', color: '#0056D2', letter: 'C' }
};

function detectBrandInfo(serviceName) {
  if (!serviceName) return { color: '#6366f1', letter: 'S' };
  const clean = serviceName.toLowerCase();
  for (const [key, val] of Object.entries(BRAND_METADATA)) {
    if (clean.includes(key)) {
      return val;
    }
  }
  return {
    color: '#6366f1',
    letter: (serviceName.trim()[0] || 'S').toUpperCase()
  };
}

// Empty fallback - only real user subscriptions are tracked
const MOCK_SUBSCRIPTIONS = [];


