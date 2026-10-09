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
  const subTypeBtn = document.getElementById('modalTypeSubscription');
  const subCadenceRow = document.getElementById('modalSubCadenceRow');
  const subCadenceSelect = document.getElementById('modalSubCadence');
  const subNextRenewalInput = document.getElementById('modalSubNextRenewal');
  const categorySelect = document.getElementById('modalCategorySelect');
  const modalForm = document.getElementById('transactionModalForm');
  const modalDateInput = document.getElementById('modalDate');
  const modalDateLabel = document.getElementById('modalDateLabel');
  const modalDescLabel = document.getElementById('modalDescLabel');
  const modalDescInput = document.getElementById('modalDescription');
  const modalSubmitBtn = modalForm?.querySelector('button[type="submit"]');
  const modalTitle = modalOverlay?.querySelector('.modal-title');

  if (!modalOverlay) return;

  // Set default date to today in YYYY-MM-DD
  if (modalDateInput && !modalDateInput.value) {
    const today = new Date().toISOString().split('T')[0];
    modalDateInput.value = today;
  }

  // Helper to compute renewal date
  function computeRenewalDate(baseDateStr, cycle) {
    if (!baseDateStr) return '';
    try {
      const parts = baseDateStr.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dt = new Date(y, m, d);
      switch (cycle) {
        case 'weekly':
          dt.setDate(dt.getDate() + 7);
          break;
        case 'yearly':
          dt.setFullYear(dt.getFullYear() + 1);
          break;
        case 'quarterly': {
          const expM = (dt.getMonth() + 3) % 12;
          dt.setMonth(dt.getMonth() + 3);
          if (dt.getMonth() !== expM) dt.setDate(0);
          break;
        }
        case 'monthly':
        default: {
          const expM = (dt.getMonth() + 1) % 12;
          dt.setMonth(dt.getMonth() + 1);
          if (dt.getMonth() !== expM) dt.setDate(0);
          break;
        }
      }
      const yy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      return `${yy}-${mm}-${dd}`;
    } catch {
      return '';
    }
  }

  function updateRenewalInput() {
    if (subNextRenewalInput && modalDateInput?.value) {
      const cycle = subCadenceSelect?.value || 'monthly';
      subNextRenewalInput.value = computeRenewalDate(modalDateInput.value, cycle);
    }
  }

  if (modalDateInput) {
    modalDateInput.addEventListener('change', () => {
      if (currentType === 'subscription' || categorySelect?.value === 'Subscriptions') {
        updateRenewalInput();
      }
    });
  }

  if (subCadenceSelect) {
    subCadenceSelect.addEventListener('change', () => {
      updateRenewalInput();
    });
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

  // Type Toggle: Income vs Expense vs Subscription
  let currentType = 'expense';

  function populateCategories(type) {
    if (!categorySelect || typeof CATEGORIES === 'undefined') return;
    categorySelect.innerHTML = '';

    const list = CATEGORIES[type] || CATEGORIES.expense || [];
    list.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.name;
      option.textContent = cat.name;
      if (type === 'subscription' && cat.name === 'Subscriptions') {
        option.selected = true;
      }
      categorySelect.appendChild(option);
    });
  }

  function setModalType(type) {
    currentType = type;
    if (expenseTypeBtn) expenseTypeBtn.className = 'type-option' + (type === 'expense' ? ' active-expense' : '');
    if (incomeTypeBtn) incomeTypeBtn.className = 'type-option' + (type === 'income' ? ' active-income' : '');
    if (subTypeBtn) subTypeBtn.className = 'type-option' + (type === 'subscription' ? ' active-subscription' : '');

    if (type === 'subscription') {
      if (modalTitle) modalTitle.textContent = 'Record Subscription';
      if (modalSubmitBtn) modalSubmitBtn.textContent = 'Save Subscription';
      if (subCadenceRow) subCadenceRow.style.display = 'flex';
      if (modalDescLabel) modalDescLabel.innerHTML = 'Service / Subscription Name <span style="color: #f87171;">*</span>';
      if (modalDescInput) modalDescInput.placeholder = 'e.g. Netflix, Spotify, Gym, AWS';
      if (modalDateLabel) modalDateLabel.textContent = 'Start / Payment Date';
      populateCategories('subscription');
      updateRenewalInput();
    } else {
      if (modalTitle) modalTitle.textContent = 'Record Transaction';
      if (modalSubmitBtn) modalSubmitBtn.textContent = 'Save to Vault';
      if (modalDescLabel) modalDescLabel.innerHTML = 'Description <span class="optional">(Optional)</span>';
      if (modalDescInput) modalDescInput.placeholder = type === 'expense' ? 'e.g. Lunch at bistro, cloud subscription' : 'e.g. Client invoice, monthly stipend';
      if (modalDateLabel) modalDateLabel.textContent = 'Date';
      populateCategories(type);

      if (type === 'expense' && categorySelect?.value === 'Subscriptions') {
        if (subCadenceRow) subCadenceRow.style.display = 'flex';
        updateRenewalInput();
      } else {
        if (subCadenceRow) subCadenceRow.style.display = 'none';
      }
    }
  }

  window.setTransactionModalType = setModalType;

  if (expenseTypeBtn) {
    expenseTypeBtn.addEventListener('click', () => setModalType('expense'));
  }
  if (incomeTypeBtn) {
    incomeTypeBtn.addEventListener('click', () => setModalType('income'));
  }
  if (subTypeBtn) {
    subTypeBtn.addEventListener('click', () => setModalType('subscription'));
  }

  if (categorySelect) {
    categorySelect.addEventListener('change', () => {
      if (currentType === 'expense' && categorySelect.value === 'Subscriptions') {
        if (subCadenceRow) subCadenceRow.style.display = 'flex';
        updateRenewalInput();
      } else if (currentType !== 'subscription') {
        if (subCadenceRow) subCadenceRow.style.display = 'none';
      }
    });
  }

  // Populate initial categories
  populateCategories('expense');

  // Modal Form Submission for pages without transactions.js
  if (modalForm && !window.transactionsJsActive) {
    modalForm.addEventListener('submit', async (e) => {
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

      const isSub = currentType === 'subscription';
      const txType = isSub ? 'expense' : currentType;
      const amount = parseFloat(document.getElementById('modalAmount')?.value);
      const category = categorySelect?.value || (isSub ? 'Subscriptions' : 'Other');
      const date = modalDateInput?.value;
      const description = document.getElementById('modalDescription')?.value.trim() || '';
      const cadence = subCadenceSelect?.value || 'monthly';
      const nextRenewalDate = subNextRenewalInput?.value || computeRenewalDate(date, cadence);
      const submitBtn = modalForm.querySelector('button[type="submit"]');

      if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid amount greater than 0.');
        return;
      }

      if (isSub && !description) {
        alert('Please enter the service or subscription name.');
        return;
      }

      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';

      try {
        const { data: insertedData, error } = await client.from('transactions').insert([{
          user_id: user.id,
          type: txType,
          amount: amount,
          category: category,
          transaction_date: date,
          description: description || (isSub ? 'Subscription Expense' : '')
        }]).select();

        if (error) throw error;

        // Sync with subscriptions table if type is subscription OR category is Subscriptions
        if (insertedData && insertedData[0]) {
          await window.syncTransactionWithSubscriptions(client, user, {
            action: 'insert',
            txId: insertedData[0].id,
            amount,
            category,
            date,
            description,
            billingCycle: cadence,
            nextRenewalDate: nextRenewalDate,
            forceSubscription: isSub
          });
        }

        closeModal(modalOverlay);
        modalForm.reset();
        setModalType('expense');
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

/**
 * Global helper to open transaction modal directly pre-switched to Subscription mode.
 */
window.openTransactionModalWithSubscription = function() {
  const modalOverlay = document.getElementById('transactionModal');
  if (modalOverlay) {
    if (typeof openModal === 'function') {
      openModal(modalOverlay);
    } else {
      modalOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
    if (typeof window.setTransactionModalType === 'function') {
      window.setTransactionModalType('subscription');
    }
  }
};

/**
 * Synchronizes transactions with category 'Subscriptions' (or forceSubscription = true) to the subscriptions table.
 * If category is 'Subscriptions', creates or updates a subscription record.
 * If category is changed away or deleted, removes it from the subscriptions table.
 */
window.syncTransactionWithSubscriptions = async function(client, user, params) {
  if (!client || !user) return;
  const { action, txId, amount, category, date, description, billingCycle, nextRenewalDate, forceSubscription } = params;

  // Guard: Never sync recurring renewal transactions into the subscriptions table
  const descLower = (description || '').toLowerCase();
  if (descLower.includes('(recurring renewal)') || descLower.includes('recurring renewal')) {
    return;
  }

  const isSubscriptionCat = (category || '').toLowerCase().trim() === 'subscriptions' || forceSubscription;

  try {
    if (action === 'delete') {
      await client
        .from('subscriptions')
        .delete()
        .eq('transaction_id', txId)
        .eq('user_id', user.id);

      try {
        const raw = localStorage.getItem('vaultwealth_subscriptions');
        if (raw) {
          const list = JSON.parse(raw);
          const filtered = list.filter(s => s.transaction_id !== txId);
          localStorage.setItem('vaultwealth_subscriptions', JSON.stringify(filtered));
        }
      } catch (e) {}
      return;
    }

    if (isSubscriptionCat) {
      const cycle = billingCycle || 'monthly';
      const todayStr = new Date().toISOString().split('T')[0];
      let nextDate = nextRenewalDate;
      if (!nextDate) {
        try {
          const parts = (date || todayStr).split('-');
          const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          d.setMonth(d.getMonth() + 1);
          nextDate = d.toISOString().split('T')[0];
        } catch {
          nextDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
        }
      }

      // Ensure next billing date is pushed to future if imported from a past transaction
      if (nextDate <= todayStr) {
        try {
          const d = new Date();
          d.setMonth(d.getMonth() + 1);
          nextDate = d.toISOString().split('T')[0];
        } catch {}
      }

      const subName = (description || '').trim() || 'Subscription Expense';
      const brand = typeof detectBrandInfo === 'function' ? detectBrandInfo(subName) : { color: '#6366f1' };

      const { data: existing } = await client
        .from('subscriptions')
        .select('id')
        .eq('transaction_id', txId)
        .eq('user_id', user.id);

      if (existing && existing.length > 0) {
        await client
          .from('subscriptions')
          .update({
            name: subName,
            amount: parseFloat(amount),
            billing_cycle: cycle,
            category: category || 'Subscriptions',
            next_billing_date: nextDate,
            brand_color: brand.color,
            description: description || '',
            updated_at: new Date().toISOString()
          })
          .eq('transaction_id', txId)
          .eq('user_id', user.id);
      } else {
        await client
          .from('subscriptions')
          .insert([{
            user_id: user.id,
            transaction_id: txId,
            name: subName,
            amount: parseFloat(amount),
            currency: 'INR',
            billing_cycle: cycle,
            category: category || 'Subscriptions',
            payment_method: 'Credit Card',
            next_billing_date: nextDate,
            start_date: date || todayStr,
            status: 'active',
            auto_create_transaction: false,
            reminder_days_before: 3,
            brand_color: brand.color,
            description: description || ''
          }]);
      }

      // Sync local storage fallback
      try {
        const raw = localStorage.getItem('vaultwealth_subscriptions');
        let list = raw ? JSON.parse(raw) : [];
        const idx = list.findIndex(s => s.transaction_id === txId);
        const subObj = {
          id: existing && existing[0] ? existing[0].id : ('sub-' + Date.now()),
          transaction_id: txId,
          name: subName,
          amount: parseFloat(amount),
          currency: 'INR',
          billing_cycle: cycle,
          category: category || 'Subscriptions',
          payment_method: 'Credit Card',
          next_billing_date: nextDate,
          start_date: date || new Date().toISOString().split('T')[0],
          status: 'active',
          auto_create_transaction: true,
          reminder_days_before: 3,
          brand_color: brand.color,
          description: description || ''
        };
        if (idx !== -1) {
          list[idx] = { ...list[idx], ...subObj };
        } else {
          list.push(subObj);
        }
        localStorage.setItem('vaultwealth_subscriptions', JSON.stringify(list));
      } catch (e) {}

    } else {
      await client
        .from('subscriptions')
        .delete()
        .eq('transaction_id', txId)
        .eq('user_id', user.id);

      try {
        const raw = localStorage.getItem('vaultwealth_subscriptions');
        if (raw) {
          const list = JSON.parse(raw);
          const filtered = list.filter(s => s.transaction_id !== txId);
          localStorage.setItem('vaultwealth_subscriptions', JSON.stringify(filtered));
        }
      } catch (e) {}
    }
  } catch (err) {
    console.warn('[VaultWealth] Subscription synchronization notice:', err);
  }
};

function openModal(modal) {
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

