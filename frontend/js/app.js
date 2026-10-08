/**
 * VaultWealth — Core Application UI Interactions
 * Phase 3: Global Modal, Type Toggle, and Navigation Script
 */

function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

onReady(() => {
  initNavigationHighlight();
  initNavbarScroll();
  initTransactionModal();
  if (window.GlassSurface && typeof window.GlassSurface.init === 'function') {
    window.GlassSurface.init();
  }
});

/**
 * 1. Highlights active navigation links matching current file URL
 */
function initNavigationHighlight() {
  const currentPath = window.location.pathname.replace(/\.html$/, '') || '/';
  const navLinks = document.querySelectorAll('.nav-item, .mobile-nav-item');

  navLinks.forEach(link => {
    const rawHref = link.getAttribute('href');
    if (!rawHref) return;
    const href = rawHref.replace(/\.html$/, '');
    if (href === currentPath || (href !== '/' && currentPath.endsWith(href))) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

/**
 * Adds backdrop blur, compact elevation when user scrolls down
 */
function initNavbarScroll() {
  const navbar = document.querySelector('.navbar-top, .nav');
  if (!navbar) return;

  const onScroll = () => {
    if (window.scrollY > 15) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
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
      option.textContent = cat.name;
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
        window.location.href = '/login';
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
