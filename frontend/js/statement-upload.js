/**
 * VaultWealth — Bank Statement Upload & Review Module
 * Provides full-page overlay with:
 *  - Drag-and-drop file upload zone
 *  - Parsed transaction preview table
 *  - Inline edit & remove per row
 *  - Bulk submit to Supabase
 */

(function () {
  'use strict';

  // State
  let parsedRows = [];
  let uploadModalEl = null;

  // ─── Build the Upload Modal DOM ───

  function buildUploadModal() {
    if (document.getElementById('statementUploadModal')) {
      return document.getElementById('statementUploadModal');
    }

    const overlay = document.createElement('div');
    overlay.id = 'statementUploadModal';
    overlay.className = 'modal-overlay upload-modal-overlay';

    overlay.innerHTML = `
      <div class="modal-box upload-modal-box">
        <div class="modal-header">
          <h3 class="modal-title">
            ${typeof getSvgIcon === 'function' ? getSvgIcon('upload-cloud', '', { width: 22, height: 22 }) : ''}
            Upload Bank Statement
          </h3>
          <button type="button" class="modal-close" id="uploadModalClose" aria-label="Close upload modal">
            ${typeof getSvgIcon === 'function' ? getSvgIcon('x', '', { width: 20, height: 20 }) : '&times;'}
          </button>
        </div>

        <!-- Step 1: Upload Area -->
        <div class="modal-body upload-step" id="uploadStep1">
          <div class="upload-dropzone" id="uploadDropzone">
            <div class="upload-dropzone-icon">
              ${typeof getSvgIcon === 'function' ? getSvgIcon('upload-cloud', '', { width: 48, height: 48 }) : ''}
            </div>
            <h4 class="upload-dropzone-title">Drop your bank statement here</h4>
            <p class="upload-dropzone-subtitle">or click to browse files</p>
            <div class="upload-formats">
              <span class="upload-format-badge">
                ${typeof getSvgIcon === 'function' ? getSvgIcon('file-text', '', { width: 14, height: 14 }) : ''}
                CSV
              </span>
              <span class="upload-format-badge">
                ${typeof getSvgIcon === 'function' ? getSvgIcon('file-spreadsheet', '', { width: 14, height: 14 }) : ''}
                Excel (.xlsx)
              </span>
              <span class="upload-format-badge">
                ${typeof getSvgIcon === 'function' ? getSvgIcon('file-text', '', { width: 14, height: 14 }) : ''}
                PDF
              </span>
            </div>
            <input type="file" id="statementFileInput" accept=".csv,.xlsx,.xls,.pdf,.txt" hidden>
          </div>

          <div class="upload-info-bar">
            ${typeof getSvgIcon === 'function' ? getSvgIcon('info', '', { width: 16, height: 16 }) : ''}
            <span>Your file is processed locally — nothing is uploaded to any server until you review and confirm.</span>
          </div>
        </div>

        <!-- Step 1.5: Loading State -->
        <div class="modal-body upload-step" id="uploadStepLoading" style="display: none;">
          <div class="upload-loading-state">
            <div class="upload-loading-spinner">
              ${typeof getSvgIcon === 'function' ? getSvgIcon('spinner', 'icon-spin', { width: 40, height: 40 }) : ''}
            </div>
            <h4>Parsing your statement...</h4>
            <p class="upload-loading-filename" id="uploadLoadingFilename">processing file</p>
          </div>
        </div>

        <!-- Step 2: Review & Edit Table -->
        <div class="modal-body upload-step" id="uploadStep2" style="display: none;">
          
          <div class="upload-review-header">
            <div class="upload-review-stats">
              <div class="upload-stat">
                <span class="upload-stat-label">Transactions Found</span>
                <span class="upload-stat-value" id="reviewTotalCount">0</span>
              </div>
              <div class="upload-stat">
                <span class="upload-stat-label">Total Income</span>
                <span class="upload-stat-value income" id="reviewTotalIncome">₹0.00</span>
              </div>
              <div class="upload-stat">
                <span class="upload-stat-label">Total Expenses</span>
                <span class="upload-stat-value expense" id="reviewTotalExpenses">₹0.00</span>
              </div>
            </div>
            <div class="upload-review-actions-top">
              <button class="btn btn-secondary btn-sm" id="uploadBackBtn">
                ${typeof getSvgIcon === 'function' ? getSvgIcon('upload', '', { width: 14, height: 14 }) : ''}
                Upload Different File
              </button>
            </div>
          </div>

          <div class="upload-review-table-wrapper">
            <table class="data-table upload-review-table">
              <thead>
                <tr>
                  <th style="width: 35px;">#</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th style="text-align: right;">Amount</th>
                  <th style="text-align: center; width: 90px;">Actions</th>
                </tr>
              </thead>
              <tbody id="reviewTableBody">
              </tbody>
            </table>
          </div>

          <div class="upload-empty-state" id="uploadEmptyState" style="display: none;">
            <div class="upload-empty-icon">
              ${typeof getSvgIcon === 'function' ? getSvgIcon('alert-circle', '', { width: 40, height: 40 }) : ''}
            </div>
            <h4>No transactions to import</h4>
            <p>All transactions have been removed. Upload a different file or close this dialog.</p>
          </div>
        </div>

        <!-- Footer (shown in review step) -->
        <div class="modal-footer upload-footer" id="uploadFooter" style="display: none;">
          <div class="upload-footer-info">
            <span id="uploadSelectedCount">0 transactions</span> ready to import
          </div>
          <div class="upload-footer-buttons">
            <button type="button" class="btn btn-secondary" id="uploadCancelBtn">Cancel</button>
            <button type="button" class="btn btn-primary" id="uploadSubmitBtn">
              ${typeof getSvgIcon === 'function' ? getSvgIcon('check-circle', '', { width: 16, height: 16 }) : ''}
              Import All Transactions
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  // ─── Render Review Table ───

  function renderReviewTable() {
    const tbody = document.getElementById('reviewTableBody');
    const countEl = document.getElementById('reviewTotalCount');
    const incomeEl = document.getElementById('reviewTotalIncome');
    const expenseEl = document.getElementById('reviewTotalExpenses');
    const selectedCountEl = document.getElementById('uploadSelectedCount');
    const emptyState = document.getElementById('uploadEmptyState');
    const tableWrapper = document.querySelector('.upload-review-table-wrapper');
    const submitBtn = document.getElementById('uploadSubmitBtn');

    if (!tbody) return;

    // If no rows
    if (parsedRows.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'flex';
      if (tableWrapper) tableWrapper.style.display = 'none';
      if (submitBtn) submitBtn.disabled = true;
      if (countEl) countEl.textContent = '0';
      if (incomeEl) incomeEl.textContent = '₹0.00';
      if (expenseEl) expenseEl.textContent = '₹0.00';
      if (selectedCountEl) selectedCountEl.textContent = '0 transactions';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (tableWrapper) tableWrapper.style.display = 'block';
    if (submitBtn) submitBtn.disabled = false;

    let totalIncome = 0, totalExpense = 0;
    let html = '';

    // Build category options for select
    const expenseCategories = typeof CATEGORIES !== 'undefined' ? CATEGORIES.expense.map(c => c.name) : ['Other'];
    const incomeCategories = typeof CATEGORIES !== 'undefined' ? CATEGORIES.income.map(c => c.name) : ['Other Income'];

    parsedRows.forEach((row, idx) => {
      const isIncome = row.type === 'income';
      if (isIncome) totalIncome += row.amount;
      else totalExpense += row.amount;

      const catOptions = isIncome ? incomeCategories : expenseCategories;
      const catOptionsHtml = catOptions.map(c =>
        `<option value="${escapeAttr(c)}" ${c === row.category ? 'selected' : ''}>${escapeAttr(c)}</option>`
      ).join('');

      html += `
        <tr data-row-idx="${idx}" class="${row._editing ? 'editing-row' : ''}">
          <td class="row-num">${idx + 1}</td>
          <td>
            ${row._editing
              ? `<input type="date" class="form-control form-control-sm edit-date" value="${row.date}">`
              : `<span class="review-date">${formatReviewDate(row.date)}</span>`
            }
          </td>
          <td>
            ${row._editing
              ? `<input type="text" class="form-control form-control-sm edit-desc" value="${escapeAttr(row.description)}" placeholder="Description">`
              : `<span class="review-desc" title="${escapeAttr(row.description)}">${escapeHtml(truncateStr(row.description, 45))}</span>`
            }
          </td>
          <td>
            ${row._editing
              ? `<select class="form-control form-control-sm edit-category">${catOptionsHtml}</select>`
              : `<span class="badge ${isIncome ? 'badge-income' : 'badge-category'}">${escapeHtml(row.category)}</span>`
            }
          </td>
          <td>
            ${row._editing
              ? `<select class="form-control form-control-sm edit-type">
                   <option value="expense" ${row.type === 'expense' ? 'selected' : ''}>Expense</option>
                   <option value="income" ${row.type === 'income' ? 'selected' : ''}>Income</option>
                 </select>`
              : `<span class="badge ${isIncome ? 'badge-income' : 'badge-expense'}">${isIncome ? 'Income' : 'Expense'}</span>`
            }
          </td>
          <td style="text-align: right;">
            ${row._editing
              ? `<input type="number" class="form-control form-control-sm edit-amount" value="${row.amount}" step="0.01" min="0.01" style="text-align: right;">`
              : `<span class="amount ${isIncome ? 'amount-income' : 'amount-expense'}">${isIncome ? '+' : '-'} ₹${row.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
            }
          </td>
          <td style="text-align: center;">
            <div class="review-actions">
              ${row._editing
                ? `<button class="btn-icon btn-sm review-save-btn" data-idx="${idx}" title="Save changes" aria-label="Save">
                     ${typeof getSvgIcon === 'function' ? getSvgIcon('check', '', { width: 15, height: 15 }) : '✓'}
                   </button>
                   <button class="btn-icon btn-sm review-cancel-edit-btn" data-idx="${idx}" title="Cancel edit" aria-label="Cancel">
                     ${typeof getSvgIcon === 'function' ? getSvgIcon('x', '', { width: 15, height: 15 }) : '✗'}
                   </button>`
                : `<button class="btn-icon btn-sm review-edit-btn" data-idx="${idx}" title="Edit transaction" aria-label="Edit">
                     ${typeof getSvgIcon === 'function' ? getSvgIcon('edit', '', { width: 15, height: 15 }) : 'Edit'}
                   </button>
                   <button class="btn-icon btn-sm review-remove-btn" data-idx="${idx}" title="Remove transaction" aria-label="Remove" style="color: var(--color-expense);">
                     ${typeof getSvgIcon === 'function' ? getSvgIcon('trash', '', { width: 15, height: 15 }) : 'Del'}
                   </button>`
              }
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;

    // Update stats
    if (countEl) countEl.textContent = parsedRows.length;
    if (incomeEl) incomeEl.textContent = `₹${totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (expenseEl) expenseEl.textContent = `₹${totalExpense.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (selectedCountEl) selectedCountEl.textContent = `${parsedRows.length} transaction${parsedRows.length === 1 ? '' : 's'}`;

    // Bind row actions
    bindReviewTableActions();
  }

  // ─── Bind edit/remove/save actions ───

  function bindReviewTableActions() {
    const tbody = document.getElementById('reviewTableBody');
    if (!tbody) return;

    // Edit buttons
    tbody.querySelectorAll('.review-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        parsedRows[idx]._editing = true;
        renderReviewTable();
      });
    });

    // Remove buttons
    tbody.querySelectorAll('.review-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const row = parsedRows[idx];
        // Animate row removal
        const tr = btn.closest('tr');
        if (tr) {
          tr.classList.add('row-removing');
          setTimeout(() => {
            parsedRows.splice(idx, 1);
            renderReviewTable();
          }, 280);
        } else {
          parsedRows.splice(idx, 1);
          renderReviewTable();
        }
      });
    });

    // Save edit buttons
    tbody.querySelectorAll('.review-save-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const tr = btn.closest('tr');
        if (!tr) return;

        const newDate = tr.querySelector('.edit-date')?.value;
        const newDesc = tr.querySelector('.edit-desc')?.value;
        const newCategory = tr.querySelector('.edit-category')?.value;
        const newType = tr.querySelector('.edit-type')?.value;
        const newAmount = parseFloat(tr.querySelector('.edit-amount')?.value);

        if (newDate) parsedRows[idx].date = newDate;
        if (newDesc !== undefined) parsedRows[idx].description = newDesc;
        if (newCategory) parsedRows[idx].category = newCategory;
        if (newType) parsedRows[idx].type = newType;
        if (!isNaN(newAmount) && newAmount > 0) parsedRows[idx].amount = newAmount;

        // When type changes, re-infer category if it doesn't belong to the new type
        if (newType && typeof CATEGORIES !== 'undefined') {
          const validCats = CATEGORIES[newType]?.map(c => c.name) || [];
          if (!validCats.includes(parsedRows[idx].category)) {
            parsedRows[idx].category = typeof StatementParser !== 'undefined'
              ? StatementParser.inferCategory(parsedRows[idx].description, newType)
              : (newType === 'income' ? 'Other Income' : 'Other');
          }
        }

        delete parsedRows[idx]._editing;
        renderReviewTable();
      });
    });

    // Cancel edit buttons
    tbody.querySelectorAll('.review-cancel-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        delete parsedRows[idx]._editing;
        renderReviewTable();
      });
    });

    // Handle type change in edit mode → update category options
    tbody.querySelectorAll('.edit-type').forEach(select => {
      select.addEventListener('change', () => {
        const tr = select.closest('tr');
        const idx = parseInt(tr.dataset.rowIdx, 10);
        const newType = select.value;
        const catSelect = tr.querySelector('.edit-category');
        if (!catSelect || typeof CATEGORIES === 'undefined') return;

        const newCats = CATEGORIES[newType] || [];
        catSelect.innerHTML = newCats.map(c =>
          `<option value="${escapeAttr(c.name)}">${escapeAttr(c.name)}</option>`
        ).join('');
      });
    });
  }

  // ─── Open/Close Modal ───

  function openUploadModal() {
    uploadModalEl = buildUploadModal();
    uploadModalEl.classList.add('active');
    document.body.style.overflow = 'hidden';
    showStep('uploadStep1');
    parsedRows = [];
    bindUploadEvents();
  }

  function closeUploadModal() {
    if (uploadModalEl) {
      uploadModalEl.classList.remove('active');
      document.body.style.overflow = '';
    }
    parsedRows = [];
  }

  function showStep(stepId) {
    const steps = uploadModalEl.querySelectorAll('.upload-step');
    steps.forEach(s => s.style.display = 'none');

    const target = document.getElementById(stepId);
    if (target) target.style.display = '';

    const footer = document.getElementById('uploadFooter');
    if (footer) footer.style.display = stepId === 'uploadStep2' ? '' : 'none';
  }

  // ─── Bind All Upload Events ───

  function bindUploadEvents() {
    const closeBtn = document.getElementById('uploadModalClose');
    const cancelBtn = document.getElementById('uploadCancelBtn');
    const backBtn = document.getElementById('uploadBackBtn');
    const submitBtn = document.getElementById('uploadSubmitBtn');
    const dropzone = document.getElementById('uploadDropzone');
    const fileInput = document.getElementById('statementFileInput');

    // Close handlers
    closeBtn?.addEventListener('click', closeUploadModal);
    cancelBtn?.addEventListener('click', closeUploadModal);

    // Click backdrop to close
    uploadModalEl?.addEventListener('click', (e) => {
      if (e.target === uploadModalEl) closeUploadModal();
    });

    // Escape key
    const escHandler = (e) => {
      if (e.key === 'Escape' && uploadModalEl?.classList.contains('active')) {
        closeUploadModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Back to upload step
    backBtn?.addEventListener('click', () => {
      parsedRows = [];
      showStep('uploadStep1');
      if (fileInput) fileInput.value = '';
    });

    // Dropzone click → open file picker
    dropzone?.addEventListener('click', () => fileInput?.click());

    // Drag & Drop
    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });

    dropzone?.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });

    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        processFile(files[0]);
      }
    });

    // File input change
    fileInput?.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        processFile(fileInput.files[0]);
      }
    });

    // Submit all
    submitBtn?.addEventListener('click', handleBulkSubmit);
  }

  // ─── Process Uploaded File ───

  async function processFile(file) {
    const filenameEl = document.getElementById('uploadLoadingFilename');
    if (filenameEl) filenameEl.textContent = file.name;

    showStep('uploadStepLoading');

    try {
      if (typeof StatementParser === 'undefined') {
        throw new Error('Statement parser is not loaded.');
      }

      const rows = await StatementParser.parseStatement(file);

      if (!rows || rows.length === 0) {
        showStep('uploadStep1');
        showToast('No transactions could be extracted from this file. Please check the file format.', 'warning');
        return;
      }

      parsedRows = rows;
      showStep('uploadStep2');
      renderReviewTable();
      showToast(`Found ${rows.length} transaction${rows.length === 1 ? '' : 's'} in your statement.`, 'success');

    } catch (err) {
      console.error('[VaultWealth] Statement parse error:', err);
      showStep('uploadStep1');
      showToast(err.message || 'Failed to parse file.', 'error');
    }
  }

  // ─── Bulk Submit to Supabase ───

  async function handleBulkSubmit() {
    if (parsedRows.length === 0) return;

    const submitBtn = document.getElementById('uploadSubmitBtn');
    const originalText = submitBtn?.innerHTML;

    try {
      const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      if (!client) {
        showToast('Supabase client not available. Check your configuration.', 'error');
        return;
      }

      const user = typeof getCurrentUser === 'function' ? await getCurrentUser() : null;
      if (!user) {
        showToast('Please sign in to import transactions.', 'error');
        return;
      }

      // Set loading state
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          ${typeof getSvgIcon === 'function' ? getSvgIcon('spinner', 'icon-spin', { width: 16, height: 16 }) : ''}
          Importing ${parsedRows.length} transactions...
        `;
      }

      // Build rows for insert
      const insertRows = parsedRows
        .filter(r => !r._editing) // skip any currently being edited
        .map(r => ({
          user_id: user.id,
          type: r.type,
          amount: r.amount,
          category: r.category,
          transaction_date: r.date,
          description: r.description || ''
        }));

      // Batch insert (Supabase handles array inserts)
      const { error } = await client
        .from('transactions')
        .insert(insertRows);

      if (error) throw error;

      showToast(`Successfully imported ${insertRows.length} transaction${insertRows.length === 1 ? '' : 's'} to your Vault!`, 'success');
      closeUploadModal();

      // Refresh transaction list
      if (typeof loadTransactions === 'function') {
        await loadTransactions();
      } else {
        window.dispatchEvent(new CustomEvent('vaultwealth:refresh'));
      }

    } catch (err) {
      console.error('[VaultWealth] Bulk import error:', err);
      showToast('Failed to import transactions: ' + (err.message || err), 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        if (originalText) submitBtn.innerHTML = originalText;
      }
    }
  }

  // ─── Toast Notifications ───

  function showToast(message, type = 'info') {
    // Remove existing toasts
    document.querySelectorAll('.upload-toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `upload-toast upload-toast-${type}`;

    const iconMap = { success: 'check-circle', error: 'x-circle', warning: 'warning', info: 'info' };
    const iconName = iconMap[type] || 'info';

    toast.innerHTML = `
      <span class="upload-toast-icon">${typeof getSvgIcon === 'function' ? getSvgIcon(iconName, '', { width: 18, height: 18 }) : ''}</span>
      <span class="upload-toast-msg">${message}</span>
      <button class="upload-toast-close" aria-label="Dismiss">
        ${typeof getSvgIcon === 'function' ? getSvgIcon('x', '', { width: 14, height: 14 }) : '×'}
      </button>
    `;

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => toast.classList.add('visible'));

    // Close button
    toast.querySelector('.upload-toast-close')?.addEventListener('click', () => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    });

    // Auto dismiss
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  // ─── Helpers ───

  function formatReviewDate(dateStr) {
    if (!dateStr) return '—';
    try {
      const [year, month, day] = dateStr.split('-');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day} ${months[parseInt(month, 10) - 1]} ${year}`;
    } catch {
      return dateStr;
    }
  }

  function truncateStr(str, max) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '...' : str;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

  // ─── Init Table Stub ───

  function initTransactionTable() {
    // no-op if not already defined
  }

  // ─── Export ───
  window.openStatementUploadModal = openUploadModal;
  window.closeStatementUploadModal = closeUploadModal;
  window.initTransactionTable = initTransactionTable;

})();
