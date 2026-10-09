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
  'netflix': { name: 'Netflix', color: '#E50914', letter: 'N', logo: 'netflix.svg' },
  'spotify': { name: 'Spotify', color: '#1DB954', letter: 'S', logo: 'spotify.svg' },
  'youtube': { name: 'YouTube', color: '#FF0000', letter: 'Y', logo: 'youtube.svg' },
  'aws': { name: 'AWS', color: '#FF9900', letter: 'A', logo: 'amazon-prime.svg' },
  'github': { name: 'GitHub', color: '#333333', letter: 'G', logo: 'default-subscription.svg' },
  'apple': { name: 'Apple', color: '#888888', letter: 'A', logo: 'apple.svg' },
  'icloud': { name: 'iCloud', color: '#0070C9', letter: 'iC', logo: 'apple.svg' },
  'claude': { name: 'Claude Code', color: '#D97757', letter: 'C', logo: 'claude-code.svg' },
  'chatgpt': { name: 'ChatGPT', color: '#10A37F', letter: 'AI', logo: 'default-subscription.svg' },
  'openai': { name: 'OpenAI', color: '#10A37F', letter: 'AI', logo: 'default-subscription.svg' },
  'prime': { name: 'Amazon Prime', color: '#00A8E1', letter: 'P', logo: 'amazon-prime.svg' },
  'amazon': { name: 'Amazon Prime', color: '#00A8E1', letter: 'P', logo: 'amazon-prime.svg' },
  'disney': { name: 'Disney+', color: '#113CCF', letter: 'D', logo: 'default-subscription.svg' },
  'hotstar': { name: 'Disney+ Hotstar', color: '#113CCF', letter: 'H', logo: 'default-subscription.svg' },
  'gemini': { name: 'Google Gemini', color: '#4285F4', letter: 'G', logo: 'google-gemini.svg' },
  'gpay': { name: 'Google Pay', color: '#4285F4', letter: 'GP', logo: 'google-pay.svg' },
  'google': { name: 'Google', color: '#4285F4', letter: 'G', logo: 'google.svg' },
  'meta': { name: 'Meta', color: '#0081FB', letter: 'M', logo: 'meta.svg' },
  'facebook': { name: 'Facebook', color: '#0081FB', letter: 'F', logo: 'meta.svg' },
  'instagram': { name: 'Instagram', color: '#E4405F', letter: 'IG', logo: 'meta.svg' },
  'gym': { name: 'Gym / Fitness', color: '#10B981', letter: 'G', logo: 'default-subscription.svg' },
  'fitness': { name: 'Fitness Club', color: '#10B981', letter: 'F', logo: 'default-subscription.svg' },
  'notion': { name: 'Notion', color: '#191919', letter: 'N', logo: 'default-subscription.svg' },
  'figma': { name: 'Figma', color: '#F24E1E', letter: 'F', logo: 'default-subscription.svg' },
  'linkedin': { name: 'LinkedIn Premium', color: '#0A66C2', letter: 'in', logo: 'default-subscription.svg' },
  'coursera': { name: 'Coursera Plus', color: '#0056D2', letter: 'C', logo: 'default-subscription.svg' }
};

const SUBSCRIPTION_LOGOS = [
  { id: 'default-subscription.svg', name: 'Default', file: 'default-subscription.svg' },
  { id: 'spotify.svg', name: 'Spotify', file: 'spotify.svg' },
  { id: 'netflix.svg', name: 'Netflix', file: 'netflix.svg' },
  { id: 'amazon-prime.svg', name: 'Amazon Prime', file: 'amazon-prime.svg' },
  { id: 'youtube.svg', name: 'YouTube', file: 'youtube.svg' },
  { id: 'apple.svg', name: 'Apple', file: 'apple.svg' },
  { id: 'google.svg', name: 'Google', file: 'google.svg' },
  { id: 'google-gemini.svg', name: 'Google Gemini', file: 'google-gemini.svg' },
  { id: 'google-pay.svg', name: 'Google Pay', file: 'google-pay.svg' },
  { id: 'claude-code.svg', name: 'Claude Code', file: 'claude-code.svg' },
  { id: 'meta.svg', name: 'Meta', file: 'meta.svg' }
];

function getSubscriptionLogo(subOrName, brandColor) {
  let iconVal = '';
  let subName = '';

  if (subOrName && typeof subOrName === 'object') {
    iconVal = subOrName.brand_color || subOrName.brand_icon || '';
    subName = subOrName.name || '';
  } else if (typeof subOrName === 'string') {
    subName = subOrName;
    iconVal = brandColor || '';
  }

  // Check explicit icon value if saved as SVG file
  if (iconVal && typeof iconVal === 'string') {
    const trimmed = iconVal.trim().toLowerCase();
    if (trimmed.endsWith('.svg')) {
      const cleanFile = trimmed.replace(/^.*[\\\/]/, '');
      if (cleanFile === 'default.svg' || cleanFile === 'default-subscription.svg') {
        return '/assets/subscriptions/default-subscription.svg';
      }
      return `/assets/subscriptions/${cleanFile}`;
    }
    const matched = SUBSCRIPTION_LOGOS.find(l => l.id.replace('.svg', '').toLowerCase() === trimmed);
    if (matched) {
      return `/assets/subscriptions/${matched.file}`;
    }
  }

  // Auto-detect from service / subscription name
  const clean = (subName || '').toLowerCase().trim();
  if (clean.includes('spotify')) return '/assets/subscriptions/spotify.svg';
  if (clean.includes('netflix')) return '/assets/subscriptions/netflix.svg';
  if (clean.includes('amazon') || clean.includes('prime')) return '/assets/subscriptions/amazon-prime.svg';
  if (clean.includes('youtube')) return '/assets/subscriptions/youtube.svg';
  if (clean.includes('apple') || clean.includes('icloud') || clean.includes('app store')) return '/assets/subscriptions/apple.svg';
  if (clean.includes('gemini')) return '/assets/subscriptions/google-gemini.svg';
  if (clean.includes('google pay') || clean.includes('gpay')) return '/assets/subscriptions/google-pay.svg';
  if (clean.includes('google')) return '/assets/subscriptions/google.svg';
  if (clean.includes('claude') || clean.includes('anthropic')) return '/assets/subscriptions/claude-code.svg';
  if (clean.includes('meta') || clean.includes('facebook') || clean.includes('instagram')) return '/assets/subscriptions/meta.svg';

  return '/assets/subscriptions/default-subscription.svg';
}

function getSubscriptionLogoFile(subOrName, brandColor) {
  const url = getSubscriptionLogo(subOrName, brandColor);
  const parts = url.split('/');
  return parts[parts.length - 1] || 'default-subscription.svg';
}

function detectBrandInfo(serviceName) {
  if (!serviceName) {
    return { color: '#6366f1', letter: 'S', logo: 'default-subscription.svg' };
  }
  const clean = serviceName.toLowerCase();
  for (const [key, val] of Object.entries(BRAND_METADATA)) {
    if (clean.includes(key)) {
      return val;
    }
  }
  return {
    color: '#6366f1',
    letter: (serviceName.trim()[0] || 'S').toUpperCase(),
    logo: 'default-subscription.svg'
  };
}

// Expose globally
window.SUBSCRIPTION_LOGOS = SUBSCRIPTION_LOGOS;
window.getSubscriptionLogo = getSubscriptionLogo;
window.getSubscriptionLogoFile = getSubscriptionLogoFile;
window.detectBrandInfo = detectBrandInfo;

// Empty fallback - only real user subscriptions are tracked
const MOCK_SUBSCRIPTIONS = [];



