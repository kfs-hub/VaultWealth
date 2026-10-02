/**
 * VaultWealth — Core Category Constants & Formatting Helpers
 * Shared utility functions used across Dashboard, Transactions, and Analytics.
 */

const CATEGORIES = {
  expense: [
    { id: 'food', name: 'Food & Dining', icon: '🍔', color: '#f97316' },
    { id: 'transport', name: 'Transport', icon: '🚗', color: '#06b6d4' },
    { id: 'shopping', name: 'Shopping', icon: '🛍️', color: '#ec4899' },
    { id: 'bills', name: 'Bills & Utilities', icon: '💡', color: '#eab308' },
    { id: 'entertainment', name: 'Entertainment', icon: '🎬', color: '#8b5cf6' },
    { id: 'education', name: 'Education', icon: '📚', color: '#3b82f6' },
    { id: 'healthcare', name: 'Healthcare', icon: '🏥', color: '#10b981' },
    { id: 'travel', name: 'Travel', icon: '✈️', color: '#14b8a6' },
    { id: 'subscriptions', name: 'Subscriptions', icon: '🔄', color: '#6366f1' },
    { id: 'other', name: 'Other', icon: '📦', color: '#64748b' }
  ],
  income: [
    { id: 'salary', name: 'Salary / Stipend', icon: '💼', color: '#10b981' },
    { id: 'freelance', name: 'Freelance / Projects', icon: '💻', color: '#06b6d4' },
    { id: 'allowance', name: 'Allowance / Pocket Money', icon: '🎁', color: '#f59e0b' },
    { id: 'investment', name: 'Investments / Returns', icon: '📈', color: '#8b5cf6' },
    { id: 'other_income', name: 'Other Income', icon: '💵', color: '#64748b' }
  ]
};

// Formats number to Indian Rupee string (e.g. ₹50,000.00)
function formatCurrency(num) {
  const val = parseFloat(num) || 0;
  return '₹' + val.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Looks up category emoji icon
function getCategoryIcon(categoryName, type) {
  if (typeof CATEGORIES !== 'undefined') {
    const list = CATEGORIES[type] || [];
    const found = list.find(c => c.name.toLowerCase() === (categoryName || '').toLowerCase());
    if (found) return found.icon;
  }
  return type === 'income' ? '💼' : '📦';
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
