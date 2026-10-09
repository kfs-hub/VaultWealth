/**
 * VaultWealth — Transaction Management & CRUD Operations
 * Phase 6: Supabase Dynamic Transactions Integration
 * 
 * Handles:
 * - Fetching transactions from Supabase with search and multi-filtering
 * - Creating new income and expense records
 * - Editing existing records
 * - Deleting records
 * - Dynamic table rendering with category badges, icons, and pagination
 */

// Flag to inform app.js that transactions.js handles the modal on this page
window.transactionsJsActive = true;

// Safe stub for backwards compatibility
window.initTransactionTable = function() {};
function initTransactionTable() {}

// Global state for transactions
let allTransactions = [];
let editingTransactionId = null;

function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

onReady(async () => {
  // Ensure user is authenticated
  const user = await requireAuth();
  if (!user) return;

  // Initialize transactions page components
  initFilterControls();
  initAddEditModalIntegration();

  // Initial fetch
  await loadTransactions();

  // Listen for refresh events (e.g. statement upload or modal submit)
  window.addEventListener('vaultwealth:refresh', async () => {
    await loadTransactions();
  });
});

/**
 * 1. Fetches all transactions for the authenticated user from Supabase
 */
async function loadTransactions() {
  window.VaultLoader?.start();
  const client = getSupabaseClient();
  const tableBody = document.getElementById('transactionsTableBody');
  const countEl = document.getElementById('txCountSpan') || document.querySelector('.table-container + div span');

  if (!client) {
    console.warn('[VaultWealth] Supabase client not available.');
    allTransactions = [];
    renderTransactionsTable([]);
    window.VaultLoader?.done();
    return;
  }

  if (tableBody) {
    tableBody.innerHTML = window.SkeletonTemplates
      ? window.SkeletonTemplates.tableRows(6, 6)
      : `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
            <span style="display: inline-flex; align-items: center; gap: 0.5rem; justify-content: center;">
              ${typeof getSvgIcon === 'function' ? getSvgIcon('spinner', 'icon-spin', { width: 18, height: 18 }) : ''}
              Loading transactions from your Vault...
            </span>
          </td>
        </tr>
      `;
  }
  if (countEl) {
    countEl.innerHTML = '<span class="skeleton skeleton-text-sm" style="width: 140px; display: inline-block;"></span>';
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      allTransactions = [];
      renderTransactionsTable([]);
      return;
    }

    const { data, error } = await client
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false });

    if (error) {
      console.error('[VaultWealth] Error fetching transactions:', error);
      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; padding: 2rem; color: var(--color-expense);">
              <span style="display: inline-flex; align-items: center; gap: 0.5rem; justify-content: center;">
                ${typeof getSvgIcon === 'function' ? getSvgIcon('warning', '', { width: 18, height: 18 }) : ''}
                Failed to load transactions: ${error.message}
              </span>
            </td>
          </tr>
        `;
      }
      return;
    }

    allTransactions = data || [];
    if (typeof window.applyTransactionFilters === 'function') {
      window.applyTransactionFilters();
    } else {
      renderTransactionsTable(allTransactions);
    }

  } catch (err) {
    console.error('[VaultWealth] Unexpected error in loadTransactions:', err);
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2rem; color: var(--color-expense);">
            <span style="display: inline-flex; align-items: center; gap: 0.5rem; justify-content: center;">
              ${typeof getSvgIcon === 'function' ? getSvgIcon('warning', '', { width: 18, height: 18 }) : ''}
              Something went wrong. Please refresh the page.
            </span>
          </td>
        </tr>
      `;
    }
  } finally {
    window.VaultLoader?.done();
  }
}

/**
 * 2. Renders transaction rows into the HTML table
 */
function renderTransactionsTable(transactions) {
  const tableBody = document.getElementById('transactionsTableBody');
  const countSpan = document.getElementById('txCountSpan') || document.querySelector('.table-container + div span');
  if (!tableBody) return;

  if (!transactions || transactions.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 3rem 1rem;">
          <div style="font-size: 2rem; margin-bottom: 0.75rem; display: flex; justify-content: center; color: var(--color-brand);">
            ${typeof getSvgIcon === 'function' ? getSvgIcon('credit-card', '', { width: 44, height: 44 }) : ''}
          </div>
          <h4 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.25rem;">No transactions found</h4>
          <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 1rem;">
            Click "+ Add Transaction" or "Upload Statement" to record your income or expenses.
          </p>
          <div style="display: flex; gap: 0.5rem; justify-content: center;">
            <button class="btn btn-secondary btn-sm" onclick="openStatementUploadModal()">
              Upload Statement
            </button>
            <button class="btn btn-primary btn-sm" data-open-modal="transactionModal">
              + Add Transaction
            </button>
          </div>
        </td>
      </tr>
    `;
    if (countSpan) countSpan.innerHTML = 'Showing <strong>0</strong> transactions';
    return;
  }

  let html = '';
  transactions.forEach(tx => {
    const isIncome = tx.type === 'income';
    const amountClass = isIncome ? 'amount-income' : 'amount-expense';
    const badgeClass = isIncome ? 'badge-income' : 'badge-category';
    const sign = isIncome ? '+' : '-';
    
    // Category icon lookup
    const catIcon = getCategoryIcon(tx.category, tx.type);
    
    // Formatted date (DD Mon YYYY)
    const dateFormatted = formatDisplayDate(tx.transaction_date);

    html += `
      <tr data-id="${tx.id}">
        <td>${dateFormatted}</td>
        <td><span class="badge ${badgeClass}">${catIcon} ${escapeHtml(tx.category)}</span></td>
        <td style="color: var(--text-primary); font-weight: 500;">
          ${escapeHtml(tx.description || '—')}
          ${(tx.description || '').includes('(Recurring renewal)') || tx.category === 'Subscriptions' ? '<span style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.68rem; padding: 1px 6px; border-radius: 999px; background: rgba(99, 102, 241, 0.15); color: #a5b4fc; margin-left: 6px; border: 1px solid rgba(99, 102, 241, 0.3);">↻ Subscription</span>' : ''}
        </td>
        <td>
          <span class="badge ${isIncome ? 'badge-income' : 'badge-expense'}">
            ${isIncome ? 'Income' : 'Expense'}
          </span>
        </td>
        <td style="text-align: right;" class="amount ${amountClass}">
          ${sign} ₹${Number(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td style="text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center; gap: 0.35rem;">
            <button class="btn-icon btn-sm" onclick="handleEditClick('${tx.id}')" title="Edit Transaction" aria-label="Edit Transaction">
              ${typeof getSvgIcon === 'function' ? getSvgIcon('edit') : 'Edit'}
            </button>
            <button class="btn-icon btn-sm" onclick="handleDeleteClick('${tx.id}')" title="Delete Transaction" aria-label="Delete Transaction" style="color: var(--color-expense);">
              ${typeof getSvgIcon === 'function' ? getSvgIcon('trash') : 'Delete'}
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tableBody.innerHTML = html;
  if (countSpan) {
    countSpan.innerHTML = `Showing <strong>${transactions.length}</strong> of <strong>${allTransactions.length}</strong> transactions`;
  }
}

/**
 * 3. Filters and Search Handlers
 */
function initFilterControls() {
  const searchInput = document.getElementById('txSearchInput');
  const typeButtons = document.querySelectorAll('[data-filter-type]');
  const categorySelect = document.getElementById('txCategoryFilter');
  const monthSelect = document.getElementById('txMonthFilter');

  let activeType = 'all';

  function applyFilters() {
    const query = (searchInput?.value || '').toLowerCase().trim();
    const category = categorySelect?.value || 'all';
    const month = monthSelect?.value || 'all';

    const filtered = allTransactions.filter(tx => {
      // 1. Type Match
      if (activeType !== 'all' && tx.type !== activeType) return false;

      // 2. Category Match
      if (category !== 'all' && !tx.category.toLowerCase().includes(category.toLowerCase())) return false;

      // 3. Month Match (YYYY-MM)
      if (month !== 'all' && !tx.transaction_date.startsWith(month)) return false;

      // 4. Search Query Match
      if (query) {
        const descMatch = (tx.description || '').toLowerCase().includes(query);
        const catMatch = tx.category.toLowerCase().includes(query);
        const amountMatch = String(tx.amount).includes(query);
        if (!descMatch && !catMatch && !amountMatch) return false;
      }

      return true;
    });

    renderTransactionsTable(filtered);
  }

  // Export filter function so loadTransactions can trigger it
  window.applyTransactionFilters = applyFilters;

  // Bind Search input
  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }

  // Bind Type segmented buttons
  typeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      typeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeType = btn.getAttribute('data-filter-type');
      applyFilters();
    });
  });

  // Bind Dropdowns
  if (categorySelect) categorySelect.addEventListener('change', applyFilters);
  if (monthSelect) monthSelect.addEventListener('change', applyFilters);
}

/**
 * 4. Integration with Global Add / Edit Modal for saving directly to Supabase
 */
function initAddEditModalIntegration() {
  const modalForm = document.getElementById('transactionModalForm');
  const modalOverlay = document.getElementById('transactionModal');
  const modalTitle = modalOverlay?.querySelector('.modal-title');
  const modalSubmitBtn = modalForm?.querySelector('button[type="submit"]');

  if (!modalForm) return;

  modalForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const client = getSupabaseClient();
    if (!client) {
      alert('Supabase client is not available. Check config.js.');
      return;
    }

    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      alert('You must be logged in to save transactions.');
      window.location.href = '/login';
      return;
    }

    // Determine type (expense, income, or subscription)
    const expenseBtn = document.getElementById('modalTypeExpense');
    const subBtn = document.getElementById('modalTypeSubscription');
    const isSub = subBtn?.classList.contains('active-subscription');
    const isExpense = expenseBtn?.classList.contains('active-expense');
    const type = isSub ? 'expense' : (isExpense ? 'expense' : 'income');

    const amount = parseFloat(document.getElementById('modalAmount').value);
    const category = document.getElementById('modalCategorySelect').value || (isSub ? 'Subscriptions' : 'Other');
    const date = document.getElementById('modalDate').value;
    const description = document.getElementById('modalDescription').value.trim();
    const cadence = document.getElementById('modalSubCadence')?.value || 'monthly';
    const nextRenewalDate = document.getElementById('modalSubNextRenewal')?.value;

    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount greater than 0.');
      return;
    }

    if (!category || !date) {
      alert('Please select both a category and transaction date.');
      return;
    }

    if (isSub && !description) {
      alert('Please enter the service or subscription name.');
      return;
    }

    // Set loading state
    const originalBtnText = modalSubmitBtn.textContent;
    modalSubmitBtn.disabled = true;
    modalSubmitBtn.textContent = 'Saving to Vault...';

    try {
      if (editingTransactionId) {
        // --- UPDATE EXISTING TRANSACTION ---
        const { error } = await client
          .from('transactions')
          .update({
            type: type,
            amount: amount,
            category: category,
            transaction_date: date,
            description: description,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingTransactionId)
          .eq('user_id', user.id);

        if (error) throw error;

        // Sync with subscriptions table
        if (typeof window.syncTransactionWithSubscriptions === 'function') {
          await window.syncTransactionWithSubscriptions(client, user, {
            action: 'update',
            txId: editingTransactionId,
            amount,
            category,
            date,
            description,
            billingCycle: cadence,
            nextRenewalDate: nextRenewalDate,
            forceSubscription: isSub
          });
        }

      } else {
        // --- INSERT NEW TRANSACTION ---
        const { data: insertedData, error } = await client
          .from('transactions')
          .insert([{
            user_id: user.id,
            type: type,
            amount: amount,
            category: category,
            transaction_date: date,
            description: description || (isSub ? 'Subscription Expense' : '')
          }])
          .select();

        if (error) throw error;

        // Sync with subscriptions table
        if (insertedData && insertedData[0] && typeof window.syncTransactionWithSubscriptions === 'function') {
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
      }

      // Reset Modal & State
      closeTransactionModal();
      editingTransactionId = null;
      if (modalTitle) modalTitle.textContent = 'Record New Transaction';
      modalForm.reset();
      if (typeof window.setTransactionModalType === 'function') {
        window.setTransactionModalType('expense');
      }

      // Refresh table or page data
      await loadTransactions();
      window.dispatchEvent(new CustomEvent('vaultwealth:refresh'));

    } catch (err) {
      console.error('[VaultWealth] Error saving transaction:', err);
      alert('Failed to save transaction: ' + (err.message || err));
    } finally {
      modalSubmitBtn.disabled = false;
      modalSubmitBtn.textContent = originalBtnText;
    }
  });
}

/**
 * 5. Pre-fills modal for Editing a Transaction
 */
window.handleEditClick = function(id) {
  const tx = allTransactions.find(t => t.id === id);
  if (!tx) return;

  editingTransactionId = tx.id;
  const modalOverlay = document.getElementById('transactionModal');
  const modalTitle = modalOverlay?.querySelector('.modal-title');
  const modalSubmitBtn = modalOverlay?.querySelector('button[type="submit"]');

  if (modalTitle) modalTitle.textContent = 'Edit Transaction';
  if (modalSubmitBtn) modalSubmitBtn.textContent = 'Update Transaction';

  // Set Type
  const expenseBtn = document.getElementById('modalTypeExpense');
  const incomeBtn = document.getElementById('modalTypeIncome');
  const categorySelect = document.getElementById('modalCategorySelect');

  if (tx.category === 'Subscriptions' && typeof window.setTransactionModalType === 'function') {
    window.setTransactionModalType('subscription');
  } else if (tx.type === 'income') {
    if (typeof window.setTransactionModalType === 'function') {
      window.setTransactionModalType('income');
    } else {
      incomeBtn?.click();
    }
  } else {
    if (typeof window.setTransactionModalType === 'function') {
      window.setTransactionModalType('expense');
    } else {
      expenseBtn?.click();
    }
  }

  // Set Form Values
  const amountInput = document.getElementById('modalAmount');
  const dateInput = document.getElementById('modalDate');
  const descInput = document.getElementById('modalDescription');

  if (amountInput) amountInput.value = tx.amount;
  if (dateInput) dateInput.value = tx.transaction_date;
  if (descInput) descInput.value = tx.description || '';

  // Select matching category option
  if (categorySelect) {
    for (let i = 0; i < categorySelect.options.length; i++) {
      if (categorySelect.options[i].value === tx.category) {
        categorySelect.selectedIndex = i;
        break;
      }
    }
  }

  // Open the modal
  if (modalOverlay) {
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

/**
 * 6. Deletes a Transaction with Confirmation
 */
window.handleDeleteClick = async function(id) {
  const tx = allTransactions.find(t => t.id === id);
  if (!tx) return;

  const confirmed = confirm(`Are you sure you want to delete this ${tx.type} record?\n\n• ${tx.category}: ₹${tx.amount} (${tx.transaction_date})\n\nThis action cannot be undone.`);
  if (!confirmed) return;

  const client = getSupabaseClient();
  if (!client) return;

  try {
    const user = await getCurrentUser();
    if (user && typeof window.syncTransactionWithSubscriptions === 'function') {
      await window.syncTransactionWithSubscriptions(client, user, {
        action: 'delete',
        txId: id
      });
    }

    const { error } = await client
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) {
      alert('Error deleting transaction: ' + error.message);
      return;
    }

    // Refresh transaction list
    await loadTransactions();

  } catch (err) {
    console.error('[VaultWealth] Error deleting transaction:', err);
    alert('An unexpected error occurred while deleting.');
  }
};

/**
 * Helper: Closes transaction modal
 */
function closeTransactionModal() {
  const modalOverlay = document.getElementById('transactionModal');
  if (modalOverlay) {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

/**
 * Helper: Looks up category SVG icon
 */
function getCategoryIcon(categoryName, type) {
  if (typeof CATEGORIES !== 'undefined') {
    const list = CATEGORIES[type] || [];
    const found = list.find(c => c.name.toLowerCase() === (categoryName || '').toLowerCase());
    if (found) {
      return typeof getSvgIcon === 'function' ? getSvgIcon(found.iconId || found.id) : (found.icon || '');
    }
  }
  const fallback = type === 'income' ? 'briefcase' : 'package';
  return typeof getSvgIcon === 'function' ? getSvgIcon(fallback) : '';
}

/**
 * Helper: Formats YYYY-MM-DD into "DD Mon YYYY"
 */
function formatDisplayDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const cleanDate = String(dateStr).split('T')[0].split(' ')[0];
    const [year, month, day] = cleanDate.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[parseInt(month, 10) - 1]} ${year}`;
  } catch {
    return dateStr;
  }
}

/**
 * Helper: Sanitizes string output for safe HTML insertion
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Global exports
window.loadTransactions = loadTransactions;
window.renderTransactionsTable = renderTransactionsTable;

