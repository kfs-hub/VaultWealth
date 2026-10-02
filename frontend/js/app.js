/**
 * VaultWealth — Core Application UI Interactions
 * Phase 3: Global Modal, Type Toggle, and Navigation Script
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavigationHighlight();
  initTransactionModal();
  initScrollBlur();
});

/**
 * 1. Highlights active navigation links matching current file URL
 */
function initNavigationHighlight() {
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('.nav-item, .mobile-nav-item');

  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href && currentPath.endsWith(href)) {
      link.classList.add('active');
    }
  });
}

/**
 * 2. Initializes the Global "+ Add / Edit Transaction" Modal
 */
function initTransactionModal() {
  const modalOverlay = document.getElementById('transactionModal');
  const openButtons = document.querySelectorAll('[data-open-modal="transactionModal"]');
  const closeButtons = document.querySelectorAll('[data-close-modal]');
  const expenseTypeBtn = document.getElementById('modalTypeExpense');
  const incomeTypeBtn = document.getElementById('modalTypeIncome');
  const categorySelect = document.getElementById('modalCategorySelect');
  const modalForm = document.getElementById('transactionModalForm');
  const modalDateInput = document.getElementById('modalDate');

  if (!modalOverlay) return;

  // Set default date to today in YYYY-MM-DD
  if (modalDateInput && !modalDateInput.value) {
    const today = new Date().toISOString().split('T')[0];
    modalDateInput.value = today;
  }

  // Open modal triggers
  openButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(modalOverlay);
    });
  });

  // Close modal triggers
  closeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal(modalOverlay);
    });
  });

  // Close when clicking dark backdrop outside modal box
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closeModal(modalOverlay);
    }
  });

  // Close on Escape key press
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
      closeModal(modalOverlay);
    }
  });

  // Type Toggle: Income vs Expense
  let currentType = 'expense';

  function populateCategories(type) {
    if (!categorySelect || typeof CATEGORIES === 'undefined') return;
    categorySelect.innerHTML = '';
    
    const list = CATEGORIES[type] || [];
    list.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.name;
      option.textContent = `${cat.icon} ${cat.name}`;
      categorySelect.appendChild(option);
    });
  }

  if (expenseTypeBtn && incomeTypeBtn) {
    expenseTypeBtn.addEventListener('click', () => {
      currentType = 'expense';
      expenseTypeBtn.className = 'type-option active-expense';
      incomeTypeBtn.className = 'type-option';
      populateCategories('expense');
    });

    incomeTypeBtn.addEventListener('click', () => {
      currentType = 'income';
      incomeTypeBtn.className = 'type-option active-income';
      expenseTypeBtn.className = 'type-option';
      populateCategories('income');
    });

    // Populate initial categories
    populateCategories('expense');
  }

  // Modal Form Submission for all pages
  if (modalForm && !window.transactionsJsActive) {
    modalForm.addEventListener('submit', async (e) => {
      // If transactions.js is managing this page, let it handle the submission
      if (window.transactionsJsActive) return;

      e.preventDefault();
      const client = getSupabaseClient();
      if (!client) {
        alert('Supabase client not initialized. Check config.js.');
        return;
      }

      const user = await getCurrentUser();
      if (!user) {
        alert('Please sign in to record transactions.');
        window.location.href = 'login.html';
        return;
      }

      const amount = parseFloat(document.getElementById('modalAmount')?.value);
      const category = categorySelect?.value;
      const date = modalDateInput?.value;
      const description = document.getElementById('modalDescription')?.value.trim() || '';
      const submitBtn = modalForm.querySelector('button[type="submit"]');

      if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid amount greater than 0.');
        return;
      }

      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';

      try {
        const { error } = await client.from('transactions').insert([{
          user_id: user.id,
          type: currentType,
          amount: amount,
          category: category,
          transaction_date: date,
          description: description
        }]);

        if (error) throw error;

        closeModal(modalOverlay);
        modalForm.reset();
        if (modalDateInput) modalDateInput.value = new Date().toISOString().split('T')[0];

        // Dispatch global refresh event for any active page dashboards
        window.dispatchEvent(new CustomEvent('vaultwealth:refresh'));

      } catch (err) {
        console.error('[VaultWealth] Error saving transaction from modal:', err);
        alert('Failed to save transaction: ' + (err.message || err));
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }
}

function openModal(modal) {
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

/**
 * 3. Scroll Blur Animation Controller
 * - Dynamic Sticky Header Blur on Scroll
 * - Viewport Blur-to-Clear Card Reveal
 */
function initScrollBlur() {
  const header = document.querySelector('.top-header');

  // Sticky Header Scroll Blur Listener
  function updateHeaderBlur() {
    if (!header) return;
    if (window.scrollY > 15) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', updateHeaderBlur, { passive: true });
  updateHeaderBlur();

  // Scroll Blur-to-Clear Intersection Observer for Cards
  const revealTargets = document.querySelectorAll(
    '.stat-card, .card, .chart-card, .insight-card, .data-table, .auth-card'
  );

  if ('IntersectionObserver' in window && revealTargets.length > 0) {
    const observerOptions = {
      root: null,
      rootMargin: '0px 0px -40px 0px',
      threshold: 0.1
    };

    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    revealTargets.forEach((el, idx) => {
      el.classList.add('scroll-blur-reveal');
      // Subtle stagger delay
      const delay = Math.min((idx % 4) * 0.08, 0.3);
      el.style.transitionDelay = `${delay}s`;
      revealObserver.observe(el);
    });
  } else {
    // Fallback if IntersectionObserver not supported
    revealTargets.forEach(el => el.classList.add('in-view'));
  }
}

/**
 * 4. Rolling Number Spring Counter Animation (from ui/rolling numbers.txt)
 * Interpolates numbers smoothly with ease-out cubic spring curve
 */
class RollingNumber {
  static animate(element, targetValue, options = {}) {
    if (!element) return;
    const duration = options.duration || 900;
    const precision = options.precision !== undefined ? options.precision : 2;
    const prefix = options.prefix || '';
    const suffix = options.suffix || '';
    const isCurrency = options.isCurrency !== false;

    // Parse current numeric value from element text
    const text = element.textContent || '';
    const cleanCurrent = text.replace(/[^0-9.-]/g, '');
    const startValue = parseFloat(cleanCurrent) || 0;
    const target = parseFloat(targetValue) || 0;
    const startTime = performance.now();

    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Quintic ease out for silky spring feel: 1 - (1 - t)^5
      const ease = 1 - Math.pow(1 - progress, 5);
      const current = startValue + (target - startValue) * ease;

      if (isCurrency && typeof formatCurrency === 'function') {
        element.textContent = formatCurrency(current);
      } else {
        element.textContent = `${prefix}${current.toFixed(precision)}${suffix}`;
      }

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        if (isCurrency && typeof formatCurrency === 'function') {
          element.textContent = formatCurrency(target);
        } else {
          element.textContent = `${prefix}${target.toFixed(precision)}${suffix}`;
        }
        if (options.onComplete) options.onComplete();
      }
    }

    requestAnimationFrame(update);
  }
}

window.RollingNumber = RollingNumber;
